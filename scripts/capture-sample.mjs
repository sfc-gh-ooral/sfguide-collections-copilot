// Captures the bundled Sample-mode data from a running Live-mode app (npm run dev with .env.local),
// so the no-account example shows the same synthetic rows and AI text captured from a live run.
// Usage: node scripts/capture-sample.mjs [http://localhost:3000] [--resume]
// --resume keeps accounts and transcripts already captured in .capture-partial.json (git-ignored).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const PARTIAL = '.capture-partial.json';
const prev = process.argv.includes('--resume') && existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, 'utf8')) : {};
const save = () => writeFileSync(PARTIAL, JSON.stringify(out));
const STORIES = ['L019001', 'L018004', 'L017001'];
const FILTERS = ['ALL', 'EVENING_SMS', 'BROKEN', 'DISASTER', 'NEAR_LIMIT'];
const ROWS = 25;
const QUESTIONS = [
  'Which accounts broke promises twice this month?',
  'How many delinquent accounts are in the declared disaster area, and how much is past due?',
  'What is the promise-kept rate by channel?',
];
const get = async (path, init) => {
  const r = await fetch(BASE + path, init);
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
};
/** Runs fn over items, four at a time. */
async function pool(items, fn, n = 4) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}

const out = { capturedAt: new Date().toISOString().slice(0, 10), overview: await get('/api/overview'), queues: {}, accounts: prev.accounts ?? {}, guides: prev.guides ?? {}, qaDetails: prev.qaDetails ?? {}, reviews: prev.reviews ?? {}, answers: [] };
for (const f of FILTERS) {
  const q = await get(`/api/queue?filter=${f}`);
  out.queues[f] = { ...q, rows: q.rows.slice(0, ROWS) };
}
// Every queue row on screen opens in Sample mode, with its conversation guide.
const ids = [...new Set([...STORIES, ...FILTERS.flatMap((f) => out.queues[f].rows.map((r) => r.ACCOUNT_ID))])];
await pool(ids.filter((id) => !out.guides[id]), async (id) => {
  out.accounts[id] = await get(`/api/account?id=${id}`);
  out.guides[id] = (await get(`/api/guide?id=${id}`)).text;
  save(); console.log('captured account', id);
});
out.qa = await get('/api/qa');
const flagged = out.qa.rows.filter((r) => r.FLAGS.length).map((r) => r.TRANSCRIPT_ID);
await pool(flagged.filter((id) => !out.reviews[id]), async (id) => {
  out.qaDetails[id] = await get(`/api/qa?id=${id}`);
  const r = await get(`/api/review?id=${id}`);
  out.reviews[id] = { text: r.text, flags: r.flags };
  save(); console.log('captured transcript', id);
});
for (const question of QUESTIONS) {
  const a = await get('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
  out.answers.push({ question, text: a.text });
  console.log('answered', question, a.latencyMs, 'ms');
}
// Live actions taken while capturing would leak into the bundle; the capture expects a clean ACCOUNT_ACTIONS.
// Sorted keys keep the bundle diff-friendly between captures.
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
out.accounts = sortKeys(out.accounts); out.guides = sortKeys(out.guides); out.qaDetails = sortKeys(out.qaDetails); out.reviews = sortKeys(out.reviews);
writeFileSync('lib/mock/sample.json', JSON.stringify(out) + '\n');
console.log('wrote lib/mock/sample.json with', ids.length, 'accounts and', flagged.length, 'transcripts');
