import { recordAction } from '@/lib/live-data';
import { ACTIONS } from '@/lib/rules';
import { ACCOUNT_ID, bad, live } from '../_shared';
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !ACCOUNT_ID.test(b.id)) return bad('Unknown account');
  if (!ACTIONS.includes(b.action)) return bad('Unknown action');
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 40) : undefined);
  return live(() => recordAction(b.id, { action: b.action, amount: typeof b.amount === 'number' ? b.amount : undefined,
    date: str(b.date), program: str(b.program), channel: str(b.channel), band: str(b.band) }));
}
