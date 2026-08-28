import { runSpecialistAnalysis } from '@/lib/agents/specialist';

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const transcript: string = typeof body.transcript === 'string' ? body.transcript : '';
  const specialtyIds: string[] = Array.isArray(body.specialtyIds) ? body.specialtyIds : [];

  if (!transcript.trim() || specialtyIds.length === 0) {
    return Response.json({ error: 'transcript와 specialtyIds가 필요합니다.' }, { status: 400 });
  }

  const opinions = await Promise.all(specialtyIds.map((id) => runSpecialistAnalysis(id, transcript)));

  return Response.json({ opinions });
}
