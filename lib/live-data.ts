// Live-mode queries against COLLECTIONS_COPILOT (created by sql/setup.sql). Server only.
// All inputs are validated and passed as bind variables.
import { COMPLETE_MODEL, query } from '@/lib/snowflake';
import { type ActionInput, checkAction, riskOf } from '@/lib/rules';
import type { AccountDetail, AiText, Overview, Program, QaDetail, QaList, Queue, QueueRow, Rescore } from '@/lib/types';

const DB = 'COLLECTIONS_COPILOT';

const BUCKET = (c: string) => `CASE WHEN ${c} = 0 THEN 0 WHEN ${c} < 30 THEN 1 WHEN ${c} < 60 THEN 2 WHEN ${c} < 90 THEN 3 ELSE 4 END`;
const BUCKET_NAME = ['Current', '1-29', '30-59', '60-89', '90+'];
const asArr = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? JSON.parse(v) : []) as string[];

export async function getOverview(): Promise<Overview> {
  const t0 = Date.now();
  const [k, buckets, trend, roll, promises, stories, ev, versions] = await Promise.all([
    query<Record<string, number>>(`SELECT COUNT(*) AS ACCOUNTS, COUNT_IF(DPD > 0) AS DELINQUENT, ROUND(COUNT_IF(DPD >= 30) / COUNT(*) * 100, 2) AS DPD30_RATE,
        SUM(PAST_DUE)::FLOAT AS PAST_DUE, (SELECT COUNT(*) FROM APP.TODAY_QUEUE) AS QUEUE FROM APP.ACCOUNT_STATUS`),
    query<{ B: number; ACCOUNTS: number; PAST_DUE: number }>(`SELECT ${BUCKET('DPD')} AS B, COUNT(*) AS ACCOUNTS, SUM(PAST_DUE)::FLOAT AS PAST_DUE
        FROM APP.ACCOUNT_STATUS GROUP BY 1 ORDER BY 1`),
    query<Overview['trend'][number]>(`SELECT TO_VARCHAR(AS_OF_DATE) AS DAY, DELINQ_RATE::FLOAT AS DELINQ_RATE, DPD30_RATE::FLOAT AS DPD30_RATE, DELINQUENT, PAST_DUE::FLOAT AS PAST_DUE
        FROM APP.PORTFOLIO_DAILY ORDER BY AS_OF_DATE`),
    // Roll and cure over two 30-day windows: where did each delinquent account end up?
    query<{ WINDOW: string; B: number; ACCOUNTS: number; CURED: number; ROLLED: number }>(`
      WITH w AS (SELECT column1 AS WINDOW, column2::DATE AS D1, column3::DATE AS D2 FROM VALUES ('Sep 15 to Oct 15', '2026-09-15', '2026-10-15'), ('Oct 16 to Nov 15', '2026-10-16', '2026-11-15'))
      SELECT w.WINDOW, ${BUCKET('a.DPD')} AS B, COUNT(*) AS ACCOUNTS, COUNT_IF(b.DPD = 0) AS CURED,
        COUNT_IF(b.DPD IS NULL OR ${BUCKET('b.DPD')} > ${BUCKET('a.DPD')}) AS ROLLED
      FROM w JOIN RAW.DELINQUENCY_DAILY a ON a.AS_OF_DATE = w.D1 AND a.DPD BETWEEN 1 AND 89
      LEFT JOIN RAW.DELINQUENCY_DAILY b ON b.ACCOUNT_ID = a.ACCOUNT_ID AND b.AS_OF_DATE = w.D2
      GROUP BY 1, 2 ORDER BY 1, 2`),
    query<Overview['promises'][number]>(`SELECT TO_VARCHAR(DATE_TRUNC('MONTH', DUE_DATE), 'Mon YYYY') AS MONTH, COUNT_IF(STATUS = 'KEPT') AS KEPT, COUNT_IF(STATUS = 'BROKEN') AS BROKEN,
        ROUND(COUNT_IF(STATUS = 'KEPT') / NULLIF(COUNT_IF(STATUS IN ('KEPT', 'BROKEN')), 0), 4)::FLOAT AS KEPT_RATE
      FROM APP.PROMISES WHERE DUE_DATE >= '2026-08-01' GROUP BY DATE_TRUNC('MONTH', DUE_DATE), 1 ORDER BY DATE_TRUNC('MONTH', DUE_DATE)`),
    query<Record<string, number>>(`SELECT
        (SELECT COUNT(*) FROM APP.TODAY_QUEUE WHERE BEST_CHANNEL = 'SMS' AND BEST_BAND = 'EVENING' AND USUAL_CHANNEL = 'CALL' AND USUAL_BAND = 'MORNING') AS EVENING,
        (SELECT COUNT(*) FROM APP.TODAY_QUEUE WHERE DISASTER_ELIGIBLE) AS DISASTER,
        (SELECT SUM(PAST_DUE)::FLOAT FROM APP.TODAY_QUEUE WHERE DISASTER_ELIGIBLE) AS DISASTER_PD,
        (SELECT COUNT_IF(ARRAY_SIZE(FLAGS) > 0) FROM APP.TRANSCRIPT_QA) AS FLAGGED,
        (SELECT COUNT(*) FROM (SELECT ACCOUNT_ID FROM APP.PROMISES WHERE STATUS = 'BROKEN' AND DUE_DATE >= '2026-11-01' GROUP BY 1 HAVING COUNT(*) >= 2)) AS BROKEN2`),
    query<{ P: string }>("SELECT TO_JSON(PAYLOAD) AS P FROM ML.MODEL_EVAL WHERE MODEL_VERSION = 'V1'"),
    query<Record<string, string>>(`SHOW VERSIONS IN MODEL ${DB}.ML.ROLL_RISK_XGB`),
  ]);
  const latest = roll.filter((r) => r.WINDOW === 'Oct 16 to Nov 15');
  const sum = (rows: typeof roll, f: 'ACCOUNTS' | 'CURED' | 'ROLLED') => rows.reduce((s, r) => s + Number(r[f]), 0);
  const early = latest.filter((r) => Number(r.B) <= 2);
  const kept = promises.reduce((s, p) => s + Number(p.KEPT), 0), broken = promises.reduce((s, p) => s + Number(p.BROKEN), 0);
  const s = stories[0], r = k[0], v = versions[0] ?? {};
  return {
    kpis: { accounts: Number(r.ACCOUNTS), delinquent: Number(r.DELINQUENT), dpd30Rate: Number(r.DPD30_RATE), pastDue: Number(r.PAST_DUE),
      rollRate: sum(early, 'ROLLED') / sum(early, 'ACCOUNTS'), cureRate: sum(latest, 'CURED') / sum(latest, 'ACCOUNTS'),
      keptRate: kept / (kept + broken), queue: Number(r.QUEUE) },
    buckets: buckets.map((b) => ({ BUCKET: BUCKET_NAME[Number(b.B)], ACCOUNTS: Number(b.ACCOUNTS), PAST_DUE: Number(b.PAST_DUE) })),
    trend, promises,
    roll: roll.map((x) => ({ WINDOW: x.WINDOW, FROM_BUCKET: BUCKET_NAME[Number(x.B)], ACCOUNTS: Number(x.ACCOUNTS), CURED: Number(x.CURED), ROLLED: Number(x.ROLLED) })),
    stories: { eveningTexters: Number(s.EVENING), disasterEligible: Number(s.DISASTER), disasterPastDue: Number(s.DISASTER_PD), flaggedCalls: Number(s.FLAGGED), brokenTwice: Number(s.BROKEN2) },
    model: JSON.parse(ev[0].P), registry: { name: 'ML.ROLL_RISK_XGB', version: String(v.name ?? 'V1'), created: String(v.created_on ?? '').slice(0, 10) },
    ms: Date.now() - t0, source: 'live',
  };
}

const QUEUE_COLS = `q.ACCOUNT_ID, q.CUSTOMER_NAME, q.PRODUCT, q.CITY, q.STATE, q.ZIP, q.PREFERRED_LANGUAGE, q.DPD, q.PAST_DUE::FLOAT AS PAST_DUE,
  q.BALANCE::FLOAT AS BALANCE, q.PROMISES_BROKEN, q.CALLS_7D, q.CALL_LIMIT_7D, q.ROLL_RISK::FLOAT AS ROLL_RISK, q.BEST_CHANNEL, q.BEST_BAND,
  q.BEST_REACH_RATE::FLOAT AS BEST_REACH_RATE, q.USUAL_CHANNEL, q.USUAL_BAND, q.USUAL_REACH_RATE::FLOAT AS USUAL_REACH_RATE, q.PLAN_CHANNEL,
  q.SUGGESTED_OFFER, q.ELIGIBLE_PROGRAMS, q.DISASTER_ELIGIBLE, q.EXPECTED_RECOVERY::FLOAT AS EXPECTED_RECOVERY, q.PRIORITY_SCORE::FLOAT AS PRIORITY_SCORE,
  q.QUEUE_RANK, (SELECT MAX_BY(x.ACTION, x.ACTED_AT) FROM APP.ACCOUNT_ACTIONS x WHERE x.ACCOUNT_ID = q.ACCOUNT_ID) AS LAST_ACTION`;
const fixRow = (r: QueueRow): QueueRow => ({ ...r, ELIGIBLE_PROGRAMS: asArr(r.ELIGIBLE_PROGRAMS), DISASTER_ELIGIBLE: Boolean(r.DISASTER_ELIGIBLE) });

export const FILTERS: Record<string, string> = {
  ALL: 'TRUE',
  EVENING_SMS: "q.BEST_CHANNEL = 'SMS' AND q.BEST_BAND = 'EVENING' AND q.USUAL_CHANNEL = 'CALL' AND q.USUAL_BAND = 'MORNING'",
  BROKEN: 'q.PROMISES_BROKEN >= 2',
  DISASTER: 'q.DISASTER_ELIGIBLE',
  NEAR_LIMIT: 'q.CALLS_7D >= q.CALL_LIMIT_7D - 1',
};

export async function getQueue(filter: string): Promise<Queue> {
  const t0 = Date.now();
  const where = FILTERS[filter]; // a fixed whitelist, never user text
  const [rows, total] = await Promise.all([
    query<QueueRow>(`SELECT ${QUEUE_COLS} FROM APP.TODAY_QUEUE q WHERE ${where} ORDER BY q.QUEUE_RANK LIMIT 100`),
    query<{ N: number }>(`SELECT COUNT(*) AS N FROM APP.TODAY_QUEUE q WHERE ${where}`),
  ]);
  return { rows: rows.map(fixRow), total: Number(total[0].N), ms: Date.now() - t0, source: 'live' };
}

export async function getAccount(id: string): Promise<AccountDetail> {
  const t0 = Date.now();
  const acct = await query<AccountDetail['account']>(`SELECT a.ACCOUNT_ID, a.CUSTOMER_NAME, a.PRODUCT, a.CITY, a.STATE, a.ZIP, a.CREDIT_SCORE,
      a.PRINCIPAL_BALANCE::FLOAT AS PRINCIPAL_BALANCE, a.MONTHLY_PAYMENT::FLOAT AS MONTHLY_PAYMENT, a.SMS_CONSENT, a.PREFERRED_LANGUAGE, a.LAST4,
      TO_VARCHAR(a.OPENED_ON) AS OPENED_ON, s.DPD, s.PAST_DUE::FLOAT AS PAST_DUE, s.DPD_BUCKET, dd.EVENT_NAME AS DISASTER_EVENT
    FROM RAW.ACCOUNTS a JOIN APP.ACCOUNT_STATUS s ON s.ACCOUNT_ID = a.ACCOUNT_ID
    LEFT JOIN RAW.DISASTER_DECLARATIONS dd ON dd.ZIP = a.ZIP WHERE a.ACCOUNT_ID = ?`, [id]);
  if (!acct[0]) throw new Error(`Account ${id} not found`);
  const [q, dpd, payments, promises, contacts, profile, programs, enrollments, transcripts, actions] = await Promise.all([
    query<QueueRow>(`SELECT ${QUEUE_COLS} FROM APP.TODAY_QUEUE q WHERE q.ACCOUNT_ID = ?`, [id]),
    query<{ DAY: string; DPD: number }>(`SELECT TO_VARCHAR(AS_OF_DATE) AS DAY, DPD FROM RAW.DELINQUENCY_DAILY WHERE ACCOUNT_ID = ? ORDER BY AS_OF_DATE`, [id]),
    query<AccountDetail['payments'][number]>(`SELECT TO_VARCHAR(PAID_ON) AS PAID_ON, AMOUNT::FLOAT AS AMOUNT, KIND FROM RAW.PAYMENTS WHERE ACCOUNT_ID = ? ORDER BY PAID_ON DESC LIMIT 12`, [id]),
    query<AccountDetail['promises'][number]>(`SELECT PROMISE_ID, TO_VARCHAR(CREATED_DATE) AS CREATED_DATE, TO_VARCHAR(DUE_DATE) AS DUE_DATE, CHANNEL,
        PROMISE_AMOUNT::FLOAT AS PROMISE_AMOUNT, STATUS FROM APP.PROMISES WHERE ACCOUNT_ID = ? ORDER BY DUE_DATE DESC`, [id]),
    query<AccountDetail['contacts'][number]>(`SELECT TO_VARCHAR(ATTEMPT_TS, 'YYYY-MM-DD HH24:MI') AS ATTEMPT_TS, CHANNEL, TIME_BAND, OUTCOME
        FROM RAW.CONTACT_ATTEMPTS WHERE ACCOUNT_ID = ? ORDER BY ATTEMPT_TS DESC LIMIT 40`, [id]),
    query<AccountDetail['profile'][number]>(`SELECT CHANNEL, TIME_BAND, ATTEMPTS, REACHED, REACH_RATE::FLOAT AS REACH_RATE FROM ML.CONTACT_PROFILE
        WHERE ACCOUNT_ID = ? ORDER BY REACH_RATE DESC, ATTEMPTS DESC`, [id]),
    query<Omit<Program, 'ELIGIBLE'>>('SELECT PROGRAM_ID, NAME, DESCRIPTION, ELIGIBILITY FROM RAW.HARDSHIP_PROGRAMS'),
    query<AccountDetail['enrollments'][number]>(`SELECT PROGRAM_ID, TO_VARCHAR(ENROLLED_ON) AS ENROLLED_ON, STATUS FROM RAW.HARDSHIP_ENROLLMENTS WHERE ACCOUNT_ID = ?`, [id]),
    query<{ TRANSCRIPT_ID: string; CALL_TS: string; AGENT_NAME: string; FLAGS: unknown }>(`SELECT t.TRANSCRIPT_ID, TO_VARCHAR(t.CALL_TS, 'YYYY-MM-DD HH24:MI') AS CALL_TS,
        t.AGENT_NAME, q.FLAGS FROM RAW.CALL_TRANSCRIPTS t JOIN APP.TRANSCRIPT_QA q USING (TRANSCRIPT_ID) WHERE t.ACCOUNT_ID = ? ORDER BY t.CALL_TS DESC`, [id]),
    query<AccountDetail['actions'][number]>(`SELECT ACTION, TO_JSON(DETAIL) AS DETAIL, TO_VARCHAR(ACTED_AT, 'YYYY-MM-DD HH24:MI') AS ACTED_AT
        FROM APP.ACCOUNT_ACTIONS WHERE ACCOUNT_ID = ? ORDER BY ACTED_AT DESC`, [id]),
  ]);
  const row = q[0] ? fixRow(q[0]) : null;
  const eligible = new Set(row?.ELIGIBLE_PROGRAMS ?? []);
  const scheduledCalls = actions.filter((x) => x.ACTION === 'SCHEDULE' && JSON.parse(x.DETAIL).channel === 'CALL').length;
  return {
    account: { ...acct[0], SMS_CONSENT: Boolean(acct[0].SMS_CONSENT) }, queue: row, dpd, payments, promises, contacts, profile,
    programs: programs.map((p) => ({ ...p, ELIGIBLE: eligible.has(p.PROGRAM_ID) })), enrollments,
    transcripts: transcripts.map((t) => ({ ...t, FLAGS: asArr(t.FLAGS) })), actions,
    limit: { calls7d: row?.CALLS_7D ?? 0, scheduledCalls, limit: row?.CALL_LIMIT_7D ?? 7 },
    ms: Date.now() - t0, source: 'live',
  };
}

export async function recordAction(id: string, a: ActionInput) {
  const detail = await getAccount(id);
  const err = checkAction(a, detail);
  if (err) throw new Error(err);
  const d = a.action === 'LOG_PROMISE' ? { amount: a.amount, date: a.date } : a.action === 'ENROLL_HARDSHIP' ? { program: a.program } : { channel: a.channel, band: a.band, date: a.date };
  await query(`INSERT INTO APP.ACCOUNT_ACTIONS SELECT UUID_STRING(), ?, ?, PARSE_JSON(?), CURRENT_USER(), SYSDATE()`, [id, a.action, JSON.stringify(d)]);
  return { ok: true };
}

/** AI conversation guide with AI_COMPLETE over the facts the collector sees. */
export async function getGuide(id: string): Promise<AiText> {
  const c = await getAccount(id);
  const q = c.queue;
  const facts = {
    borrower: { firstName: c.account.CUSTOMER_NAME.split(' ')[0], language: c.account.PREFERRED_LANGUAGE, product: c.account.PRODUCT, last4: c.account.LAST4 },
    delinquency: { daysPastDue: c.account.DPD, pastDue: c.account.PAST_DUE, monthlyPayment: c.account.MONTHLY_PAYMENT, rollRisk: q?.ROLL_RISK },
    promises: c.promises.slice(0, 5).map((p) => ({ due: p.DUE_DATE, amount: p.PROMISE_AMOUNT, status: p.STATUS })),
    contact: { bestChannel: q?.BEST_CHANNEL, bestTime: q?.BEST_BAND, callsLast7Days: c.limit.calls7d, callLimit: c.limit.limit, smsConsent: c.account.SMS_CONSENT },
    disasterEvent: c.account.DISASTER_EVENT,
    eligiblePrograms: c.programs.filter((p) => p.ELIGIBLE).map((p) => ({ name: p.NAME, what: p.DESCRIPTION })),
    suggestedOffer: q?.SUGGESTED_OFFER,
  };
  const prompt = `You write a short conversation guide for a debt collection agent at Northwind Financial before they contact a borrower.
Use only the JSON facts. Be empathetic and plain-spoken. Structure:
**Open** (greeting, identity check, and this exact disclosure: "This is an attempt to collect a debt, and any information obtained will be used for that purpose."),
**Acknowledge** (1-2 lines that reflect the borrower's situation without assumptions),
**Offer** (lead with the suggested offer or eligible programs, with a concrete amount or date if the facts support it),
**If they push back** (2 bullets),
**Close** (confirm next step and channel),
**Avoid** (3 bullets: no threats, don't discuss the debt with anyone else, respect contact preferences and the call limit).
Keep it under 230 words. If the preferred language is not English, add one line suggesting a bilingual agent. Synthetic data, not legal advice.
FACTS: ${JSON.stringify(facts)}`;
  const t0 = Date.now();
  const r = await query<{ T: string }>('SELECT AI_COMPLETE(?, ?) AS T', [COMPLETE_MODEL, prompt]);
  return { text: r[0].T, latencyMs: Date.now() - t0, model: COMPLETE_MODEL, source: 'live' };
}

export async function getQa(): Promise<QaList> {
  const t0 = Date.now();
  const [rows, totals, byFlag, byAgent] = await Promise.all([
    query<{ TRANSCRIPT_ID: string; ACCOUNT_ID: string; CALL_TS: string; AGENT_NAME: string; FLAGS: unknown }>(`SELECT t.TRANSCRIPT_ID, t.ACCOUNT_ID,
        TO_VARCHAR(t.CALL_TS, 'YYYY-MM-DD HH24:MI') AS CALL_TS, t.AGENT_NAME, q.FLAGS FROM RAW.CALL_TRANSCRIPTS t JOIN APP.TRANSCRIPT_QA q USING (TRANSCRIPT_ID)
      ORDER BY ARRAY_SIZE(q.FLAGS) DESC, t.CALL_TS DESC LIMIT 60`),
    query<{ N: number; F: number }>('SELECT COUNT(*) AS N, COUNT_IF(ARRAY_SIZE(FLAGS) > 0) AS F FROM APP.TRANSCRIPT_QA'),
    query<{ FLAG: string; N: number }>('SELECT f.VALUE::STRING AS FLAG, COUNT(*) AS N FROM APP.TRANSCRIPT_QA q, LATERAL FLATTEN(q.FLAGS) f GROUP BY 1 ORDER BY 2 DESC'),
    query<QaList['byAgent'][number]>(`SELECT t.AGENT_NAME, COUNT(*) AS CALLS, COUNT_IF(ARRAY_SIZE(q.FLAGS) > 0) AS FLAGGED
        FROM RAW.CALL_TRANSCRIPTS t JOIN APP.TRANSCRIPT_QA q USING (TRANSCRIPT_ID) GROUP BY 1 ORDER BY FLAGGED DESC, CALLS DESC`),
  ]);
  return {
    rows: rows.map((r) => { const f = asArr(r.FLAGS); return { ...r, FLAGS: f, RISK: riskOf(f) }; }),
    reviewed: Number(totals[0].N), flagged: Number(totals[0].F), byFlag, byAgent, ms: Date.now() - t0, source: 'live',
  };
}

export async function getQaDetail(id: string): Promise<QaDetail> {
  const t0 = Date.now();
  const r = await query<{ TRANSCRIPT_ID: string; ACCOUNT_ID: string; CALL_TS: string; AGENT_NAME: string; FLAGS: unknown; TRANSCRIPT: string; COACHING: string | null }>(`
    SELECT t.TRANSCRIPT_ID, t.ACCOUNT_ID, TO_VARCHAR(t.CALL_TS, 'YYYY-MM-DD HH24:MI') AS CALL_TS, t.AGENT_NAME, q.FLAGS, t.TRANSCRIPT, q.COACHING
    FROM RAW.CALL_TRANSCRIPTS t JOIN APP.TRANSCRIPT_QA q USING (TRANSCRIPT_ID) WHERE t.TRANSCRIPT_ID = ?`, [id]);
  if (!r[0]) throw new Error(`Transcript ${id} not found`);
  const f = asArr(r[0].FLAGS);
  const { TRANSCRIPT, COACHING, ...row } = r[0];
  return { row: { ...row, FLAGS: f, RISK: riskOf(f) }, transcript: TRANSCRIPT, coaching: COACHING, ms: Date.now() - t0, source: 'live' };
}

const CATEGORIES = [
  { label: 'Compliant', description: 'Agent stays respectful, makes no threats, respects contact requests, and discusses the debt only with the borrower' },
  { label: 'Threat or false statement', description: 'Agent threatens arrest, lawsuits, wage garnishment, or workplace visits, or misstates consequences' },
  { label: 'Third-party disclosure', description: 'Agent discussed the debt with someone other than the borrower, such as a relative' },
  { label: 'Abusive or demeaning language', description: 'Agent insults, shames, or blames the borrower' },
  { label: 'Ignored contact request', description: 'Borrower asks not to be contacted at a time or place and the agent dismisses it' },
];

/** Re-reviews one transcript live: the disclosure rule, AI_CLASSIFY on conduct, and AI_COMPLETE coaching. Nothing is written. */
export async function reviewTranscript(id: string): Promise<AiText> {
  const t0 = Date.now();
  const r = await query<{ L: string; DISCLOSED: boolean; TRANSCRIPT: string }>(`SELECT TO_JSON(AI_CLASSIFY(TRANSCRIPT, PARSE_JSON(?),
      OBJECT_CONSTRUCT('task_description', 'Quality review of agent conduct on a debt collection call. Pick every label that applies.', 'output_mode', 'multi')):labels) AS L,
      TRANSCRIPT ILIKE '%attempt to collect a debt%' AS DISCLOSED, TRANSCRIPT FROM RAW.CALL_TRANSCRIPTS WHERE TRANSCRIPT_ID = ?`, [JSON.stringify(CATEGORIES), id]);
  if (!r[0]) throw new Error(`Transcript ${id} not found`);
  const flags = [...(r[0].DISCLOSED ? [] : ['Missing disclosure']), ...asArr(r[0].L).filter((l) => l !== 'Compliant')];
  if (!flags.length) return { text: 'No issues found on this call. The agent gave the disclosure and stayed respectful.', flags, latencyMs: Date.now() - t0, model: 'AI_CLASSIFY', source: 'live' };
  const c = await query<{ T: string }>('SELECT AI_COMPLETE(?, ?) AS T', [COMPLETE_MODEL,
    `You coach debt collection agents. Flags from automated QA: ${flags.join(', ')}. In at most 3 short bullets, quote the problem line, say why it is a compliance and customer risk, and give a better line to say instead. Plain language, no legal citations. Synthetic transcript:\n${r[0].TRANSCRIPT}`]);
  return { text: c[0].T, flags, latencyMs: Date.now() - t0, model: `AI_CLASSIFY + ${COMPLETE_MODEL}`, source: 'live' };
}

/** Ask: sends the question to the Cortex Agent over COLLECTIONS_SV and returns its final answer. */
export async function askAgent(question: string): Promise<AiText> {
  const payload = JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text: question }] }] });
  const t0 = Date.now();
  const rows = await query<{ C: string }>(
    `SELECT TRY_PARSE_JSON(SNOWFLAKE.CORTEX.DATA_AGENT_RUN('${DB}.APP.COLLECTIONS_AGENT', ?, TRUE)):content::STRING AS C`, [payload]);
  type Block = { type: string; text?: string; table?: { result_set?: { data: string[][]; resultSetMetaData: { rowType: { name: string }[] } } };
    tool_result?: { content?: { json?: { sql?: string } }[] } };
  const blocks: Block[] = JSON.parse(rows[0]?.C ?? '[]');
  // The answer is the text and tables after the agent's last tool call; earlier text is planning.
  const lastTool = blocks.reduce((m, b, i) => (b.type === 'tool_use' || b.type === 'tool_result' ? i : m), -1);
  const parts: string[] = [];
  for (const b of blocks.slice(lastTool + 1)) {
    if (b.type === 'text' && b.text) parts.push(b.text.trim());
    if (b.type === 'table' && b.table?.result_set) {
      const cols = b.table.result_set.resultSetMetaData.rowType.map((c) => c.name);
      parts.push([`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...b.table.result_set.data.slice(0, 20).map((r) => `| ${r.join(' | ')} |`)].join('\n'));
    }
  }
  const sql = blocks.flatMap((b) => b.tool_result?.content ?? []).map((c) => c.json?.sql).filter(Boolean).pop();
  const text = parts.filter(Boolean).join('\n\n');
  if (!text) throw new Error('The Cortex Agent returned no text. Check that sql/setup.sql ran.');
  return { text, sql, latencyMs: Date.now() - t0, model: 'Cortex Agent (orchestration: auto)', source: 'live' };
}

const SCORE_COLS = ['DPD', 'PAST_DUE', 'BALANCE', 'CREDIT_SCORE', 'IS_AUTO', 'PRIOR_DELINQ_12M', 'PROMISES_MADE', 'PROMISES_BROKEN',
  'PROMISES_KEPT', 'ATTEMPTS_30D', 'REACH_RATE_30D', 'CALLS_7D', 'DAYS_SINCE_PAYMENT'];
/** Runs the registered model live for one account: ROLL_RISK_XGB!PREDICT_PROBA over its current features. */
export async function rescoreAccount(id: string): Promise<Rescore> {
  const t0 = Date.now();
  const sql = `SELECT ML.ROLL_RISK_XGB!PREDICT_PROBA(${SCORE_COLS.map((c) => 'f.' + c).join(', ')}):output_feature_1::FLOAT AS P,
    s.ROLL_RISK::FLOAT AS STORED
    FROM ML.ACCOUNT_FEATURES f LEFT JOIN ML.SCORES s ON s.ACCOUNT_ID = f.ACCOUNT_ID WHERE f.PURPOSE = 'SCORE' AND f.ACCOUNT_ID = ?`;
  const r = await query<{ P: number; STORED: number | null }>(sql, [id]);
  if (!r[0]) throw new Error(`${id} has no scoring features for today`);
  return { score: Number(r[0].P), stored: r[0].STORED === null ? null : Number(r[0].STORED), model: 'ML.ROLL_RISK_XGB (default version)',
    ms: Date.now() - t0, source: 'live', sql: 'ML.ROLL_RISK_XGB!PREDICT_PROBA(' + SCORE_COLS.join(', ') + ')' };
}
