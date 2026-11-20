// Shapes shared by the API routes, the sample bundle, and the pages.
export type Source = 'live' | 'captured';

export interface Bucket { BUCKET: string; ACCOUNTS: number; PAST_DUE: number }
export interface TrendDay { DAY: string; DELINQ_RATE: number; DPD30_RATE: number; DELINQUENT: number; PAST_DUE: number }
export interface RollRow { WINDOW: string; FROM_BUCKET: string; ACCOUNTS: number; CURED: number; ROLLED: number }
export interface PromiseMonth { MONTH: string; KEPT: number; BROKEN: number; KEPT_RATE: number }
export interface ModelEval {
  version: string; algorithm: string; label: string; trainingWindow: string; features: string[]; trainRows: number; testRows: number;
  trainPositive: number; auc: number; importance: { feature: string; importance: number }[];
  brokenPromiseLift: { group: string; snapshots: number; rollRate: number }[];
}
export interface Overview {
  kpis: { accounts: number; delinquent: number; dpd30Rate: number; pastDue: number; rollRate: number; cureRate: number; keptRate: number; queue: number };
  buckets: Bucket[]; trend: TrendDay[]; roll: RollRow[]; promises: PromiseMonth[];
  stories: { eveningTexters: number; disasterEligible: number; disasterPastDue: number; flaggedCalls: number; brokenTwice: number };
  model: ModelEval; registry: { name: string; version: string; created: string };
  ms: number; source: Source;
}

export interface QueueRow {
  ACCOUNT_ID: string; CUSTOMER_NAME: string; PRODUCT: string; CITY: string; STATE: string; ZIP: string; PREFERRED_LANGUAGE: string;
  DPD: number; PAST_DUE: number; BALANCE: number; PROMISES_BROKEN: number; CALLS_7D: number; CALL_LIMIT_7D: number; ROLL_RISK: number;
  BEST_CHANNEL: string; BEST_BAND: string; BEST_REACH_RATE: number; USUAL_CHANNEL: string | null; USUAL_BAND: string | null;
  USUAL_REACH_RATE: number | null; PLAN_CHANNEL: string; SUGGESTED_OFFER: string; ELIGIBLE_PROGRAMS: string[];
  DISASTER_ELIGIBLE: boolean; EXPECTED_RECOVERY: number; PRIORITY_SCORE: number; QUEUE_RANK: number; LAST_ACTION: string | null;
}
export interface Queue { rows: QueueRow[]; total: number; ms: number; source: Source }

export interface Program { PROGRAM_ID: string; NAME: string; DESCRIPTION: string; ELIGIBILITY: string; ELIGIBLE: boolean }
export interface AccountDetail {
  account: { ACCOUNT_ID: string; CUSTOMER_NAME: string; PRODUCT: string; CITY: string; STATE: string; ZIP: string; CREDIT_SCORE: number;
    PRINCIPAL_BALANCE: number; MONTHLY_PAYMENT: number; SMS_CONSENT: boolean; PREFERRED_LANGUAGE: string; LAST4: string; OPENED_ON: string;
    DPD: number; PAST_DUE: number; DPD_BUCKET: string; DISASTER_EVENT: string | null };
  queue: QueueRow | null;
  dpd: { DAY: string; DPD: number }[];
  payments: { PAID_ON: string; AMOUNT: number; KIND: string }[];
  promises: { PROMISE_ID: string; CREATED_DATE: string; DUE_DATE: string; CHANNEL: string; PROMISE_AMOUNT: number; STATUS: string }[];
  contacts: { ATTEMPT_TS: string; CHANNEL: string; TIME_BAND: string; OUTCOME: string }[];
  profile: { CHANNEL: string; TIME_BAND: string; ATTEMPTS: number; REACHED: number; REACH_RATE: number }[];
  programs: Program[];
  enrollments: { PROGRAM_ID: string; ENROLLED_ON: string; STATUS: string }[];
  transcripts: { TRANSCRIPT_ID: string; CALL_TS: string; AGENT_NAME: string; FLAGS: string[] }[];
  actions: { ACTION: string; DETAIL: string; ACTED_AT: string }[];
  limit: { calls7d: number; scheduledCalls: number; limit: number };
  ms: number; source: Source;
}

export interface QaRow { TRANSCRIPT_ID: string; ACCOUNT_ID: string; CALL_TS: string; AGENT_NAME: string; FLAGS: string[]; RISK: 'HIGH' | 'MEDIUM' | 'NONE' }
export interface QaList {
  rows: QaRow[]; reviewed: number; flagged: number; byFlag: { FLAG: string; N: number }[];
  byAgent: { AGENT_NAME: string; CALLS: number; FLAGGED: number }[]; ms: number; source: Source;
}
export interface QaDetail { row: QaRow; transcript: string; coaching: string | null; ms: number; source: Source }

export interface AiText { text: string; latencyMs: number; model: string; source: 'live' | 'sample'; sql?: string; flags?: string[] }
