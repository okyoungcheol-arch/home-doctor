import { runTriage } from '@/lib/agents/triage';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';

  if (!transcript.trim()) {
    return Response.json({ error: 'transcript가 필요합니다.' }, { status: 400 });
  }

  const emergency = checkEmergency(transcript);
  const triage = await runTriage(transcript);

  return Response.json({ ...triage, emergency });
}
