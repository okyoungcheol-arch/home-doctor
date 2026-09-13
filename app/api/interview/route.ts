import { runSpecialistFollowUp } from '@/lib/agents/specialist';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

export const maxDuration = 60;

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { specialtyId, transcript, priorOpinion, question, answerText, attachment } = body;

  if (
    typeof specialtyId !== 'string' ||
    typeof transcript !== 'string' ||
    !priorOpinion ||
    typeof question !== 'string' ||
    typeof answerText !== 'string'
  ) {
    return Response.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
  }

  const emergency = checkEmergency(answerText);
  const opinion = await runSpecialistFollowUp(specialtyId, transcript, priorOpinion, {
    question,
    answerText,
    attachment,
  });

  return Response.json({ opinion, emergency });
}
