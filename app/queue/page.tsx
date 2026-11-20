'use client';

// Today's queue: loans ranked by expected recovery x roll risk, with the channel and time each
// borrower actually answers, a suggested offer, and the illustrative 7-calls-in-7-days limit.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ACTION_NAME, BAND_SHORT, CHANNEL, Card, ErrorBox, OFFER, PoweredBy, SourceChip, Tag, Thinking, pct0, riskTone, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_ACCOUNTS, fetchQueue } from '@/lib/client';

const FILTERS = [
  ['ALL', 'All'], ['EVENING_SMS', 'Texts back in the evening'], ['BROKEN', '2+ broken promises'],
  ['DISASTER', 'Disaster eligible'], ['NEAR_LIMIT', 'Near call limit'],
] as const;

function QueueView() {
  const params = useSearchParams();
  const router = useRouter();
  const filter = FILTERS.some(([f]) => f === params.get('filter')) ? params.get('filter')! : 'ALL';
  const q = useAsync(() => fetchQueue(filter), [filter]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Today&apos;s queue, Mon Nov 16</h1>
          <p className="text-sm muted">Loans 1 to 59 days past due, ranked by expected recovery (past due × reach rate) × roll risk.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>Dynamic Tables</PoweredBy><PoweredBy>Snowpark ML</PoweredBy><SourceChip ms={q.data?.ms} source={q.data?.source} /></div>
      </div>
      <Card title="Accounts to start with">
        <div className="grid sm:grid-cols-3 gap-2">
          {STORY_ACCOUNTS.map((c) => (
            <Link key={c.id} href={`/account/?id=${c.id}`} className="card card-hover p-3 no-underline block">
              <div className="text-sm font-semibold">{c.title}</div><div className="text-xs muted">{c.id} · {c.hint}</div>
            </Link>
          ))}
        </div>
      </Card>
      <div className="seg flex flex-wrap w-fit max-w-full" role="tablist" aria-label="Queue filter">
        {FILTERS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} aria-pressed={filter === id}
            onClick={() => router.replace(id === 'ALL' ? '/queue/' : `/queue/?filter=${id}`)} className="px-3 py-1.5 text-xs font-medium">{label}</button>
        ))}
      </div>
      {q.error ? <ErrorBox error={q.error} /> : q.loading || !q.data ? <Thinking label="Loading the queue" /> : (
        <Card title={`${q.data.total.toLocaleString()} accounts${q.data.total > q.data.rows.length ? ` · showing the top ${q.data.rows.length}` : ''}`}>
          <div className="relative overflow-x-auto">
            <table className="data-table w-full text-sm min-w-[940px]">
              <thead><tr><th className="text-right">#</th><th className="text-left">Borrower</th><th className="text-left">Delinquency</th><th className="text-right">Roll risk</th>
                <th className="text-right">Expected recovery</th><th className="text-left">Contact plan</th><th className="text-left">Suggested offer</th><th className="text-left">Calls, 7 days</th></tr></thead>
              <tbody>
                {q.data.rows.map((r) => {
                  const changed = r.USUAL_CHANNEL && (r.USUAL_CHANNEL !== r.PLAN_CHANNEL || r.USUAL_BAND !== r.BEST_BAND);
                  const atLimit = r.CALLS_7D >= r.CALL_LIMIT_7D;
                  return (
                    <tr key={r.ACCOUNT_ID}>
                      <td className="text-right tabular muted">{r.QUEUE_RANK}</td>
                      <td><Link href={`/account/?id=${r.ACCOUNT_ID}`} className="font-semibold underline-offset-2">{r.CUSTOMER_NAME}</Link>
                        <div className="text-xs muted">{r.ACCOUNT_ID} · {r.PRODUCT === 'AUTO' ? 'Auto' : 'Personal'} · {r.CITY}, {r.STATE}</div>
                        {r.LAST_ACTION && <div className="text-xs mt-0.5" style={{ color: 'var(--positive)' }}>{ACTION_NAME[r.LAST_ACTION] ?? r.LAST_ACTION}</div>}</td>
                      <td><div className="tabular font-medium">{r.DPD} DPD</div><div className="text-xs muted tabular">{usd(r.PAST_DUE)} past due</div>
                        {r.PROMISES_BROKEN > 0 && <div className="text-xs" style={{ color: 'var(--negative)' }}>{r.PROMISES_BROKEN} broken promise{r.PROMISES_BROKEN > 1 ? 's' : ''}</div>}</td>
                      <td className="text-right"><Tag tone={riskTone(r.ROLL_RISK)}>{pct0(r.ROLL_RISK)}</Tag></td>
                      <td className="text-right tabular">{usd(r.EXPECTED_RECOVERY)}</td>
                      <td><div className="font-medium">{CHANNEL[r.PLAN_CHANNEL]}, {BAND_SHORT[r.BEST_BAND]}</div>
                        <div className="text-xs muted">reach rate {pct0(r.BEST_REACH_RATE)}</div>
                        {changed && <div className="text-xs" style={{ color: 'var(--warning)' }}>usually {CHANNEL[r.USUAL_CHANNEL!].toLowerCase()}, {BAND_SHORT[r.USUAL_BAND!]} ({pct0(r.USUAL_REACH_RATE ?? 0)})</div>}</td>
                      <td>{r.SUGGESTED_OFFER === 'DISASTER_FORBEARANCE' ? <Tag tone="warning">{OFFER[r.SUGGESTED_OFFER]}</Tag> : <span>{OFFER[r.SUGGESTED_OFFER]}</span>}</td>
                      <td><Tag tone={atLimit ? 'danger' : r.CALLS_7D >= r.CALL_LIMIT_7D - 1 ? 'warning' : 'neutral'}>{r.CALLS_7D} of {r.CALL_LIMIT_7D}</Tag></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs muted mt-3">Reach rates are smoothed from each borrower&apos;s contact history. The 7-calls-in-7-days limit is illustrative; add your own rules. In Live mode the queue is the APP.TODAY_QUEUE dynamic table.</p>
        </Card>
      )}
    </div>
  );
}

export default function QueuePage() {
  return <Suspense fallback={<Thinking label="Loading the queue" />}><QueueView /></Suspense>;
}
