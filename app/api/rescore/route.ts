import type { NextRequest } from 'next/server';
import { rescoreAccount } from '@/lib/live-data';
import { ACCOUNT_ID, bad, live } from '../_shared';
export function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!ACCOUNT_ID.test(id)) return bad('Unknown account');
  return live(() => rescoreAccount(id));
}
