import { runTriage } from '@/lib/agents/triage';
import { checkEmergency } from '@/lib/safety/emergencyCheck';
import { getSpecialtyById } from '@/lib/agents/specialties';
import { getPatientProfile } from '@/lib/server/auth/patientProfile';
import { parseJsonBody } from '@/lib/server/http';

export const maxDuration = 60;

export async function POST(request: Request) {
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as Record<string, unknown>;

  const transcript = typeof body.transcript === 'string' ? body.transcript : '';

  if (!transcript.trim()) {
    return Response.json({ error: 'transcript가 필요합니다.' }, { status: 400 });
  }

  const emergency = checkEmergency(transcript);
  const profile = await getPatientProfile();
  const triage = await runTriage(transcript, profile);
  const specialties = triage.specialties.map((s) => ({
    ...s,
    name: getSpecialtyById(s.id)?.name ?? s.id,
  }));

  return Response.json({ specialties, emergency });
}
