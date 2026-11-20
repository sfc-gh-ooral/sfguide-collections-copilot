'use client';

// Portfolio: delinquency by DPD bucket, the daily trend, the roll ladder (roll and cure by bucket over
// the last two 30-day windows), the promise-kept rate, the planted stories, and the roll-risk model.
import { ArrowDownRight, ArrowRight, CloudRain, HandHeart, MessageSquareText, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, ChartTip, ErrorBox, Kpi, PageBand, PageSkeleton, Panel, PoweredBy, SourceChip, fmtInt, money, pct0 } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchOverview } from '@/lib/client';
import type { Overview } from '@/lib/types';

const FEATURE: Record<string, string> = {
  PROMISES_BROKEN: 'Broken promises', DPD: 'Days past due', PROMISES_MADE: 'Promises made', CREDIT_SCORE: 'Credit score',
  REACH_RATE_30D: 'Reach rate, 30 days', DAYS_SINCE_PAYMENT: 'Days since last payment', PAST_DUE: 'Amount past due', BALANCE: 'Balance',
  ATTEMPTS_30D: 'Contact attempts, 30 days', CALLS_7D: 'Calls, 7 days', PROMISES_KEPT: 'Promises kept', PRIOR_DELINQ_12M: 'Prior delinquencies', IS_AUTO: 'Auto loan',
};
const BUCKET_COLOR: Record<string, string> = { '1-29': 'var(--caution)', '30-59': 'var(--ember)', '60-89': 'var(--roll)', '90+': 'var(--dusk)' };

function Stories({ o }: { o: Overview }) {
  const lift = Object.fromEntries(o.model.brokenPromiseLift.map((l) => [l.group, l]));
  const items = [
    { href: '/queue/?filter=EVENING_SMS', icon: MessageSquareText, color: 'var(--ember)', n: o.stories.eveningTexters, title: 'answer evening texts but get morning calls',
      body: 'Their own history says text after 5pm. The queue now plans exactly that.' },
    { href: '/queue/?filter=BROKEN', icon: ArrowDownRight, color: 'var(--roll)', n: o.stories.brokenTwice, title: 'broke two promises this month',
      body: `${pct0(lift['2+ broken promises']?.rollRate ?? 0)} of past episodes like this reached 60+ DPD, against ${pct0(lift['No broken promises']?.rollRate ?? 0)} with none.` },
    { href: '/queue/?filter=DISASTER', icon: CloudRain, color: 'var(--dusk)', n: o.stories.disasterEligible, title: 'flood-area borrowers are hardship eligible',
      body: `${money(o.stories.disasterPastDue)} past due across 20 ZIP codes under a declared (synthetic) disaster. None enrolled yet.` },
    { href: '/qa/', icon: ShieldAlert, color: 'var(--roll)', n: o.stories.flaggedCalls, title: 'calls flagged in QA',
      body: 'Including one where the agent threatened arrest and discussed the debt with a relative.' },
  ];
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map(({ href, icon: Icon, color, n, title, body }) => (
        <Link key={href} href={href} className="panel panel-hover p-4 no-underline group flex flex-col">
          <div className="flex items-center justify-between">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
            <ArrowRight className="w-4 h-4 muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
          <div className="mt-3"><span className="display text-[22px] font-bold tabular" style={{ color }}>{n.toLocaleString()}</span> <span className="text-sm font-semibold">{title}</span></div>
          <p className="text-xs muted mt-1.5">{body}</p>
        </Link>
      ))}
    </div>
  );
}

/** Each delinquent bucket as a rung: share that cured vs rolled worse in the latest 30 days, with the prior window. */
function RollLadder({ o }: { o: Overview }) {
  const windows = [...new Set(o.roll.map((r) => r.WINDOW))];
  const [cur, prev] = windows;
  const rows = o.roll.filter((r) => r.WINDOW === cur);
  return (
    <ol className="space-y-4">
      {rows.map((r) => {
        const p = o.roll.find((x) => x.WINDOW === prev && x.FROM_BUCKET === r.FROM_BUCKET);
        const cure = r.CURED / r.ACCOUNTS, roll = r.ROLLED / r.ACCOUNTS;
        const was = p ? p.ROLLED / p.ACCOUNTS : undefined;
        return (
          <li key={r.FROM_BUCKET}>
            <div className="flex items-baseline justify-between gap-2 text-sm flex-wrap">
              <span className="font-semibold"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: BUCKET_COLOR[r.FROM_BUCKET] }} />{r.FROM_BUCKET} DPD <span className="muted font-normal">· {fmtInt(r.ACCOUNTS)} loans</span></span>
              <span className="text-xs muted tabular">{was !== undefined && <>roll {pct0(was)} → <strong style={{ color: roll > was ? 'var(--roll)' : 'var(--cure)' }}>{pct0(roll)}</strong> vs prior 30 days</>}</span>
            </div>
            <div className="flex h-7 rounded-lg overflow-hidden mt-1.5 text-[11px] font-bold" role="img" aria-label={`${r.FROM_BUCKET} DPD: ${pct0(cure)} cured, ${pct0(roll)} rolled worse or charged off`}>
              <div className="flex items-center pl-2" style={{ width: `${cure * 100}%`, background: 'color-mix(in srgb, var(--cure) 22%, transparent)', color: 'var(--cure)' }}>{pct0(cure)} cured</div>
              <div className="flex items-center justify-end pr-2 flex-1" style={{ background: 'color-mix(in srgb, var(--roll) 18%, transparent)', color: 'var(--roll)' }}>{pct0(roll)} rolled</div>
            </div>
          </li>
        );
      })}
      <li className="text-xs muted">Window {cur}, compared with {prev}. &ldquo;Rolled&rdquo; means a worse bucket or charge-off at 120 DPD.</li>
    </ol>
  );
}

export default function Portfolio() {
  const { data: o, error, loading } = useAsync(fetchOverview, []);
  if (error) return <ErrorBox error={error} />;
  if (loading || !o) return <PageSkeleton label="Loading the portfolio" />;
  const k = o.kpis;
  const t = o.trend;
  const ago = t[Math.max(0, t.length - 31)], last = t[t.length - 1];
  const delta = (a: number, b: number, fmt: (x: number) => string) => ({ text: `${b >= a ? '+' : '−'}${fmt(Math.abs(b - a))} 30d`, good: b < a });
  const trend = t.map((d) => ({ ...d, day: new Date(d.DAY + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) }));
  const buckets = o.buckets.filter((b) => b.BUCKET !== 'Current');
  const promises = o.promises.map((p) => ({ ...p, MONTH: p.MONTH.replace(' 2026', '') }));
  return (
    <div className="space-y-5">
      <PageBand eyebrow="Northwind Financial · consumer collections" title="Portfolio health, Nov 15, 2026"
        sub={`${fmtInt(k.accounts)} open auto and personal loans on synthetic data. Days past due (DPD) counted at the end of each day.`}
        chips={<><PoweredBy onBand>Dynamic Tables</PoweredBy><PoweredBy onBand>Snowpark ML · Model Registry</PoweredBy><SourceChip onBand ms={o.ms} source={o.source} /></>} />

      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 px-2 sm:px-3">
        <Kpi label="Delinquent loans" value={k.delinquent} format={fmtInt} spark={t.map((d) => d.DELINQUENT)} tone="caution"
          sub={`${(k.delinquent / k.accounts * 100).toFixed(1)}% of the book`} delta={delta(ago.DELINQUENT, last.DELINQUENT, fmtInt)} />
        <Kpi label="30+ DPD rate" value={k.dpd30Rate} format={(v) => `${v.toFixed(2)}%`} spark={t.map((d) => d.DPD30_RATE)} tone="roll"
          sub="of all open loans" delta={delta(ago.DPD30_RATE, last.DPD30_RATE, (x) => `${x.toFixed(2)} pt`)} />
        <Kpi label="Amount past due" value={k.pastDue} format={money} spark={t.map((d) => d.PAST_DUE)} tone="ember"
          sub="across delinquent loans" delta={delta(ago.PAST_DUE, last.PAST_DUE, money)} />
        <Kpi label="Roll rate" value={k.rollRate * 100} format={(v) => `${Math.round(v)}%`} tone="roll" sub="1 to 59 DPD rolled worse in 30 days" />
        <Kpi label="Cure rate" value={k.cureRate * 100} format={(v) => `${Math.round(v)}%`} tone="cure" sub="delinquent loans back to current" />
        <Kpi label="Promise-kept rate" value={k.keptRate * 100} format={(v) => `${Math.round(v)}%`} spark={o.promises.map((p) => p.KEPT_RATE)} tone="dusk" sub="resolved promises, Aug to Nov" />
      </div>

      <div>
        <h2 className="text-[15px] font-semibold mb-2.5 flex items-center gap-2"><HandHeart className="w-4 h-4" style={{ color: 'var(--ember)' }} aria-hidden />What the data shows this morning</h2>
        <Stories o={o} />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-3" title="Delinquency rate by day" sub="Aug 1 to Nov 15. Story cohorts fall behind from mid-October, including flood-area borrowers after the Oct 27 declaration.">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: -12, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--dusk)" stopOpacity={0.3} /><stop offset="1" stopColor="var(--dusk)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ember)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--ember)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" tick={AXIS} interval={20} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip fmt={(v) => `${v.toFixed(2)}%`} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Area isAnimationActive={false} dataKey="DELINQ_RATE" name="1+ DPD" stroke="var(--dusk)" strokeWidth={2} fill="url(#g1)" />
                <Area isAnimationActive={false} dataKey="DPD30_RATE" name="30+ DPD" stroke="var(--ember)" strokeWidth={2} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="lg:col-span-2" title="Roll ladder" sub="Where each bucket went in 30 days">
          <RollLadder o={o} />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Delinquent loans by DPD bucket" sub="Count of loans and amount past due" right={<PoweredBy>Snowflake SQL</PoweredBy>}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ left: -8, right: 4, top: 6 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="BUCKET" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(b) => `${b} DPD`} />
                <YAxis yAxisId="a" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis yAxisId="b" orientation="right" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => money(Number(v))} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip fmt={(v, n) => (n === 'Past due' ? money(v) : fmtInt(v))} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar isAnimationActive={false} yAxisId="a" dataKey="ACCOUNTS" name="Loans" fill="var(--dusk)" radius={[6, 6, 0, 0]} maxBarSize={38} />
                <Bar isAnimationActive={false} yAxisId="b" dataKey="PAST_DUE" name="Past due" fill="var(--ember)" radius={[6, 6, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Promises kept and broken" sub="By due month; November is month to date">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={promises} margin={{ left: -14, right: 4, top: 6 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="MONTH" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar isAnimationActive={false} dataKey="KEPT" name="Kept" stackId="p" fill="var(--cure)" maxBarSize={44} />
                <Bar isAnimationActive={false} dataKey="BROKEN" name="Broken" stackId="p" fill="var(--roll)" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title={`Roll-risk model · ${o.registry.name} ${o.registry.version}`} sub={`Predicts: ${o.model.label}`}
        right={<><PoweredBy>Trained with Snowpark ML</PoweredBy><PoweredBy>Model Registry · batch scores</PoweredBy></>}>
        <div className="grid md:grid-cols-3 gap-5 text-sm">
          <div className="space-y-3">
            <div className="flex gap-6">
              <div><div className="text-[11px] uppercase font-bold muted tracking-wider">Test AUC</div><div className="display text-[28px] font-bold tabular" style={{ color: 'var(--dusk)' }}>{o.model.auc.toFixed(3)}</div></div>
              <div><div className="text-[11px] uppercase font-bold muted tracking-wider">Held out</div><div className="display text-[28px] font-bold tabular">{fmtInt(o.model.testRows)}</div></div>
            </div>
            <p className="text-xs muted">Trained on {fmtInt(o.model.trainRows)} snapshots ({o.model.trainingWindow.toLowerCase()}). Today&apos;s 1 to 59 DPD loans are scored in the warehouse with the registered model; a daily task can rescore once resumed.</p>
            <ul className="space-y-1.5">
              {o.model.brokenPromiseLift.slice().sort((a, b) => a.rollRate - b.rollRate).map((l) => (
                <li key={l.group} className="flex justify-between text-xs"><span>{l.group}</span><strong className="tabular" style={{ color: l.rollRate > 0.9 ? 'var(--roll)' : undefined }}>{pct0(l.rollRate)} reached 60+</strong></li>
              ))}
            </ul>
          </div>
          <ul className="md:col-span-2 space-y-2.5">
            {o.model.importance.slice(0, 7).map((f, i) => (
              <li key={f.feature}>
                <div className="flex justify-between text-[13px]"><span className={i === 0 ? 'font-semibold' : ''}>{FEATURE[f.feature] ?? f.feature}</span><span className="tabular muted">{pct0(f.importance)}</span></div>
                <div className="track mt-1"><span style={{ width: `${(f.importance / o.model.importance[0].importance) * 100}%`, background: i === 0 ? 'var(--roll)' : 'var(--dusk)' }} /></div>
              </li>
            ))}
            <li className="text-xs muted">Feature importance by gain. Model quality describes this synthetic data set only.</li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
