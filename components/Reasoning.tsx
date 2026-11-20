'use client';

// AI interactions: staged reasoning steps (with real counts from the record), then a streaming-style
// reveal of the answer, then its sources. Sample mode paces the steps over SAMPLE_DELAY_MS (4 to 8 s);
// Live mode shows the same steps until the real Cortex response arrives, with no added delay.
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Markdown, SampleAiBadge } from '@/components/ui';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';
import type { AiText } from '@/lib/types';

export type ReasoningKind = keyof typeof SAMPLE_DELAY_MS;

export function Reasoning({ kind, steps }: { kind: ReasoningKind; steps: string[] }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => window.clearInterval(id);
  }, []);
  const per = SAMPLE_DELAY_MS[kind] / steps.length;
  const step = Math.min(steps.length - 1, Math.floor(elapsed / per));
  return (
    <div role="status" aria-live="polite" className="rise">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--dusk)' }}><span className="orb" aria-hidden />Working</div>
        <span className="text-[11px] muted tabular">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <li key={s} className="flex items-start gap-2.5 text-[13px]" style={{ opacity: state === 'todo' ? 0.45 : 1, transition: 'opacity .3s' }}>
              <span className={`step-dot ${state === 'done' ? 'tone-cure' : state === 'active' ? 'tone-dusk' : 'tone-neutral'}`}>
                {state === 'done' ? <Check className="w-3 h-3" aria-hidden /> : state === 'active' ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <span className="text-[10px] font-bold">{i + 1}</span>}
              </span>
              <span className={state === 'active' ? 'font-semibold' : ''}>{s}</span>
            </li>
          );
        })}
      </ol>
      <div className="track mt-4" aria-hidden><span style={{ width: `${Math.min(96, (elapsed / SAMPLE_DELAY_MS[kind]) * 100)}%`, background: 'linear-gradient(90deg, var(--dusk), var(--ember))' }} /></div>
    </div>
  );
}

/** Reveals text word by word (about 1.5 to 2.5 s), then renders it whole. */
export function StreamText({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduce ? words.length : 0);
  useEffect(() => {
    if (n >= words.length) return;
    const per = Math.max(1, Math.ceil(words.length / 90));
    const id = window.setTimeout(() => setN((x) => Math.min(words.length, x + per)), 22);
    return () => window.clearTimeout(id);
  }, [n, words.length]);
  const done = n >= words.length;
  return <Markdown text={done ? text : words.slice(0, n).join('')} caret={!done} />;
}

export function Sources({ items }: { items: { label: string; detail?: string }[] }) {
  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="text-[11px] uppercase tracking-[.08em] font-bold muted mb-2">Sources</div>
      <ol className="flex flex-wrap gap-2">
        {items.map((s, i) => (
          <li key={s.label} className="pill tone-neutral" title={s.detail}><span className="mono text-[10px] opacity-70">[{i + 1}]</span>{s.label}</li>
        ))}
      </ol>
    </div>
  );
}

/** Header line for a finished AI answer: Sample label or live latency and model. */
export function AiMeta({ ai }: { ai: AiText }) {
  return ai.source === 'sample' ? <SampleAiBadge /> : <span className="pill tone-cure">{(ai.latencyMs / 1000).toFixed(1)} s · {ai.model} · live</span>;
}

export function AiPanel({ title, icon, right, children }: { title: string; icon: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel ai-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-[15px] font-semibold flex items-center gap-2">{icon}{title}</h2>
        {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
      </div>
      {children}
    </section>
  );
}
