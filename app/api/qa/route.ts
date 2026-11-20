import type { NextRequest } from 'next/server';
import { getQa, getQaDetail } from '@/lib/live-data';
import { TRANSCRIPT_ID, bad, live } from '../_shared';
export function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id === null) return live(getQa);
  if (!TRANSCRIPT_ID.test(id)) return bad('Unknown transcript');
  return live(() => getQaDetail(id));
}
