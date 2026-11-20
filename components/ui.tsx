'use client';

// Calvessa UI kit: panels, KPI tiles with counters and sparklines, pills, chips, skeletons, empty
// states, chart tooltips, the page band, and a tiny markdown renderer for AI text.
import { AlertTriangle, Bot, Inbox, Sparkles, Timer } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export type Tone = 'neutral' | 'dusk' | 'ember' | 'cure' | 'caution' | 'roll' | 'sample' | 'danger' | 'warning' | 'positive';
const TONE: Record<Tone, string> = {
  neutral: 'neutral', dusk: 'dusk', ember: 'ember', cure: 'cure', caution: 'caution', roll: 'roll', sample: 'sample',
  danger: 'roll', warning: 'caution', positive: 'cure',
};
export const toneVar = (t: Tone) => (TONE[t] === 'neutral' ? 'var(--ink-2)' : `var(--${TONE[t]})`);

export function Tag({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return <span title={title} className={`pill tone-${TONE[tone]}`}>{children}</span>;
}

export function Panel({ title, sub, right, children, className = '', pad = true }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`panel ${pad ? 'p-4 sm:p-5' : ''} ${className}`}>
      {(title || right) && (
        <div className={`flex items-start justify-between gap-3 flex-wrap ${pad ? 'mb-4' : 'p-4 sm:p-5 pb-3'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {sub && <p className="text-xs muted mt-0.5">{sub}</p>}
          </div>
          {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
/** Kept for older call sites. */
export const Card = Panel;

/** Counts up to a number once (static when the reader prefers reduced motion). */
export function useCountUp(target: number, ms = 650) {
  const [v, setV] = useState(target);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    done.current = true;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Kpi({ label, value, format, sub, spark, tone = 'dusk', delta }: {
  label: string; value: number; format: (v: number) => string; sub?: ReactNode; spark?: number[]; tone?: Tone;
  delta?: { text: string; good: boolean };
}) {
  const v = useCountUp(value);
  const data = spark?.map((y, i) => ({ i, y }));
  const id = `sp-${label.replace(/\W/g, '')}`;
  return (
    <div className="panel panel-hover p-4 relative overflow-hidden">
      <div className="text-[11px] uppercase tracking-[.08em] font-bold muted">{label}</div>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <div className="display text-[28px] leading-none font-bold tabular">{format(v)}</div>
        {delta && <Tag tone={delta.good ? 'cure' : 'roll'}>{delta.text}</Tag>}
      </div>
      {sub && <div className="text-xs muted mt-1.5">{sub}</div>}
      {data && data.length > 1 && (
        <div className="h-9 -mx-1 mt-2" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={toneVar(tone)} stopOpacity={0.35} /><stop offset="1" stopColor={toneVar(tone)} stopOpacity={0} /></linearGradient></defs>
              <Area isAnimationActive={false} dataKey="y" stroke={toneVar(tone)} strokeWidth={1.6} fill={`url(#${id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Names the Snowflake capability behind a screen or widget. */
export function PoweredBy({ children, onBand = false }: { children: ReactNode; onBand?: boolean }) {
  return <span className={`pill ${onBand ? 'chip-on-band' : 'tone-dusk'}`}><Sparkles className="w-3 h-3" aria-hidden />{children}</span>;
}

export function SampleAiBadge() {
  return <span className="pill tone-sample" title="Scripted answer captured from a live run, not live Cortex output"><Bot className="w-3 h-3" aria-hidden />Sample AI response</span>;
}

/** Where a widget's data came from: queried just now (Live) or the bundled live capture (Sample). */
export function SourceChip({ ms, source, onBand = false }: { ms?: number; source?: 'live' | 'captured'; onBand?: boolean }) {
  if (!source) return null;
  const live = source === 'live';
  return (
    <span className={`pill ${onBand ? 'chip-on-band' : live ? 'tone-cure' : 'tone-neutral'}`} title={live ? 'Queried from Snowflake just now' : 'Bundled rows captured from a live run'}>
      <Timer className="w-3 h-3" aria-hidden />{live ? `${(ms ?? 0).toLocaleString()} ms · live query` : 'captured sample'}
    </span>
  );
}

/** The dusk gradient band that opens every page. */
export function PageBand({ eyebrow, title, sub, chips }: { eyebrow: string; title: ReactNode; sub?: ReactNode; chips?: ReactNode }) {
  return (
    <div className="band rounded-[20px] px-5 sm:px-7 pt-6 pb-14 -mb-9 shadow-lg">
      <div className="relative z-10">
        <div className="text-[11px] uppercase tracking-[.14em] font-bold opacity-80">{eyebrow}</div>
        <h1 className="text-[24px] sm:text-[28px] font-bold mt-1 leading-tight">{title}</h1>
        {sub && <p className="text-sm opacity-85 mt-1.5 max-w-3xl">{sub}</p>}
        {chips && <div className="flex flex-wrap gap-2 mt-3">{chips}</div>}
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div role="alert" className="panel p-4 text-sm flex gap-3 items-start" style={{ borderColor: 'var(--roll)' }}>
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-none" style={{ color: 'var(--roll)' }} aria-hidden />
      <div><strong style={{ color: 'var(--roll)' }}>Couldn’t load this.</strong> <span className="muted">{error}</span></div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <div className="w-10 h-10 rounded-full flex items-center justify-center tone-dusk mb-2"><Inbox className="w-5 h-5" aria-hidden /></div>
      <div className="text-sm font-semibold">{title}</div>
      {children && <div className="text-xs muted mt-1 max-w-sm">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
/** Page-level loading state: band plus shimmering tiles and panels. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="band rounded-[20px] h-36 -mb-9 opacity-90" />
      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 px-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Skeleton className="h-72" /><Skeleton className="h-72" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
export const Thinking = ({ label = 'Loading' }: { label?: string }) => <PageSkeleton label={label} />;

/** Recharts tooltip in the Calvessa style. */
export function ChartTip({ active, payload, label, fmt }: {
  active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: string | number;
  fmt?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-xs" style={{ boxShadow: 'var(--shadow-hover)' }}>
      {label !== undefined && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 tabular">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="muted">{p.name}</span><span className="ml-auto font-semibold pl-3">{fmt ? fmt(Number(p.value), String(p.name)) : Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
export const AXIS = { fontSize: 11, fill: 'var(--ink-2)' };

// Minimal markdown: headings by bold, lists, tables, bold/italic. Text is escaped by React.
function inline(s: string, key: number): ReactNode {
  // Italics need a word boundary, so identifiers like BROKEN_PROMISES_NOV stay intact.
  const parts = s.split(/(\*\*[^*]+\*\*|(?<![\w])_[^_\s][^_]*_(?![\w])|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/g).filter(Boolean);
  return <span key={key}>{parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong>
      : (p.startsWith('_') && p.endsWith('_')) || (p.startsWith('*') && p.endsWith('*') && p.length > 2) ? <em key={i}>{p.slice(1, -1)}</em>
        : p)}</span>;
}
export function Markdown({ text, caret = false }: { text: string; caret?: boolean }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      if (!body.length) continue;
      out.push(<table key={k++}><thead><tr>{body[0].map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr></thead>
        <tbody>{body.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      const li = items.map((t, j) => <li key={j}>{inline(t, j)}</li>);
      out.push(ordered ? <ol key={k++}>{li}</ol> : <ul key={k++}>{li}</ul>);
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { i++; continue; } // horizontal rule
    if (/^#{1,4}\s/.test(l)) { out.push(<p key={k++}><strong>{inline(l.replace(/^#+\s/, '').replace(/\*\*/g, ''), 0)}</strong></p>); i++; continue; }
    if (l.trim()) out.push(<p key={k++}>{inline(l, 0)}</p>);
    i++;
  }
  return <div className={`prose-ai text-[13.5px] leading-relaxed ${caret ? 'caret-last' : ''}`}>{out}{caret && <span className="caret" aria-hidden />}</div>;
}

export const money = (x: number): string => {
  if (x < 0) return `−${money(-x)}`;
  return x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${Math.round(x / 1e3)}K` : `$${Math.round(x)}`;
};
export const usd = (x: number) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const usd0 = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
export const pct0 = (x: number) => `${Math.round(x * 100)}%`;
export const fmtInt = (x: number) => Math.round(x).toLocaleString('en-US');

export const CHANNEL: Record<string, string> = { CALL: 'Call', SMS: 'Text', EMAIL: 'Email' };
export const BAND: Record<string, string> = { MORNING: 'morning (8am to noon)', AFTERNOON: 'afternoon (noon to 5pm)', EVENING: 'evening (after 5pm)' };
export const BAND_SHORT: Record<string, string> = { MORNING: 'morning', AFTERNOON: 'afternoon', EVENING: 'evening' };
export const OFFER: Record<string, string> = {
  DISASTER_FORBEARANCE: 'Disaster forbearance', PAYMENT_DEFERRAL: 'Payment deferral', REDUCED_PAYMENT_PLAN: 'Reduced payment plan',
  EXTENDED_TERM: 'Term extension', PROMISE_TO_PAY: 'Promise to pay',
};
export const OUTCOME: Record<string, string> = {
  RIGHT_PARTY_CONTACT: 'Reached', REPLIED: 'Replied', PROMISE_MADE: 'Promise made', NO_ANSWER: 'No answer', LEFT_MESSAGE: 'Left message',
  WRONG_NUMBER: 'Wrong number', NO_REPLY: 'No reply',
};
export const REACHED = ['RIGHT_PARTY_CONTACT', 'REPLIED', 'PROMISE_MADE'];
export const ACTION_NAME: Record<string, string> = { LOG_PROMISE: 'Promise logged', ENROLL_HARDSHIP: 'Hardship enrollment requested', SCHEDULE: 'Contact scheduled' };
export const riskTone = (r: number): Tone => (r >= 0.8 ? 'roll' : r >= 0.5 ? 'caution' : 'neutral');
