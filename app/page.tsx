'use client';

// Portfolio: delinquency by days-past-due bucket, the 30+ DPD trend, roll and cure rates over the
// last two 30-day windows, the promise-kept rate, what the data shows, and the roll-risk model.
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ErrorBox, Kpi, PoweredBy, SourceChip, Thinking, money, pct0 } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchOverview } from '@/lib/client';

const TIP = { background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 };
const FEATURE: Record<string, string> = {
  PROMISES_BROKEN: 'Broken promises', DPD: 'Days past due', PROMISES_MADE: 'Promises made', CREDIT_SCORE: 'Credit score',
  REACH_RATE_30D: 'Reach rate, 30 days', DAYS_SINCE_PAYMENT: 'Days since last payment', PAST_DUE: 'Amount past due', BALANCE: 'Balance',
  ATTEMPTS_30D: 'Contact attempts, 30 days', CALLS_7D: 'Calls, 7 days', PROMISES_KEPT: 'Promises kept', PRIOR_DELINQ_12M: 'Prior delinquencies', IS_AUTO: 'Auto loan',
};

export default function Portfolio() {
  const { data: o, error, loading } = useAsync(fetchOverview, []);
  if (error) return <ErrorBox error={error} />;
  if (loading || !o) return <Thinking label="Loading the portfolio" />;
  const k = o.kpis;
  const delinquentBuckets = o.buckets.filter((b) => b.BUCKET !== 'Current');
  const trend = o.trend.map((d) => ({ ...d, day: d.DAY.slice(5) }));
  const lift = Object.fromEntries(o.model.brokenPromiseLift.map((l) => [l.group, l]));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Collections portfolio, Nov 15, 2026</h1>
          <p className="text-sm muted">{k.accounts.toLocaleString()} open auto and personal loans on synthetic data. Days past due (DPD) are counted at the end of each day.</p>
        </div>
        <SourceChip ms={o.ms} source={o.source} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Delinquent" value={k.delinquent.toLocaleString()} sub={`${(k.delinquent / k.accounts * 100).toFixed(1)}% of loans`} />
        <Kpi label="30+ DPD rate" value={`${k.dpd30Rate.toFixed(2)}%`} sub="of all loans" />
        <Kpi label="Past due" value={money(k.pastDue)} sub="across delinquent loans" />
        <Kpi label="Roll rate" value={pct0(k.rollRate)} sub="1 to 59 DPD that rolled to a worse bucket in 30 days" />
        <Kpi label="Cure rate" value={pct0(k.cureRate)} sub="delinquent that became current" />
        <Kpi label="Promise-kept rate" value={pct0(k.keptRate)} sub="resolved promises, Aug to Nov" />
      </div>

      <Card title="What the data shows" right={<PoweredBy>Dynamic Tables</PoweredBy>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/queue/?filter=EVENING_SMS" className="card card-hover p-3 no-underline block">
            <div className="text-sm font-semibold">{o.stories.eveningTexters} borrowers answer evening texts</div>
            <div className="text-xs muted mt-1">but are mostly called in the morning, when they rarely answer. The queue plans an evening text instead.</div>
          </Link>
          <Link href="/queue/?filter=BROKEN" className="card card-hover p-3 no-underline block">
            <div className="text-sm font-semibold">Two broken promises predict a roll</div>
            <div className="text-xs muted mt-1">{pct0(lift['2+ broken promises']?.rollRate ?? 0)} of past episodes with 2+ broken promises reached 60+ DPD, against {pct0(lift['No broken promises']?.rollRate ?? 0)} with none. {o.stories.brokenTwice} accounts broke two promises this month.</div>
          </Link>
          <Link href="/queue/?filter=DISASTER" className="card card-hover p-3 no-underline block">
            <div className="text-sm font-semibold">{o.stories.disasterEligible} flood-area borrowers are hardship eligible</div>
            <div className="text-xs muted mt-1">{money(o.stories.disasterPastDue)} past due in 20 ZIP codes under a declared disaster (a synthetic event). None is enrolled yet.</div>
          </Link>
          <Link href="/qa/" className="card card-hover p-3 no-underline block">
            <div className="text-sm font-semibold">{o.stories.flaggedCalls} calls flagged in QA</div>
            <div className="text-xs muted mt-1">including one where the agent threatened arrest and discussed the debt with a relative.</div>
          </Link>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="min-w-0" title="Delinquent loans by DPD bucket" right={<PoweredBy>Snowflake SQL</PoweredBy>}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={delinquentBuckets} margin={{ left: -6, right: 4, top: 6 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="BUCKET" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis yAxisId="a" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => money(Number(v))} />
                <Tooltip contentStyle={TIP} formatter={(v, n) => (n === 'Past due' ? money(Number(v)) : Number(v).toLocaleString())} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} yAxisId="a" dataKey="ACCOUNTS" name="Loans" fill="var(--brand)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                <Bar isAnimationActive={false} yAxisId="b" dataKey="PAST_DUE" name="Past due" fill="var(--warning)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="min-w-0" title="Delinquency rate by day, Aug 1 to Nov 15">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ left: -10, right: 8, top: 6 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={14} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => `${v}%`} domain={['auto', 'auto']} />
                <Tooltip contentStyle={TIP} formatter={(v) => `${Number(v).toFixed(2)}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line isAnimationActive={false} dataKey="DELINQ_RATE" name="1+ DPD" stroke="var(--warning)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} dataKey="DPD30_RATE" name="30+ DPD" stroke="var(--negative)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs muted mt-2">Share of open loans past due. The rate holds near 5% through September, then rises from mid-October as the story cohorts fall behind, including flood-area borrowers after the Oct 27 declaration. Loans leave the book when charged off at 120 DPD.</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 min-w-0" title="Roll and cure rates by starting bucket">
          <div className="relative overflow-x-auto">
            <table className="data-table w-full text-sm min-w-[520px]">
              <thead><tr><th className="text-left">30-day window</th><th className="text-left">From</th><th className="text-right">Loans</th><th className="text-right">Cured</th><th className="text-right">Rolled worse or charged off</th></tr></thead>
              <tbody>
                {o.roll.map((r) => (
                  <tr key={r.WINDOW + r.FROM_BUCKET}>
                    <td>{r.WINDOW}</td><td>{r.FROM_BUCKET} DPD</td><td className="text-right tabular">{r.ACCOUNTS.toLocaleString()}</td>
                    <td className="text-right tabular" style={{ color: 'var(--positive)' }}>{pct0(r.CURED / r.ACCOUNTS)}</td>
                    <td className="text-right tabular" style={{ color: 'var(--negative)' }}>{pct0(r.ROLLED / r.ACCOUNTS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="lg:col-span-2 min-w-0" title="Promises kept and broken, by due month">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={o.promises} margin={{ left: -14, right: 4, top: 6 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="MONTH" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip contentStyle={TIP} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="KEPT" name="Kept" stackId="p" fill="var(--positive)" fillOpacity={0.75} />
                <Bar isAnimationActive={false} dataKey="BROKEN" name="Broken" stackId="p" fill="var(--negative)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title={`Roll-risk model: ${o.registry.name} ${o.registry.version}`} right={<><PoweredBy>Snowpark ML (XGBoost)</PoweredBy><PoweredBy>Model Registry</PoweredBy></>}>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1">
            <div><span className="muted">Predicts:</span> {o.model.label}</div>
            <div><span className="muted">Test AUC:</span> <strong className="tabular">{o.model.auc.toFixed(3)}</strong> on {o.model.testRows.toLocaleString()} held-out snapshots</div>
            <div><span className="muted">Training:</span> {o.model.trainRows.toLocaleString()} snapshots; {o.model.trainingWindow.toLowerCase()}</div>
            <div className="text-xs muted">Scores today&apos;s 1 to 59 DPD loans in the warehouse with the registered model. A daily task can rescore once resumed.</div>
          </div>
          <ul className="md:col-span-2 space-y-2">
            {o.model.importance.slice(0, 6).map((f) => (
              <li key={f.feature}>
                <div className="flex justify-between"><span>{FEATURE[f.feature] ?? f.feature}</span><span className="tabular muted">{pct0(f.importance)}</span></div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${(f.importance / o.model.importance[0].importance) * 100}%`, background: 'var(--accent)' }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs muted mt-3">Feature importance by gain. Model quality describes this synthetic data set only.</p>
      </Card>
    </div>
  );
}
