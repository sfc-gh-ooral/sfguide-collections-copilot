'use client';

// Call QA: every reviewed transcript with its compliance flags (a disclosure rule plus AI_CLASSIFY
// on agent conduct), flags by type and by agent, and AI coaching notes from AI_COMPLETE.
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Reasoning } from '@/components/Reasoning';
import { Card, ErrorBox, Kpi, Markdown, PoweredBy, SampleAiBadge, SourceChip, Tag, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_TRANSCRIPT, fetchQa, fetchQaDetail, reviewTranscript } from '@/lib/client';
import type { AiText, QaRow } from '@/lib/types';

const riskTag = (r: QaRow['RISK']) => <Tag tone={r === 'HIGH' ? 'danger' : r === 'MEDIUM' ? 'warning' : 'positive'}>{r === 'NONE' ? 'No issues' : `${r.toLowerCase()} risk`}</Tag>;

function Detail({ id }: { id: string }) {
  const d = useAsync(() => fetchQaDetail(id), [id]);
  const [ai, setAi] = useState<{ loading?: boolean; data?: AiText; error?: string }>({});
  useEffect(() => setAi({}), [id]);
  const rerun = () => { setAi({ loading: true }); reviewTranscript(id).then((data) => setAi({ data }), (e) => setAi({ error: String(e.message ?? e) })); };
  if (d.error) return <ErrorBox error={d.error} />;
  if (d.loading || !d.data) return <Thinking label="Loading the transcript" />;
  const { row, transcript, coaching } = d.data;
  const sample = d.data.source === 'captured';
  return (
    <Card title={`${row.TRANSCRIPT_ID} · ${row.AGENT_NAME} · ${row.CALL_TS}`} right={<>{riskTag(row.RISK)}<Link href={`/account/?id=${row.ACCOUNT_ID}`} className="text-xs">{row.ACCOUNT_ID}</Link></>}>
      <div className="flex flex-wrap gap-1 mb-3">{row.FLAGS.map((f) => <Tag key={f} tone="danger">{f}</Tag>)}</div>
      <div className="grid lg:grid-cols-2 gap-4">
        <pre className="text-[13px] leading-relaxed whitespace-pre-wrap rounded-lg p-3" style={{ background: 'var(--surface-2)', fontFamily: 'inherit' }}>{transcript}</pre>
        <div className="space-y-3 min-w-0">
          {coaching && <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-sm font-semibold">Coaching note</span><PoweredBy>AI_COMPLETE</PoweredBy>{sample && <SampleAiBadge />}</div>
            <Markdown text={coaching} />
            <p className="text-xs muted mt-1">Written when setup reviewed the call. AI-generated; a QA lead confirms before coaching.</p>
          </div>}
          <div>
            <button className="btn btn-ai" onClick={rerun} disabled={ai.loading}><RefreshCw className="w-4 h-4" aria-hidden />Review this call again</button>
            <div className="mt-2">
              {ai.error ? <ErrorBox error={ai.error} /> : ai.loading ? <Reasoning kind="review" /> : ai.data && (
                <div className="card p-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-semibold">Fresh review</span>
                    {ai.data.source === 'sample' ? <SampleAiBadge /> : <span className="text-[11px] muted">{(ai.data.latencyMs / 1000).toFixed(1)} s · {ai.data.model}</span>}
                    {(ai.data.flags ?? []).map((f) => <Tag key={f} tone="danger">{f}</Tag>)}
                  </div>
                  <Markdown text={ai.data.text} />
                </div>)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function QaView() {
  const id = useSearchParams().get('id') ?? STORY_TRANSCRIPT;
  const router = useRouter();
  const q = useAsync(fetchQa, []);
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.loading || !q.data) return <Thinking label="Loading call QA" />;
  const d = q.data;
  const high = d.rows.filter((r) => r.RISK === 'HIGH').length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Call QA, Oct 1 to Nov 15</h1>
          <p className="text-sm muted">Every reviewed call is checked for the debt collection disclosure and for agent conduct.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>AI_CLASSIFY</PoweredBy><PoweredBy>AI_COMPLETE</PoweredBy><SourceChip ms={d.ms} source={d.source} /></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Calls reviewed" value={d.reviewed.toLocaleString()} sub="transcript snippets" />
        <Kpi label="Flagged" value={d.flagged.toLocaleString()} sub={`${(d.flagged / d.reviewed * 100).toFixed(1)}% of calls`} />
        <Kpi label="High risk" value={String(high)} sub="threats, third parties, or abuse" />
        <Kpi label="Agents with flags" value={String(d.byAgent.filter((a) => a.FLAGGED > 0).length)} sub={`of ${d.byAgent.length} agents`} />
      </div>
      <Detail id={id} />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 min-w-0" title="Flagged calls">
          <div className="relative overflow-x-auto">
            <table className="data-table w-full text-sm min-w-[560px]">
              <thead><tr><th className="text-left">Call</th><th className="text-left">Agent</th><th className="text-left">Flags</th><th className="text-left">Risk</th></tr></thead>
              <tbody>{d.rows.filter((r) => r.FLAGS.length).map((r) => (
                <tr key={r.TRANSCRIPT_ID} className={r.TRANSCRIPT_ID === id ? 'book-active' : ''}>
                  <td><button className="font-semibold underline underline-offset-2" onClick={() => { router.replace(`/qa/?id=${r.TRANSCRIPT_ID}`); window.scrollTo({ top: 0 }); }}>{r.TRANSCRIPT_ID}</button>
                    <div className="text-xs muted">{r.CALL_TS} · {r.ACCOUNT_ID}</div></td>
                  <td>{r.AGENT_NAME}</td>
                  <td><div className="flex flex-wrap gap-1 max-w-[300px]">{r.FLAGS.map((f) => <Tag key={f}>{f}</Tag>)}</div></td>
                  <td>{riskTag(r.RISK)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4 min-w-0">
          <Card title="Flags by type">
            <ul className="space-y-2">{d.byFlag.map((f) => (
              <li key={f.FLAG} className="text-sm">
                <div className="flex justify-between"><span>{f.FLAG}</span><span className="tabular muted">{f.N}</span></div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}><div className="h-1.5 rounded-full" style={{ width: `${(f.N / d.byFlag[0].N) * 100}%`, background: 'var(--negative)' }} /></div>
              </li>))}</ul>
          </Card>
          <Card title="By agent">
            <table className="data-table w-full text-sm"><thead><tr><th className="text-left">Agent</th><th className="text-right">Calls</th><th className="text-right">Flagged</th></tr></thead>
              <tbody>{d.byAgent.map((a) => <tr key={a.AGENT_NAME}><td>{a.AGENT_NAME}</td><td className="text-right tabular">{a.CALLS}</td><td className="text-right tabular">{a.FLAGGED}</td></tr>)}</tbody></table>
          </Card>
        </div>
      </div>
      <p className="text-xs muted">A phrase rule checks the disclosure; AI_CLASSIFY reviews conduct against five labels you can edit. Flags are for human review, not a legal finding.</p>
    </div>
  );
}

export default function QaPage() {
  return <Suspense fallback={<Thinking label="Loading call QA" />}><QaView /></Suspense>;
}
