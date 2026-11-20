'use client';

// Today's queue: loans ranked by expected recovery x roll risk, with the channel and hour each borrower
// actually answers, a suggested offer, and the illustrative 7-calls-in-7-days limit. Selecting a row
// opens a drawer with the plan; the full account workspace is one click further.
import { ArrowDown, ArrowUp, ArrowUpRight, CloudRain, MessageSquareText, Phone, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { BAND_SHORT, CHANNEL, Empty, ErrorBox, OFFER, PageBand, PageSkeleton, Panel, PoweredBy, Skeleton, SourceChip, Tag, ACTION_NAME, fmtInt, pct0, riskTone, usd, usd0 } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_ACCOUNTS, fetchQueue } from '@/lib/client';
import type { QueueRow } from '@/lib/types';

const FILTERS = [
  ['ALL', 'All accounts'], ['EVENING_SMS', 'Texts back in the evening'], ['BROKEN', '2+ broken promises'],
  ['DISASTER', 'Disaster eligible'], ['NEAR_LIMIT', 'Near call limit'],
] as const;
type SortKey = 'QUEUE_RANK' | 'ROLL_RISK' | 'EXPECTED_RECOVERY' | 'DPD' | 'CALLS_7D';
const COLS: { key: SortKey | null; label: string; right?: boolean }[] = [
  { key: 'QUEUE_RANK', label: '#', right: true }, { key: null, label: 'Borrower' }, { key: 'DPD', label: 'Delinquency' },
  { key: 'ROLL_RISK', label: 'Roll risk', right: true }, { key: 'EXPECTED_RECOVERY', label: 'Expected recovery', right: true },
  { key: null, label: 'Contact plan' }, { key: null, label: 'Suggested offer' }, { key: 'CALLS_7D', label: 'Calls, 7 days' },
];
const changed = (r: QueueRow) => !!r.USUAL_CHANNEL && (r.USUAL_CHANNEL !== r.PLAN_CHANNEL || r.USUAL_BAND !== r.BEST_BAND);
const ChannelIcon = ({ c }: { c: string }) => (c === 'SMS' ? <MessageSquareText className="w-3.5 h-3.5" aria-hidden /> : c === 'CALL' ? <Phone className="w-3.5 h-3.5" aria-hidden /> : <span aria-hidden>@</span>);

function Drawer({ r, onClose }: { r: QueueRow; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const used = Math.min(1, r.CALLS_7D / r.CALL_LIMIT_7D);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="drawer p-5" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs muted mono">{r.ACCOUNT_ID} · rank #{r.QUEUE_RANK}</div>
            <h2 id="drawer-title" className="text-xl font-bold">{r.CUSTOMER_NAME}</h2>
            <div className="text-xs muted">{r.PRODUCT === 'AUTO' ? 'Auto' : 'Personal'} loan · {r.CITY}, {r.STATE} {r.ZIP} · prefers {r.PREFERRED_LANGUAGE}</div>
          </div>
          <button className="btn !p-2" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[['Days past due', String(r.DPD)], ['Past due', usd0(r.PAST_DUE)], ['Roll risk', pct0(r.ROLL_RISK)]].map(([l, v], i) => (
            <div key={l} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10.5px] uppercase font-bold muted tracking-wider">{l}</div>
              <div className="display text-xl font-bold tabular" style={{ color: i === 2 && r.ROLL_RISK >= 0.8 ? 'var(--roll)' : undefined }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl p-4 border" style={{ borderColor: 'color-mix(in srgb, var(--ember) 40%, var(--line))', background: 'color-mix(in srgb, var(--ember) 7%, var(--surface))' }}>
          <div className="text-[11px] uppercase font-bold tracking-wider" style={{ color: 'var(--ember)' }}>Best way to reach</div>
          <div className="text-[15px] font-semibold mt-1 flex items-center gap-2"><ChannelIcon c={r.PLAN_CHANNEL} />{CHANNEL[r.PLAN_CHANNEL]} in the {BAND_SHORT[r.BEST_BAND]} · {pct0(r.BEST_REACH_RATE)} reach rate</div>
          {changed(r) && <p className="text-xs muted mt-1">Most attempts so far: {CHANNEL[r.USUAL_CHANNEL!].toLowerCase()} in the {BAND_SHORT[r.USUAL_BAND!]}, reaching them {pct0(r.USUAL_REACH_RATE ?? 0)} of the time.</p>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs muted">Suggested offer</dt><dd className="font-semibold">{OFFER[r.SUGGESTED_OFFER]}</dd></div>
          <div><dt className="text-xs muted">Expected recovery</dt><dd className="font-semibold tabular">{usd(r.EXPECTED_RECOVERY)}</dd></div>
          <div><dt className="text-xs muted">Broken promises</dt><dd className="font-semibold" style={{ color: r.PROMISES_BROKEN ? 'var(--roll)' : undefined }}>{r.PROMISES_BROKEN}</dd></div>
          <div><dt className="text-xs muted">Hardship programs</dt><dd className="font-semibold">{r.ELIGIBLE_PROGRAMS.length ? r.ELIGIBLE_PROGRAMS.map((p) => OFFER[p] ?? p).join(', ') : 'None today'}</dd></div>
        </dl>
        <div className="mt-4">
          <div className="flex justify-between text-xs"><span className="muted">Calls in the last 7 days</span><strong className="tabular">{r.CALLS_7D} of {r.CALL_LIMIT_7D}</strong></div>
          <div className="track mt-1.5"><span style={{ width: `${used * 100}%`, background: used >= 1 ? 'var(--roll)' : used >= 0.85 ? 'var(--caution)' : 'var(--cure)' }} /></div>
          <p className="text-[11px] muted mt-1">Illustrative limit; replace with your own state and policy rules.</p>
        </div>
        <Link href={`/account/?id=${r.ACCOUNT_ID}`} className="btn btn-primary w-full mt-5 no-underline">Open account workspace<ArrowUpRight className="w-4 h-4" aria-hidden /></Link>
      </aside>
    </>
  );
}

function QueueView() {
  const params = useSearchParams();
  const router = useRouter();
  const filter = FILTERS.some(([f]) => f === params.get('filter')) ? params.get('filter')! : 'ALL';
  const q = useAsync(() => fetchQueue(filter), [filter]);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'QUEUE_RANK', desc: false });
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<QueueRow>();
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = (q.data?.rows ?? []).filter((r) => !t || `${r.CUSTOMER_NAME} ${r.ACCOUNT_ID} ${r.CITY}`.toLowerCase().includes(t));
    return [...list].sort((a, b) => (sort.desc ? -1 : 1) * ((a[sort.key] as number) - (b[sort.key] as number)));
  }, [q.data, sort, term]);
  const toggle = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'QUEUE_RANK' }));

  return (
    <div className="space-y-5">
      <PageBand eyebrow="Monday, Nov 16, 2026 · morning shift" title="Today's queue"
        sub="Loans 1 to 59 days past due, ranked by expected recovery (past due × reach rate) × roll risk, with the channel and hour each borrower answers."
        chips={<><PoweredBy onBand>Dynamic Table · APP.TODAY_QUEUE</PoweredBy><PoweredBy onBand>Batch-scored · Model Registry</PoweredBy><SourceChip onBand ms={q.data?.ms} source={q.data?.source} /></>} />

      <div className="relative z-10 grid sm:grid-cols-3 gap-3 px-2 sm:px-3">
        {STORY_ACCOUNTS.map((c, i) => {
          const Icon = [MessageSquareText, ArrowDown, CloudRain][i];
          const color = ['var(--ember)', 'var(--roll)', 'var(--dusk)'][i];
          return (
            <Link key={c.id} href={`/account/?id=${c.id}`} className="panel panel-hover p-4 no-underline flex gap-3 items-start">
              <span className="w-9 h-9 rounded-xl flex-none flex items-center justify-center" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}><Icon className="w-4 h-4" aria-hidden /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold">{c.title}</span><span className="block text-xs muted"><span className="mono">{c.id}</span> · {c.hint}</span></span>
            </Link>
          );
        })}
      </div>

      <Panel pad={false} title={q.data ? `${fmtInt(q.data.total)} accounts${q.data.total > q.data.rows.length ? ` · top ${q.data.rows.length} shown` : ''}` : 'Accounts'}
        sub="Select a row for the contact plan. Reach rates are smoothed from each borrower's own history."
        right={
          <label className="relative block w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 muted" aria-hidden />
            <input className="field !pl-9" placeholder="Filter by name, ID or city" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Filter rows" />
          </label>}>
        <div className="px-4 sm:px-5 pb-3">
          <div className="seg" role="group" aria-label="Queue segment">
            {FILTERS.map(([id, label]) => (
              <button key={id} aria-pressed={filter === id} onClick={() => router.replace(id === 'ALL' ? '/queue/' : `/queue/?filter=${id}`)}>{label}</button>
            ))}
          </div>
        </div>
        {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : q.loading || !q.data ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? <Empty title="No accounts match">Clear the filter text or pick another segment.</Empty> : (
          <div className="relative overflow-x-auto px-2 sm:px-3 pb-3">
            <table className="data-table text-[13px] min-w-[980px]">
              <thead><tr>{COLS.map((c) => (
                <th key={c.label} className={c.right ? 'text-right' : 'text-left'} aria-sort={c.key && sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                  {c.key ? <button className="sort-btn" onClick={() => toggle(c.key!)}>{c.label}{sort.key === c.key && (sort.desc ? <ArrowDown className="w-3 h-3" aria-hidden /> : <ArrowUp className="w-3 h-3" aria-hidden />)}</button> : c.label}
                </th>))}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const atLimit = r.CALLS_7D >= r.CALL_LIMIT_7D;
                  return (
                    <tr key={r.ACCOUNT_ID} className={`cursor-pointer ${open?.ACCOUNT_ID === r.ACCOUNT_ID ? 'is-active' : ''}`} onClick={() => setOpen(r)}>
                      <td className="text-right tabular muted">{r.QUEUE_RANK}</td>
                      <td>
                        <button className="font-semibold text-left hover:underline underline-offset-2" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.CUSTOMER_NAME}</button>
                        <div className="text-xs muted"><span className="mono">{r.ACCOUNT_ID}</span> · {r.PRODUCT === 'AUTO' ? 'Auto' : 'Personal'} · {r.CITY}, {r.STATE}</div>
                        {r.LAST_ACTION && <div className="mt-1"><Tag tone="cure">{ACTION_NAME[r.LAST_ACTION] ?? r.LAST_ACTION}</Tag></div>}
                      </td>
                      <td><div className="tabular font-semibold">{r.DPD} DPD</div><div className="text-xs muted tabular">{usd(r.PAST_DUE)} past due</div>
                        {r.PROMISES_BROKEN > 0 && <div className="mt-1"><Tag tone="roll">{r.PROMISES_BROKEN} broken promise{r.PROMISES_BROKEN > 1 ? 's' : ''}</Tag></div>}</td>
                      <td className="text-right">
                        <div className="inline-flex flex-col items-end gap-1">
                          <Tag tone={riskTone(r.ROLL_RISK)}>{pct0(r.ROLL_RISK)}</Tag>
                          <span className="block w-16 track !h-1.5"><span style={{ width: `${r.ROLL_RISK * 100}%`, background: r.ROLL_RISK >= 0.8 ? 'var(--roll)' : r.ROLL_RISK >= 0.5 ? 'var(--caution)' : 'var(--dusk)' }} /></span>
                        </div>
                      </td>
                      <td className="text-right tabular font-semibold">{usd(r.EXPECTED_RECOVERY)}</td>
                      <td><div className="font-semibold flex items-center gap-1.5" style={{ color: changed(r) ? 'var(--ember)' : undefined }}><ChannelIcon c={r.PLAN_CHANNEL} />{CHANNEL[r.PLAN_CHANNEL]}, {BAND_SHORT[r.BEST_BAND]}</div>
                        <div className="text-xs muted">reach {pct0(r.BEST_REACH_RATE)}{changed(r) && <> · usually {CHANNEL[r.USUAL_CHANNEL!].toLowerCase()}, {BAND_SHORT[r.USUAL_BAND!]} ({pct0(r.USUAL_REACH_RATE ?? 0)})</>}</div></td>
                      <td><Tag tone={r.SUGGESTED_OFFER === 'DISASTER_FORBEARANCE' ? 'dusk' : r.SUGGESTED_OFFER === 'PROMISE_TO_PAY' ? 'neutral' : 'ember'}>{OFFER[r.SUGGESTED_OFFER]}</Tag></td>
                      <td><Tag tone={atLimit ? 'roll' : r.CALLS_7D >= r.CALL_LIMIT_7D - 1 ? 'caution' : 'neutral'}>{r.CALLS_7D} of {r.CALL_LIMIT_7D}{atLimit ? ' · at limit' : ''}</Tag></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs muted px-4 sm:px-5 pb-4">The 7-calls-in-7-days limit is illustrative. In Live mode the queue is the APP.TODAY_QUEUE dynamic table, refreshed daily.</p>
      </Panel>
      {open && <Drawer r={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}

export default function QueuePage() {
  return <Suspense fallback={<PageSkeleton label="Loading the queue" />}><QueueView /></Suspense>;
}
