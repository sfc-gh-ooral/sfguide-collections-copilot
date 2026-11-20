// Rules shared by Live mode (server) and Sample mode (browser), so both check actions the same way.
// The contact limit is illustrative, not a statement of any law.
import type { AccountDetail, QaRow } from '@/lib/types';

/** The business clock in RAW.CONFIG: data through 2026-11-15, "today" is Monday 2026-11-16. */
export const TODAY = '2026-11-16';

const HIGH = ['Threat or false statement', 'Third-party disclosure', 'Abusive or demeaning language'];
export const riskOf = (flags: string[]): QaRow['RISK'] => (flags.some((f) => HIGH.includes(f)) ? 'HIGH' : flags.length ? 'MEDIUM' : 'NONE');

export const ACTIONS = ['LOG_PROMISE', 'ENROLL_HARDSHIP', 'SCHEDULE'] as const;
export type ActionInput = { action: (typeof ACTIONS)[number]; amount?: number; date?: string; program?: string; channel?: string; band?: string };
const inWindow = (d: unknown) => typeof d === 'string' && /^2026-(11|12)-\d{2}$/.test(d) && d >= TODAY && d <= '2026-12-16';

/** Checks an action against the account (eligibility, dates, the call limit). Returns an error message or null. */
export function checkAction(a: ActionInput, detail: AccountDetail): string | null {
  if (!detail.queue) return 'Actions are available for accounts in today’s queue (1 to 59 days past due).';
  if (a.action === 'LOG_PROMISE') {
    if (typeof a.amount !== 'number' || !(a.amount >= 1 && a.amount <= 100000)) return 'Enter a promise amount between $1 and $100,000.';
    if (!inWindow(a.date)) return 'Pick a promise date in the next 30 days.';
  }
  if (a.action === 'ENROLL_HARDSHIP' && !detail.programs.some((p) => p.PROGRAM_ID === a.program && p.ELIGIBLE)) return 'The account is not eligible for that program.';
  if (a.action === 'SCHEDULE') {
    if (!['CALL', 'SMS', 'EMAIL'].includes(a.channel ?? '') || !['MORNING', 'AFTERNOON', 'EVENING'].includes(a.band ?? '')) return 'Pick a channel and time.';
    if (!inWindow(a.date)) return 'Pick a date in the next 30 days.';
    if (a.channel === 'SMS' && !detail.account.SMS_CONSENT) return 'This borrower has not consented to text messages.';
    const { calls7d, scheduledCalls, limit } = detail.limit;
    if (a.channel === 'CALL' && calls7d + scheduledCalls >= limit) return `Call limit reached: ${calls7d} calls in the last 7 days plus ${scheduledCalls} scheduled, limit ${limit}. Schedule a text or email instead.`;
  }
  return null;
}

