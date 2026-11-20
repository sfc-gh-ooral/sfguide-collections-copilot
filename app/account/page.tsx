'use client';

// Account workspace: the borrower's reach heatmap (channel x time of day), DPD history, one timeline
// of payments, promises, contacts and calls, hardship eligibility, contact-limit tracking, the AI
// conversation guide, and the collector's actions (log a promise, request hardship, schedule).
import { ArrowLeft, CalendarClock, CircleDollarSign, HandHeart, MessageSquareText, Phone, Mail, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiMeta, AiPanel, Reasoning, Sources, StreamText } from '@/components/Reasoning';
import { ACTION_NAME, AXIS, BAND, BAND_SHORT, CHANNEL, ChartTip, ErrorBox, OFFER, OUTCOME, PageSkeleton, Panel, PoweredBy, REACHED, SourceChip, Tag, pct0, riskTone, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_ACCOUNTS, fetchAccount, fetchGuide, rescore, sendAction } from '@/lib/client';
import { type ActionInput, TODAY } from '@/lib/rules';
import type { AccountDetail, AiText, Rescore } from '@/lib/types';

const describe = (a: { ACTION: string; DETAIL: string }) => {
  const d = JSON.parse(a.DETAIL);
  if (a.ACTION === 'LOG_PROMISE') return `${usd(d.amount)} by ${d.date}`;
  if (a.ACTION === 'ENROLL_HARDSHIP') return `${OFFER[d.program] ?? d.program}, pending review`;
  return `${CHANNEL[d.channel]} on ${d.date}, ${BAND_SHORT[d.band]}`;
};
const BANDS = ['MORNING', 'AFTERNOON', 'EVENING'];
const CHANNELS = ['CALL', 'SMS', 'EMAIL'];

function RescorePanel({ id }: { id: string }) {
  const [r, setR] = useState<Rescore | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = () => { setBusy(true); setErr(''); rescore(id).then(setR).catch((e) => setErr(String(e.message ?? e))).finally(() => setBusy(false)); };
  return (
    <Panel title="Roll-risk model" sub="The queue uses the batch score from setup. Run the model on this account now." right={<PoweredBy>Model Registry · PREDICT_PROBA</PoweredBy>}>
      <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Scoring…' : 'Re-score now'}</button>
      {err && <div className="mt-3"><ErrorBox error={err} /></div>}
      {r && <div className="mt-3 text-sm space-y-1">
        <p><strong className="display text-lg tabular">{pct0(r.score)}</strong> roll risk from {r.model}{r.stored !== null && <> · batch score {pct0(r.stored)}</>}</p>
        <p className="text-[11px] muted">{r.source === 'live' ? `Live inference in ${(r.ms / 1000).toFixed(1)} s` : 'Sample run: replays the captured batch score'} · <span className="mono break-all">{r.sql}</span></p>
      </div>}
    </Panel>
  );
}

function Heatmap({ c }: { c: AccountDetail }) {
  const q = c.queue;
  const cell = (ch: string, b: string) => c.profile.find((p) => p.CHANNEL === ch && p.TIME_BAND === b);
  return (
    <div>
      <div className="grid grid-cols-[64px_repeat(3,1fr)] gap-1.5 text-[11px]" role="table" aria-label="Reach rate by channel and time of day">
        <div role="row" className="contents"><span />{BANDS.map((b) => <span key={b} role="columnheader" className="text-center muted font-semibold capitalize">{BAND_SHORT[b]}</span>)}</div>
        {CHANNELS.map((ch) => (
          <div role="row" key={ch} className="contents">
            <span role="rowheader" className="flex items-center font-semibold">{CHANNEL[ch]}</span>
            {BANDS.map((b) => {
              const p = cell(ch, b);
              const best = q && q.PLAN_CHANNEL === ch && q.BEST_BAND === b;
              const rate = p?.REACH_RATE ?? 0;
              return (
                <div role="cell" key={b} className="heat flex-col" title={p ? `${p.REACHED} of ${p.ATTEMPTS} reached` : 'No attempts'}
                  style={{ background: p ? `color-mix(in srgb, var(${best ? '--ember' : '--dusk'}) ${12 + rate * 70}%, var(--surface-2))` : 'var(--surface-2)',
                    color: rate > 0.45 ? '#fff' : 'var(--ink)', outline: best ? '2px solid var(--ember)' : undefined, outlineOffset: 1 }}>
                  <span className="tabular">{p ? pct0(rate) : '—'}</span>
                  <span className="font-normal opacity-80 text-[10px] tabular">{p ? `${p.REACHED}/${p.ATTEMPTS}` : 'none'}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] muted mt-2">Reach rate by channel and time of day, smoothed toward a low prior. Outlined: today&apos;s plan. Texts only with consent ({c.account.SMS_CONSENT ? 'on file' : 'not on file'}).</p>
    </div>
  );
}

type Ev = { at: string; kind: 'pay' | 'promise' | 'contact' | 'call' | 'action'; title: string; detail?: string; tone?: 'cure' | 'roll' | 'neutral' | 'dusk' | 'ember'; href?: string };
function timeline(c: AccountDetail): Ev[] {
  const ev: Ev[] = [
    ...c.payments.map((p) => ({ at: p.PAID_ON, kind: 'pay' as const, title: `Paid ${usd(p.AMOUNT)}`, detail: p.KIND.toLowerCase(), tone: 'cure' as const })),
    ...c.promises.map((p) => ({ at: p.DUE_DATE, kind: 'promise' as const, title: `Promise ${usd(p.PROMISE_AMOUNT)} ${p.STATUS.toLowerCase()}`, detail: `made ${p.CREATED_DATE} by ${CHANNEL[p.CHANNEL].toLowerCase()}`,
      tone: p.STATUS === 'BROKEN' ? 'roll' as const : p.STATUS === 'KEPT' ? 'cure' as const : 'neutral' as const })),
    ...c.contacts.map((x) => ({ at: x.ATTEMPT_TS, kind: 'contact' as const, title: `${CHANNEL[x.CHANNEL]}, ${BAND_SHORT[x.TIME_BAND]}`, detail: OUTCOME[x.OUTCOME] ?? x.OUTCOME,
      tone: REACHED.includes(x.OUTCOME) ? 'cure' as const : 'neutral' as const, channel: x.CHANNEL })),
    ...c.transcripts.map((t) => ({ at: t.CALL_TS, kind: 'call' as const, title: `Call reviewed · ${t.AGENT_NAME}`, detail: t.FLAGS.length ? `${t.FLAGS.length} QA flag${t.FLAGS.length > 1 ? 's' : ''}` : 'no issues',
      tone: t.FLAGS.length ? 'roll' as const : 'cure' as const, href: `/qa/?id=${t.TRANSCRIPT_ID}` })),
  ];
  return ev.sort((a, b) => (a.at < b.at ? 1 : -1));
}
const EV_ICON = { pay: CircleDollarSign, promise: HandHeart, contact: Phone, call: ShieldCheck, action: CalendarClock };

function Timeline({ c }: { c: AccountDetail }) {
  const [all, setAll] = useState(false);
  const ev = timeline(c);
  const shown = all ? ev : ev.slice(0, 12);
  return (
    <div>
      {c.actions.length > 0 && (
        <ul className="mb-4 space-y-1.5">{c.actions.map((x, i) => (
          <li key={i} className="flex items-center gap-2 text-[13px] rounded-lg px-3 py-2 tone-cure"><CalendarClock className="w-4 h-4" aria-hidden /><strong>{ACTION_NAME[x.ACTION]}</strong> {describe(x)} <span className="text-xs opacity-80 ml-auto">{x.ACTED_AT}</span></li>))}</ul>
      )}
      <ol className="relative border-l ml-2" style={{ borderColor: 'var(--line)' }}>
        {shown.map((e, i) => {
          const Icon = e.kind === 'contact' ? ((e as Ev & { channel?: string }).channel === 'SMS' ? MessageSquareText : (e as Ev & { channel?: string }).channel === 'EMAIL' ? Mail : Phone) : EV_ICON[e.kind];
          const color = e.tone === 'cure' ? 'var(--cure)' : e.tone === 'roll' ? 'var(--roll)' : 'var(--ink-2)';
          return (
            <li key={i} className="pl-5 pb-3 relative">
              <span className="absolute -left-[11px] top-0.5 w-[21px] h-[21px] rounded-full flex items-center justify-center" style={{ background: 'var(--surface)', border: `1.5px solid ${color}`, color }}><Icon className="w-3 h-3" aria-hidden /></span>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                {e.href ? <Link href={e.href} className="font-semibold underline underline-offset-2">{e.title}</Link> : <span className="font-semibold">{e.title}</span>}
                <span className="text-xs" style={{ color }}>{e.detail}</span>
                <span className="text-[11px] muted tabular ml-auto">{e.at.slice(0, 16).replace('2026-', '')}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {ev.length > 12 && <button className="btn text-xs" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${ev.length} events`}</button>}
    </div>
  );
}

function Actions({ c, onDone }: { c: AccountDetail; onDone: () => void }) {
  const q = c.queue!;
  const [tab, setTab] = useState<'promise' | 'hardship' | 'schedule'>('promise');
  const [amount, setAmount] = useState(String(Math.round(c.account.MONTHLY_PAYMENT * 0.5)));
  const [date, setDate] = useState('2026-11-20');
  const [program, setProgram] = useState(c.programs.find((p) => p.ELIGIBLE)?.PROGRAM_ID ?? '');
  const [channel, setChannel] = useState(q.PLAN_CHANNEL);
  const [band, setBand] = useState(q.BEST_BAND);
  const [sdate, setSdate] = useState(TODAY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const run = async (a: ActionInput, ok: string) => {
    setBusy(true); setMsg(undefined);
    try { await sendAction(c.account.ACCOUNT_ID, a); setMsg({ ok: true, text: ok }); onDone(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };
  const eligible = c.programs.filter((p) => p.ELIGIBLE);
  return (
    <Panel title="Take action" sub="Recorded in APP.ACCOUNT_ACTIONS in Live mode; this browser only in Sample mode">
      <div className="seg w-full mb-3" role="group" aria-label="Action">
        {([['promise', 'Log promise'], ['hardship', 'Hardship'], ['schedule', 'Schedule']] as const).map(([k, l]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setMsg(undefined); }} className="flex-1">{l}</button>))}
      </div>
      {tab === 'promise' && (
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); run({ action: 'LOG_PROMISE', amount: Number(amount), date }, 'Promise logged.'); }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs muted">Amount (USD)<input className="field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="block text-xs muted">Pay by<input className="field mt-1" type="date" min={TODAY} max="2026-12-16" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>Log promise</button>
        </form>)}
      {tab === 'hardship' && (
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); run({ action: 'ENROLL_HARDSHIP', program }, 'Enrollment requested for review.'); }}>
          {eligible.length ? (
            <label className="block text-xs muted">Program<select className="field mt-1" value={program} onChange={(e) => setProgram(e.target.value)}>
              {eligible.map((p) => <option key={p.PROGRAM_ID} value={p.PROGRAM_ID}>{p.NAME}</option>)}</select></label>
          ) : <p className="text-xs muted">Not eligible for a program today.</p>}
          <button className="btn btn-primary w-full" disabled={busy || !eligible.length}>Request enrollment</button>
        </form>)}
      {tab === 'schedule' && (
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); run({ action: 'SCHEDULE', channel, band, date: sdate }, 'Contact scheduled.'); }}>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs muted">Channel<select className="field mt-1" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((x) => <option key={x} value={x}>{CHANNEL[x]}</option>)}</select></label>
            <label className="block text-xs muted">Time<select className="field mt-1" value={band} onChange={(e) => setBand(e.target.value)}>
              {BANDS.map((x) => <option key={x} value={x}>{BAND_SHORT[x]}</option>)}</select></label>
            <label className="block text-xs muted">Date<input className="field mt-1" type="date" min={TODAY} max="2026-12-16" value={sdate} onChange={(e) => setSdate(e.target.value)} /></label>
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>Schedule</button>
        </form>)}
      {msg && <p role="status" className={`text-sm mt-3 font-semibold rounded-lg px-3 py-2 ${msg.ok ? 'tone-cure' : 'tone-roll'}`}>{msg.text}</p>}
    </Panel>
  );
}

function Guide({ c }: { c: AccountDetail }) {
  const id = c.account.ACCOUNT_ID;
  const q = c.queue;
  const [ai, setAi] = useState<{ loading?: boolean; data?: AiText; error?: string }>({});
  useEffect(() => setAi({}), [id]);
  const go = () => { setAi({ loading: true }); fetchGuide(id).then((data) => setAi({ data }), (e) => setAi({ error: String(e.message ?? e) })); };
  const eligible = c.programs.filter((p) => p.ELIGIBLE).length;
  const steps = [
    `Reading ${c.promises.length} promise${c.promises.length === 1 ? '' : 's'}, ${c.contacts.length} contact attempts and ${c.payments.length} payments`,
    `Checking ${c.programs.length} hardship programs (${eligible} eligible) and the call limit (${c.limit.calls7d} of ${c.limit.limit})`,
    `Choosing the opening: ${q ? `${CHANNEL[q.PLAN_CHANNEL].toLowerCase()} in the ${BAND_SHORT[q.BEST_BAND]}` : 'no plan'} with the required disclosure`,
    'Drafting the conversation guide with AI_COMPLETE',
  ];
  return (
    <AiPanel title="Conversation guide" icon={<Wand2 className="w-4 h-4" style={{ color: 'var(--ember)' }} aria-hidden />}
      right={<><PoweredBy>AI_COMPLETE</PoweredBy>{ai.data && <AiMeta ai={ai.data} />}</>}>
      {ai.error ? <ErrorBox error={ai.error} /> : ai.loading ? <Reasoning kind="guide" steps={steps} /> : ai.data ? (
        <>
          <StreamText text={ai.data.text} />
          <Sources items={[
            { label: `ACCOUNTS · ${id}`, detail: 'Borrower, product, consent and language' },
            { label: `PROMISES_TO_PAY · ${c.promises.length}`, detail: 'Kept, broken and pending promises' },
            { label: `CONTACT_PROFILE · ${c.profile.length} cells`, detail: 'Reach rate by channel and time' },
            { label: `HARDSHIP_PROGRAMS · ${eligible} eligible`, detail: 'Eligibility rules' },
          ]} />
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <p className="text-[11px] muted">AI-drafted from this account&apos;s facts. Not legal advice; follow your own scripts and policies.</p>
            <button className="btn text-xs" onClick={go}>Redraft</button>
          </div>
        </>
      ) : (
        <div>
          <p className="text-sm muted mb-3">{q ? 'A script with the required disclosure, an empathetic opening, the right offer and what to avoid, drafted from this borrower\u2019s history.' : 'Available for accounts in today\u2019s queue (1 to 59 days past due).'}</p>
          <button className="btn btn-ai w-full" onClick={go} disabled={!q}><Sparkles className="w-4 h-4" aria-hidden />Draft a conversation guide</button>
        </div>
      )}
    </AiPanel>
  );
}

function AccountView() {
  const id = useSearchParams().get('id') ?? STORY_ACCOUNTS[0].id;
  const [tick, setTick] = useState(0);
  const refreshing = useRef(false);
  const c = useAsync(() => fetchAccount(id).finally(() => { refreshing.current = false; }), [id, tick], refreshing.current);
  if (c.error) return <ErrorBox error={c.error} />;
  if (c.loading || !c.data) return <PageSkeleton label="Loading the account" />;
  const { account: a, queue: q, limit } = c.data;
  const used = limit.calls7d + limit.scheduledCalls;
  const dpd = c.data.dpd.map((d) => ({ ...d, day: d.DAY.slice(5) }));
  const usedPct = Math.min(1, used / limit.limit);
  return (
    <div className="space-y-5">
      <div className="band rounded-[20px] px-5 sm:px-7 py-5">
        <div className="relative z-10">
          <Link href="/queue/" className="text-xs inline-flex items-center gap-1 opacity-85 no-underline hover:opacity-100"><ArrowLeft className="w-3.5 h-3.5" aria-hidden />Today&apos;s queue</Link>
          <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
            <div className="flex items-center gap-4 min-w-0">
              <span className="w-14 h-14 rounded-2xl flex-none flex items-center justify-center display text-xl font-bold" style={{ background: 'rgba(255,255,255,.16)' }}>{a.CUSTOMER_NAME.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
              <div className="min-w-0">
                <h1 className="text-[26px] font-bold leading-tight">{a.CUSTOMER_NAME}</h1>
                <p className="text-sm opacity-85"><span className="mono">{a.ACCOUNT_ID}</span> · {a.PRODUCT === 'AUTO' ? 'Auto' : 'Personal'} loan ending {a.LAST4} · {a.CITY}, {a.STATE} {a.ZIP} · prefers {a.PREFERRED_LANGUAGE}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {a.DISASTER_EVENT && <span className="pill chip-on-band">{a.DISASTER_EVENT}</span>}
              <SourceChip onBand ms={c.data.ms} source={c.data.source} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-5">
            {[
              ['Days past due', String(a.DPD), `${a.DPD_BUCKET} bucket`],
              ['Past due', usd(a.PAST_DUE), `${usd(a.MONTHLY_PAYMENT)} a month`],
              ['Roll risk', q ? pct0(q.ROLL_RISK) : '—', 'chance of 60+ DPD'],
              ['Queue rank', q ? `#${q.QUEUE_RANK}` : '—', q ? `${usd(q.EXPECTED_RECOVERY)} expected` : 'not in today\u2019s queue'],
              ['Suggested offer', q ? OFFER[q.SUGGESTED_OFFER] : '—', q ? `${CHANNEL[q.PLAN_CHANNEL]}, ${BAND_SHORT[q.BEST_BAND]}` : ''],
            ].map(([l, v, s]) => (
              <div key={l} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,.12)' }}>
                <div className="text-[10.5px] uppercase tracking-wider font-bold opacity-75">{l}</div>
                <div className="display text-lg font-bold tabular leading-tight mt-0.5">{v}</div>
                <div className="text-[11px] opacity-75">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_400px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="When this borrower answers" right={<PoweredBy>Dynamic Table · CONTACT_PROFILE</PoweredBy>}>
              {q && <p className="text-sm mb-3">Reach out by <strong style={{ color: 'var(--ember)' }}>{CHANNEL[q.PLAN_CHANNEL].toLowerCase()} in the {BAND[q.BEST_BAND]}</strong>.
                {q.USUAL_CHANNEL && (q.USUAL_CHANNEL !== q.PLAN_CHANNEL || q.USUAL_BAND !== q.BEST_BAND) &&
                  <> Most attempts so far were {CHANNEL[q.USUAL_CHANNEL].toLowerCase()}s in the {BAND_SHORT[q.USUAL_BAND!]}, reaching them {pct0(q.USUAL_REACH_RATE ?? 0)} of the time.</>}</p>}
              <Heatmap c={c.data} />
            </Panel>
            <Panel title="Days past due" sub="Aug 1 to Nov 15">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dpd} margin={{ left: -20, right: 6, top: 6 }}>
                    <defs><linearGradient id="dpdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--roll)" stopOpacity={0.3} /><stop offset="1" stopColor="var(--roll)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="day" tick={AXIS} interval={24} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} />
                    <ReferenceLine y={60} stroke="var(--roll)" strokeDasharray="4 4" label={{ value: '60 DPD', fontSize: 10, fill: 'var(--roll)', position: 'insideTopRight' }} />
                    <Tooltip content={<ChartTip fmt={(v) => `${v} days`} />} />
                    <Area isAnimationActive={false} dataKey="DPD" name="Days past due" stroke="var(--roll)" strokeWidth={2} fill="url(#dpdg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <Panel title="Account timeline" sub="Payments, promises, contact attempts and reviewed calls, newest first">
            <Timeline c={c.data} />
          </Panel>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20 min-w-0">
          <Guide c={c.data} />
          {q && <RescorePanel key={`score-${a.ACCOUNT_ID}`} id={a.ACCOUNT_ID} />}
          <Panel title="Contact-frequency limit">
            <div className="flex items-end justify-between">
              <div className="display text-[30px] font-bold tabular leading-none">{used}<span className="text-base muted font-medium"> of {limit.limit} calls</span></div>
              <Tag tone={used >= limit.limit ? 'roll' : used >= limit.limit - 1 ? 'caution' : 'cure'}>{used >= limit.limit ? 'At limit' : `${limit.limit - used} left`}</Tag>
            </div>
            <div className="track mt-3"><span style={{ width: `${usedPct * 100}%`, background: used >= limit.limit ? 'var(--roll)' : used >= limit.limit - 1 ? 'var(--caution)' : 'var(--cure)' }} /></div>
            <p className="text-xs muted mt-2">{limit.calls7d} calls in the last 7 days{limit.scheduledCalls ? ` plus ${limit.scheduledCalls} scheduled` : ''}. {used >= limit.limit ? 'No more calls this week; use text or email.' : ''} Illustrative limit, checked when you schedule.</p>
          </Panel>
          <Panel title="Hardship eligibility">
            <ul className="space-y-2.5 text-sm">{c.data.programs.map((p) => (
              <li key={p.PROGRAM_ID} className="flex gap-2.5 items-start">
                <Tag tone={p.ELIGIBLE ? 'cure' : 'neutral'}>{p.ELIGIBLE ? 'Eligible' : 'Not now'}</Tag>
                <div className="min-w-0"><div className="font-semibold">{p.NAME}</div><div className="text-xs muted">{p.ELIGIBILITY}</div></div>
              </li>))}</ul>
            {c.data.enrollments.length > 0 && <p className="text-xs muted mt-3">History: {c.data.enrollments.map((e) => `${OFFER[e.PROGRAM_ID]} ${e.ENROLLED_ON} (${e.STATUS.toLowerCase()})`).join('; ')}</p>}
          </Panel>
          {q && <Actions key={a.ACCOUNT_ID} c={c.data} onDone={() => { refreshing.current = true; setTick((t) => t + 1); }} />}
          {q && <p className="text-[11px] muted px-1">Queue tone: <Tag tone={riskTone(q.ROLL_RISK)}>{pct0(q.ROLL_RISK)} roll risk</Tag></p>}
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense fallback={<PageSkeleton label="Loading the account" />}><AccountView /></Suspense>;
}
