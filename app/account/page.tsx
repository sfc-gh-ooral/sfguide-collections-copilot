'use client';

// Account view: delinquency history, the contact plan from the borrower's own response history,
// hardship eligibility, contact-limit tracking, an AI conversation guide, and the collector's
// actions (log a promise, request a hardship enrollment, schedule a contact).
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Reasoning } from '@/components/Reasoning';
import { ACTION_NAME, BAND, BAND_SHORT, CHANNEL, Card, ErrorBox, Markdown, OFFER, OUTCOME, PoweredBy, SampleAiBadge, SourceChip, Tag, Thinking, pct0, riskTone, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_ACCOUNTS, fetchAccount, fetchGuide, sendAction } from '@/lib/client';
import { type ActionInput, TODAY } from '@/lib/rules';
import type { AccountDetail, AiText } from '@/lib/types';

const TIP = { background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 };
const describe = (a: { ACTION: string; DETAIL: string }) => {
  const d = JSON.parse(a.DETAIL);
  if (a.ACTION === 'LOG_PROMISE') return `${usd(d.amount)} by ${d.date}`;
  if (a.ACTION === 'ENROLL_HARDSHIP') return `${OFFER[d.program] ?? d.program}, pending review`;
  return `${CHANNEL[d.channel]} on ${d.date}, ${BAND_SHORT[d.band]}`;
};

function Actions({ c, onDone }: { c: AccountDetail; onDone: () => void }) {
  const q = c.queue!;
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
    <Card title="Take action" right={<span className="text-[11px] muted">Recorded in APP.ACCOUNT_ACTIONS in Live mode</span>}>
      <div className="grid md:grid-cols-3 gap-4 text-sm">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: 'LOG_PROMISE', amount: Number(amount), date }, 'Promise logged.'); }}>
          <div className="font-semibold">Log a promise to pay</div>
          <label className="block text-xs muted">Amount (USD)<input className="field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="block text-xs muted">Pay by<input className="field mt-1" type="date" min={TODAY} max="2026-12-16" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={busy}>Log promise</button>
        </form>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: 'ENROLL_HARDSHIP', program }, 'Enrollment requested for review.'); }}>
          <div className="font-semibold">Enroll in a hardship program</div>
          {eligible.length ? (
            <label className="block text-xs muted">Program<select className="field mt-1" value={program} onChange={(e) => setProgram(e.target.value)}>
              {eligible.map((p) => <option key={p.PROGRAM_ID} value={p.PROGRAM_ID}>{p.NAME}</option>)}</select></label>
          ) : <p className="text-xs muted">Not eligible for a program today.</p>}
          <button className="btn" disabled={busy || !eligible.length}>Request enrollment</button>
        </form>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: 'SCHEDULE', channel, band, date: sdate }, 'Contact scheduled.'); }}>
          <div className="font-semibold">Schedule the next contact</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs muted">Channel<select className="field mt-1" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {['CALL', 'SMS', 'EMAIL'].map((x) => <option key={x} value={x}>{CHANNEL[x]}</option>)}</select></label>
            <label className="block text-xs muted">Time<select className="field mt-1" value={band} onChange={(e) => setBand(e.target.value)}>
              {['MORNING', 'AFTERNOON', 'EVENING'].map((x) => <option key={x} value={x}>{BAND_SHORT[x]}</option>)}</select></label>
          </div>
          <label className="block text-xs muted">Date<input className="field mt-1" type="date" min={TODAY} max="2026-12-16" value={sdate} onChange={(e) => setSdate(e.target.value)} /></label>
          <button className="btn" disabled={busy}>Schedule</button>
        </form>
      </div>
      {msg && <p role="status" className="text-sm mt-3 font-medium" style={{ color: msg.ok ? 'var(--positive)' : 'var(--negative)' }}>{msg.text}</p>}
    </Card>
  );
}

function AccountView() {
  const id = useSearchParams().get('id') ?? STORY_ACCOUNTS[0].id;
  const [tick, setTick] = useState(0);
  const refreshing = useRef(false);
  const c = useAsync(() => fetchAccount(id).finally(() => { refreshing.current = false; }), [id, tick], refreshing.current);
  const [ai, setAi] = useState<{ loading?: boolean; data?: AiText; error?: string }>({});
  useEffect(() => setAi({}), [id]);
  const guide = () => { setAi({ loading: true }); fetchGuide(id).then((data) => setAi({ data }), (e) => setAi({ error: String(e.message ?? e) })); };

  if (c.error) return <ErrorBox error={c.error} />;
  if (c.loading || !c.data) return <Thinking label="Loading the account" />;
  const { account: a, queue: q, limit } = c.data;
  const used = limit.calls7d + limit.scheduledCalls;
  const dpd = c.data.dpd.map((d) => ({ ...d, day: d.DAY.slice(5) }));
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/queue/" className="text-xs muted">← Today&apos;s queue</Link>
          <h1 className="text-xl font-bold">{a.CUSTOMER_NAME}</h1>
          <p className="text-sm muted">{a.ACCOUNT_ID} · {a.PRODUCT === 'AUTO' ? 'Auto' : 'Personal'} loan ending {a.LAST4} · {a.CITY}, {a.STATE} {a.ZIP} · prefers {a.PREFERRED_LANGUAGE}</p>
        </div>
        <SourceChip ms={c.data.ms} source={c.data.source} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card p-3"><div className="text-[11px] uppercase muted font-semibold">Days past due</div><div className="text-2xl font-bold tabular">{a.DPD}</div><div className="text-xs muted">{a.DPD_BUCKET} bucket</div></div>
        <div className="card p-3"><div className="text-[11px] uppercase muted font-semibold">Past due</div><div className="text-2xl font-bold tabular">{usd(a.PAST_DUE)}</div><div className="text-xs muted">{usd(a.MONTHLY_PAYMENT)} a month</div></div>
        <div className="card p-3"><div className="text-[11px] uppercase muted font-semibold">Roll risk</div><div className="text-2xl font-bold tabular">{q ? pct0(q.ROLL_RISK) : '—'}</div><div className="text-xs muted">chance of reaching 60+ DPD</div></div>
        <div className="card p-3"><div className="text-[11px] uppercase muted font-semibold">Queue rank</div><div className="text-2xl font-bold tabular">{q ? `#${q.QUEUE_RANK}` : '—'}</div><div className="text-xs muted">{q ? `${usd(q.EXPECTED_RECOVERY)} expected recovery` : 'not in today’s queue'}</div></div>
        <div className="card p-3"><div className="text-[11px] uppercase muted font-semibold">Suggested offer</div><div className="text-base font-bold mt-1">{q ? OFFER[q.SUGGESTED_OFFER] : '—'}</div></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="min-w-0" title="Contact plan" right={<PoweredBy>Dynamic Tables</PoweredBy>}>
          {q && <p className="text-sm mb-2">Reach out by <strong>{CHANNEL[q.PLAN_CHANNEL].toLowerCase()}</strong> in the <strong>{BAND[q.BEST_BAND]}</strong>.
            {q.USUAL_CHANNEL && (q.USUAL_CHANNEL !== q.PLAN_CHANNEL || q.USUAL_BAND !== q.BEST_BAND) &&
              <> Most attempts so far were {CHANNEL[q.USUAL_CHANNEL].toLowerCase()}s in the {BAND_SHORT[q.USUAL_BAND!]}, which reached them {pct0(q.USUAL_REACH_RATE ?? 0)} of the time.</>}</p>}
          <table className="data-table w-full text-sm">
            <thead><tr><th className="text-left">Channel and time</th><th className="text-right">Tries</th><th className="text-right">Reached</th><th className="text-right">Rate</th></tr></thead>
            <tbody>{c.data.profile.slice(0, 6).map((p) => (
              <tr key={p.CHANNEL + p.TIME_BAND}><td>{CHANNEL[p.CHANNEL]}, {BAND_SHORT[p.TIME_BAND]}</td><td className="text-right tabular">{p.ATTEMPTS}</td><td className="text-right tabular">{p.REACHED}</td><td className="text-right tabular">{pct0(p.REACH_RATE)}</td></tr>))}</tbody>
          </table>
          <p className="text-xs muted mt-2">Rates are smoothed toward a low prior. Texts only with consent ({a.SMS_CONSENT ? 'on file' : 'not on file'}).</p>
        </Card>
        <Card className="min-w-0" title="Hardship eligibility">
          {a.DISASTER_EVENT && <div className="text-xs mb-2"><Tag tone="warning">{a.DISASTER_EVENT}</Tag> <span className="muted">declared for ZIP {a.ZIP}</span></div>}
          <ul className="space-y-2 text-sm">{c.data.programs.map((p) => (
            <li key={p.PROGRAM_ID} className="flex gap-2 items-start">
              <Tag tone={p.ELIGIBLE ? 'positive' : 'neutral'}>{p.ELIGIBLE ? 'Eligible' : 'No'}</Tag>
              <div><div className="font-medium">{p.NAME}</div><div className="text-xs muted">{p.ELIGIBILITY}</div></div>
            </li>))}</ul>
          {c.data.enrollments.length > 0 && <p className="text-xs muted mt-2">History: {c.data.enrollments.map((e) => `${OFFER[e.PROGRAM_ID]} ${e.ENROLLED_ON} (${e.STATUS.toLowerCase()})`).join('; ')}</p>}
        </Card>
        <Card className="min-w-0" title="Contact-frequency limit">
          <div className="text-3xl font-bold tabular">{used} <span className="text-base muted font-medium">of {limit.limit} calls</span></div>
          <div className="h-2 rounded-full mt-2" style={{ background: 'var(--surface-2)' }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (used / limit.limit) * 100)}%`, background: used >= limit.limit ? 'var(--negative)' : used >= limit.limit - 1 ? 'var(--warning)' : 'var(--positive)' }} />
          </div>
          <p className="text-sm mt-2">{limit.calls7d} calls in the last 7 days{limit.scheduledCalls ? ` plus ${limit.scheduledCalls} scheduled` : ''}. {used >= limit.limit ? 'No more calls this week; use text or email.' : `${limit.limit - used} call${limit.limit - used === 1 ? '' : 's'} left this week.`}</p>
          <p className="text-xs muted mt-2">Illustrative limit of 7 calls in 7 days, checked when you schedule. Replace with your own state and policy rules.</p>
        </Card>
      </div>

      <Card title="Conversation guide" right={<>
        <PoweredBy>AI_COMPLETE</PoweredBy>
        {ai.data && (ai.data.source === 'sample' ? <SampleAiBadge /> : <span className="text-[11px] muted">{(ai.data.latencyMs / 1000).toFixed(1)} s · {ai.data.model}</span>)}</>}>
        {ai.error ? <ErrorBox error={ai.error} /> : ai.loading ? <Reasoning kind="guide" /> : ai.data ? <Markdown text={ai.data.text} /> : (
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn btn-ai" onClick={guide} disabled={!q}><Sparkles className="w-4 h-4" aria-hidden />Draft a conversation guide</button>
            <span className="text-xs muted">{q ? 'An AI-drafted script with the required disclosure, an offer, and what to avoid. Review before use.' : 'Available for accounts in today’s queue.'}</span>
          </div>)}
        {ai.data && <p className="text-xs muted mt-3">AI-generated from this account&apos;s facts. Not legal advice; follow your own scripts and policies.</p>}
      </Card>

      {q && <Actions key={a.ACCOUNT_ID} c={c.data} onDone={() => { refreshing.current = true; setTick((t) => t + 1); }} />}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="min-w-0" title="Days past due, Aug 1 to Nov 15">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dpd} margin={{ left: -18, right: 6, top: 6 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={20} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip contentStyle={TIP} />
                <Area isAnimationActive={false} dataKey="DPD" name="DPD" stroke="var(--negative)" fill="var(--negative)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="min-w-0" title="Promises to pay">
          {c.data.promises.length === 0 && !c.data.actions.some((x) => x.ACTION === 'LOG_PROMISE') ? <p className="text-sm muted">No promises yet.</p> : (
            <table className="data-table w-full text-sm">
              <thead><tr><th className="text-left">Due</th><th className="text-right">Amount</th><th className="text-left">Made by</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {c.data.actions.filter((x) => x.ACTION === 'LOG_PROMISE').map((x, i) => { const d = JSON.parse(x.DETAIL); return (
                  <tr key={`n${i}`}><td>{d.date}</td><td className="text-right tabular">{usd(d.amount)}</td><td>This app</td><td><Tag>Pending</Tag></td></tr>); })}
                {c.data.promises.map((p) => (
                  <tr key={p.PROMISE_ID}><td>{p.DUE_DATE}</td><td className="text-right tabular">{usd(p.PROMISE_AMOUNT)}</td><td>{CHANNEL[p.CHANNEL]}</td>
                    <td><Tag tone={p.STATUS === 'BROKEN' ? 'danger' : p.STATUS === 'KEPT' ? 'positive' : 'neutral'}>{p.STATUS.toLowerCase()}</Tag></td></tr>))}
              </tbody>
            </table>)}
        </Card>
        <Card className="min-w-0" title="Recent contact attempts">
          <div className="relative overflow-y-auto max-h-[260px]">
            <table className="data-table w-full text-sm">
              <thead><tr><th className="text-left">When</th><th className="text-left">Channel</th><th className="text-left">Outcome</th></tr></thead>
              <tbody>{c.data.contacts.map((x, i) => (
                <tr key={i}><td className="tabular">{x.ATTEMPT_TS.slice(5)}</td><td>{CHANNEL[x.CHANNEL]}, {BAND_SHORT[x.TIME_BAND]}</td>
                  <td><span style={{ color: ['RIGHT_PARTY_CONTACT', 'REPLIED', 'PROMISE_MADE'].includes(x.OUTCOME) ? 'var(--positive)' : undefined }}>{OUTCOME[x.OUTCOME] ?? x.OUTCOME}</span></td></tr>))}</tbody>
            </table>
          </div>
        </Card>
        <Card className="min-w-0" title="Calls reviewed and actions">
          {c.data.transcripts.length === 0 ? <p className="text-sm muted">No reviewed calls on this account.</p> : (
            <ul className="space-y-1 text-sm mb-3">{c.data.transcripts.map((t) => (
              <li key={t.TRANSCRIPT_ID}><Link href={`/qa/?id=${t.TRANSCRIPT_ID}`} className="font-medium">{t.TRANSCRIPT_ID}</Link> <span className="muted">{t.CALL_TS} · {t.AGENT_NAME}</span>{' '}
                {t.FLAGS.length ? <Tag tone="danger">{t.FLAGS.length} QA flag{t.FLAGS.length > 1 ? 's' : ''}</Tag> : <Tag tone="positive">No issues</Tag>}</li>))}</ul>)}
          <div className="text-xs font-semibold muted uppercase mb-1">Actions</div>
          {c.data.actions.length === 0 ? <p className="text-sm muted">None yet.</p> : (
            <ul className="space-y-1 text-sm">{c.data.actions.map((x, i) => <li key={i}><strong>{ACTION_NAME[x.ACTION]}</strong>: {describe(x)} <span className="muted text-xs">{x.ACTED_AT}</span></li>)}</ul>)}
          <div className="text-xs font-semibold muted uppercase mt-3 mb-1">Payments</div>
          <ul className="space-y-0.5 text-xs muted">{c.data.payments.slice(0, 5).map((p, i) => <li key={i}>{p.PAID_ON} · {usd(p.AMOUNT)} · {p.KIND.toLowerCase()}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense fallback={<Thinking label="Loading the account" />}><AccountView /></Suspense>;
}
