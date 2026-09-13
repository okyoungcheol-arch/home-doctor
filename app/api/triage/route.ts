import { runTriage } from '@/lib/agents/triage';
import { checkEmergency } from '@/lib/safety/emergencyCheck';
import { getSpecialtyById } from '@/lib/agents/specialties';
import { getPatientProfile } from '@/lib/server/auth/patientProfile';

export const maxDuration = 60;

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
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
