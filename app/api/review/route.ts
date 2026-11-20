import type { NextRequest } from 'next/server';
import { reviewTranscript } from '@/lib/live-data';
import { TRANSCRIPT_ID, bad, live } from '../_shared';
export function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!TRANSCRIPT_ID.test(id)) return bad('Unknown transcript');
  return live(() => reviewTranscript(id));
}
