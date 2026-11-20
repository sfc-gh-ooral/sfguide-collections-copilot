'use client';

// Call QA: every reviewed transcript with compliance flags (a disclosure rule plus AI_CLASSIFY on
// agent conduct), flags by type and by agent, and AI coaching notes from AI_COMPLETE.
import { RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiMeta, AiPanel, Reasoning, Sources, StreamText } from '@/components/Reasoning';
import { AXIS, ChartTip, ErrorBox, Kpi, Markdown, PageBand, PageSkeleton, Panel, PoweredBy, SampleAiBadge, Skeleton, SourceChip, Tag, fmtInt } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_TRANSCRIPT, fetchQa, fetchQaDetail, reviewTranscript } from '@/lib/client';
import type { AiText, QaRow } from '@/lib/types';

const riskTag = (r: QaRow['RISK']) => <Tag tone={r === 'HIGH' ? 'roll' : r === 'MEDIUM' ? 'caution' : 'cure'}>{r === 'NONE' ? 'No issues' : `${r.toLowerCase()} risk`}</Tag>;

function Detail({ id }: { id: string }) {
  const d = useAsync(() => fetchQaDetail(id), [id]);
  const [ai, setAi] = useState<{ loading?: boolean; data?: AiText; error?: string }>({});
  useEffect(() => setAi({}), [id]);
  const rerun = () => { setAi({ loading: true }); reviewTranscript(id).then((data) => setAi({ data }), (e) => setAi({ error: String(e.message ?? e) })); };
  if (d.error) return <ErrorBox error={d.error} />;
  if (d.loading || !d.data) return <Skeleton className="h-80" />;
  const { row, transcript, coaching } = d.data;
  const lines = transcript.split('\n').filter((l) => l.trim());
  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <Panel className="lg:col-span-3" title={<span className="flex items-center gap-2 flex-wrap"><span className="mono">{row.TRANSCRIPT_ID}</span>{riskTag(row.RISK)}</span>}
        sub={<>{row.AGENT_NAME} · {row.CALL_TS} · <Link href={`/account/?id=${row.ACCOUNT_ID}`} className="underline mono">{row.ACCOUNT_ID}</Link></>}>
        {row.FLAGS.length > 0 && <div className="flex flex-wrap gap-1.5 mb-3">{row.FLAGS.map((f) => <Tag key={f} tone="roll">{f}</Tag>)}</div>}
        <ol className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {lines.map((l, i) => {
            const agent = /^agent/i.test(l);
            return (
              <li key={i} className={`flex gap-2 ${agent ? '' : 'flex-row-reverse'}`}>
                <span className="mono text-[10px] muted pt-2 w-5 text-right flex-none">{i + 1}</span>
                <div className="rounded-2xl px-3 py-2 text-[13px] max-w-[85%]" style={{ background: agent ? 'var(--surface-2)' : 'color-mix(in srgb, var(--dusk) 10%, transparent)' }}>{l}</div>
              </li>
            );
          })}
        </ol>
      </Panel>
      <div className="lg:col-span-2 space-y-4 min-w-0">
        {coaching && (
          <AiPanel title="Coaching note" icon={<ShieldCheck className="w-4 h-4" style={{ color: 'var(--dusk)' }} aria-hidden />}
            right={<><PoweredBy>AI_COMPLETE</PoweredBy>{d.data.source === 'captured' && <SampleAiBadge />}</>}>
            <Markdown text={coaching} />
            <p className="text-xs muted mt-2">Written when setup reviewed the call. A QA lead confirms before coaching.</p>
          </AiPanel>
        )}
        <AiPanel title="Fresh review" icon={<RefreshCw className="w-4 h-4" style={{ color: 'var(--ember)' }} aria-hidden />} right={ai.data && <AiMeta ai={ai.data} />}>
          {ai.error ? <ErrorBox error={ai.error} /> : ai.loading ? (
            <Reasoning kind="review" steps={[`Reading ${lines.length} transcript lines from CALL_TRANSCRIPTS`, 'Checking the required debt collection disclosure (phrase rule)',
              'Classifying agent conduct against 5 labels with AI_CLASSIFY', 'Writing coaching notes with AI_COMPLETE']} />
          ) : ai.data ? (
            <>
              {(ai.data.flags ?? []).length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{ai.data.flags!.map((f) => <Tag key={f} tone="roll">{f}</Tag>)}</div>}
              <StreamText text={ai.data.text} />
              <Sources items={[{ label: `Transcript ${row.TRANSCRIPT_ID}` }, { label: 'Disclosure phrase rule' }, { label: 'AI_CLASSIFY conduct labels' }]} />
            </>
          ) : (
            <div><button className="btn btn-ai" onClick={rerun}><RefreshCw className="w-4 h-4" aria-hidden />Review this call again</button>
              <p className="text-xs muted mt-2">Runs the rule, AI_CLASSIFY and AI_COMPLETE on this transcript now. Flags are for human review, not a legal finding.</p></div>
          )}
        </AiPanel>
      </div>
    </div>
  );
}

function QaView() {
  const id = useSearchParams().get('id') ?? STORY_TRANSCRIPT;
  const router = useRouter();
  const q = useAsync(fetchQa, []);
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.loading || !q.data) return <PageSkeleton label="Loading call QA" />;
  const d = q.data;
  const high = d.rows.filter((r) => r.RISK === 'HIGH').length;
  return (
    <div className="space-y-5">
      <PageBand eyebrow="Quality assurance · Oct 1 to Nov 15" title="Call QA"
        sub="Every reviewed call is checked for the debt collection disclosure and for agent conduct, with a coaching note for each flagged call. The list and KPIs were reviewed in setup; “Review this call again” runs AI_CLASSIFY and AI_COMPLETE now."
        chips={<><PoweredBy onBand>AI_CLASSIFY</PoweredBy><PoweredBy onBand>AI_COMPLETE</PoweredBy><SourceChip onBand ms={d.ms} source={d.source} /></>} />
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 px-2 sm:px-3">
        <Kpi label="Calls reviewed" value={d.reviewed} format={fmtInt} sub="transcript snippets" />
        <Kpi label="Flagged" value={d.flagged} format={fmtInt} tone="caution" sub={`${(d.flagged / d.reviewed * 100).toFixed(1)}% of calls`} />
        <Kpi label="High risk" value={high} format={fmtInt} tone="roll" sub="threats, third parties or abuse" />
        <Kpi label="Agents with flags" value={d.byAgent.filter((a) => a.FLAGGED > 0).length} format={fmtInt} tone="ember" sub={`of ${d.byAgent.length} agents`} />
      </div>
      <Detail id={id} />
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2" title="Flagged calls" sub="Select a call to open it above">
          <div className="relative overflow-x-auto">
            <table className="data-table text-[13px] min-w-[560px]">
              <thead><tr><th className="text-left">Call</th><th className="text-left">Agent</th><th className="text-left">Flags</th><th className="text-left">Risk</th></tr></thead>
              <tbody>{d.rows.filter((r) => r.FLAGS.length).map((r) => (
                <tr key={r.TRANSCRIPT_ID} className={`cursor-pointer ${r.TRANSCRIPT_ID === id ? 'is-active' : ''}`} onClick={() => { router.replace(`/qa/?id=${r.TRANSCRIPT_ID}`); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <td><span className="font-semibold mono">{r.TRANSCRIPT_ID}</span><div className="text-xs muted">{r.CALL_TS} · <span className="mono">{r.ACCOUNT_ID}</span></div></td>
                  <td>{r.AGENT_NAME}</td>
                  <td><div className="flex flex-wrap gap-1 max-w-[320px]">{r.FLAGS.map((f) => <Tag key={f}>{f}</Tag>)}</div></td>
                  <td>{riskTag(r.RISK)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Panel>
        <div className="space-y-4 min-w-0">
          <Panel title="Flags by type">
            <div style={{ height: 40 + d.byFlag.length * 34 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.byFlag} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide /><YAxis type="category" dataKey="FLAG" width={150} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip />} />
                  <Bar isAnimationActive={false} dataKey="N" name="Calls" fill="var(--roll)" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="By agent">
            <ul className="space-y-2">{d.byAgent.map((a) => (
              <li key={a.AGENT_NAME} className="text-[13px]">
                <div className="flex justify-between"><span>{a.AGENT_NAME}</span><span className="tabular muted">{a.FLAGGED} of {a.CALLS}</span></div>
                <div className="track !h-1.5 mt-1"><span style={{ width: `${(a.FLAGGED / Math.max(1, a.CALLS)) * 100}%`, background: a.FLAGGED / a.CALLS > 0.15 ? 'var(--roll)' : 'var(--caution)' }} /></div>
              </li>))}</ul>
          </Panel>
        </div>
      </div>
      <p className="text-xs muted">A phrase rule checks the disclosure; AI_CLASSIFY reviews conduct against five labels you can edit. Flags are for human review, not a legal finding.</p>
    </div>
  );
}

export default function QaPage() {
  return <Suspense fallback={<PageSkeleton label="Loading call QA" />}><QaView /></Suspense>;
}
