import { runSpecialistFollowUp } from '@/lib/agents/specialist';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

export async function POST(request: Request) {
  const body = await request.json();
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
