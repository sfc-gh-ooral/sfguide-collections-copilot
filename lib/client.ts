'use client';

// Browser-side data access. Sample mode reads the bundled capture (lib/mock/sample.json: the same
// synthetic rows captured from a live run). Live mode calls the API routes, and a failed live call
// surfaces as an error: it never falls back to sample data.
import sample from '@/lib/mock/sample.json';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { preferSample } from '@/lib/mode';
import { type ActionInput, checkAction } from '@/lib/rules';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';
import type { AccountDetail, AiText, Overview, QaDetail, QaList, Queue } from '@/lib/types';

interface SampleBundle {
  capturedAt: string; overview: Overview; queues: Record<string, Queue>; accounts: Record<string, AccountDetail>;
  guides: Record<string, string>; qa: QaList; qaDetails: Record<string, QaDetail>; reviews: Record<string, { text: string; flags: string[] }>;
  answers: { question: string; text: string }[];
}
const S = sample as unknown as SampleBundle;
export const CAPTURED_AT = S.capturedAt;
export const SAMPLE_QUESTIONS = S.answers.map((a) => a.question);

/** The planted stories in the synthetic data (see data/README.md), as entry points to the account view. */
export const STORY_ACCOUNTS = [
  { id: 'L019001', title: 'Texts back in the evening', hint: '4 of 4 evening texts answered, 1 of 22 morning calls' },
  { id: 'L018004', title: 'Two broken promises', hint: 'high roll risk, 6 calls this week' },
  { id: 'L017001', title: 'Flood-area borrower', hint: 'eligible for disaster forbearance' },
];
export const STORY_TRANSCRIPT = 'TR900001';

let modePromise: Promise<boolean> | undefined;
/** True when the server has a Snowflake connection and the reader hasn't chosen Sample. */
export function isLive(): Promise<boolean> {
  if (HOSTED_EXAMPLE) return Promise.resolve(false);
  modePromise ??= fetch('/api/mode').then((r) => r.json()).then((j) => j.mode === 'live' && !preferSample()).catch(() => false);
  return modePromise;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms - 800 + Math.round(Math.random() * 1600);
const LABEL: Record<string, string> = { LOG_PROMISE: 'LOG_PROMISE', ENROLL_HARDSHIP: 'ENROLL_HARDSHIP', SCHEDULE: 'SCHEDULE' };

// Actions taken in Sample mode are kept in this browser session only.
const local = new Map<string, { ACTION: string; DETAIL: string; ACTED_AT: string }[]>();
function withLocal(c: AccountDetail): AccountDetail {
  const mine = local.get(c.account.ACCOUNT_ID) ?? [];
  const actions = [...mine, ...c.actions];
  const scheduledCalls = actions.filter((x) => x.ACTION === 'SCHEDULE' && JSON.parse(x.DETAIL).channel === 'CALL').length;
  return { ...c, actions, limit: { ...c.limit, scheduledCalls }, source: 'captured' };
}

// The shell's shift board and the portfolio share one overview request.
let overviewPromise: Promise<Overview> | undefined;
export function fetchOverview(): Promise<Overview> {
  overviewPromise ??= (async () => (await isLive()) ? api<Overview>('/api/overview') : { ...S.overview, source: 'captured' as const })();
  overviewPromise.catch(() => { overviewPromise = undefined; });
  return overviewPromise;
}

export async function fetchQueue(filter: string): Promise<Queue> {
  if (await isLive()) return api(`/api/queue?filter=${encodeURIComponent(filter)}`);
  const q = S.queues[filter];
  const rows = q.rows.map((r) => { const m = local.get(r.ACCOUNT_ID); return m?.length ? { ...r, LAST_ACTION: m[0].ACTION } : r; });
  return { ...q, rows, source: 'captured' };
}

export async function fetchAccount(id: string): Promise<AccountDetail> {
  if (await isLive()) return api(`/api/account?id=${encodeURIComponent(id)}`);
  const c = S.accounts[id];
  if (!c) throw new Error(`${id} isn’t in the bundled sample. Open a story account or a row from the queue, or run Live mode for every account.`);
  return withLocal(c);
}

export async function sendAction(id: string, a: ActionInput): Promise<void> {
  if (await isLive()) { await api('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...a }) }); return; }
  const c = withLocal(S.accounts[id]);
  const err = checkAction(a, c);
  if (err) throw new Error(err);
  const d = a.action === 'LOG_PROMISE' ? { amount: a.amount, date: a.date } : a.action === 'ENROLL_HARDSHIP' ? { program: a.program } : { channel: a.channel, band: a.band, date: a.date };
  local.set(id, [{ ACTION: LABEL[a.action], DETAIL: JSON.stringify(d), ACTED_AT: 'just now (this browser)' }, ...(local.get(id) ?? [])]);
  await wait(500);
}

export async function fetchGuide(id: string): Promise<AiText> {
  if (await isLive()) return api(`/api/guide?id=${encodeURIComponent(id)}`);
  const text = S.guides[id];
  if (!text) throw new Error('No sample conversation guide is bundled for this account.');
  await wait(jitter(SAMPLE_DELAY_MS.guide));
  return { text, latencyMs: 0, model: 'scripted', source: 'sample' };
}

export async function fetchQa(): Promise<QaList> {
  if (await isLive()) return api('/api/qa');
  return { ...S.qa, source: 'captured' };
}

export async function fetchQaDetail(id: string): Promise<QaDetail> {
  if (await isLive()) return api(`/api/qa?id=${encodeURIComponent(id)}`);
  const d = S.qaDetails[id];
  if (!d) throw new Error(`${id} isn’t in the bundled sample. Run Live mode to open every transcript.`);
  return { ...d, source: 'captured' };
}

export async function reviewTranscript(id: string): Promise<AiText> {
  if (await isLive()) return api(`/api/review?id=${encodeURIComponent(id)}`);
  const r = S.reviews[id];
  if (!r) throw new Error('No sample review is bundled for this transcript.');
  await wait(jitter(SAMPLE_DELAY_MS.review));
  return { text: r.text, flags: r.flags, latencyMs: 0, model: 'scripted', source: 'sample' };
}

export async function ask(question: string): Promise<AiText> {
  if (await isLive()) return api('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
  const hit = S.answers.find((a) => a.question.toLowerCase() === question.trim().toLowerCase());
  await wait(jitter(SAMPLE_DELAY_MS.ask));
  if (!hit) return { text: 'This hosted example only has scripted answers for the suggested questions. Pick one of them, or run Live mode to ask the Cortex Agent anything about the accounts and promises.', latencyMs: 0, model: 'scripted', source: 'sample' };
  return { text: hit.text, latencyMs: 0, model: 'scripted', source: 'sample' };
}
