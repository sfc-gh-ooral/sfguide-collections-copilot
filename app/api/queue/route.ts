import type { NextRequest } from 'next/server';
import { FILTERS, getQueue } from '@/lib/live-data';
import { bad, live } from '../_shared';
export function GET(req: NextRequest) {
  const f = req.nextUrl.searchParams.get('filter') ?? 'ALL';
  if (!(f in FILTERS)) return bad('Unknown filter');
  return live(() => getQueue(f));
}
