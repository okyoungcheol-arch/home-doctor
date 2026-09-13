import { runSpecialistFollowUp, type AnsweredQuestion } from '@/lib/agents/specialist';
import { checkEmergency } from '@/lib/safety/emergencyCheck';
import { parseJsonBody } from '@/lib/server/http';
import type { SpecialistOpinion } from '@/lib/ai/schemas';

export const maxDuration = 60;

export async function POST(request: Request) {
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const { specialtyId, transcript, priorOpinion, question, answerText, attachment } =
    parsedBody.data as Record<string, unknown>;

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
  const opinion = await runSpecialistFollowUp(specialtyId, transcript, priorOpinion as SpecialistOpinion, {
    question,
    answerText,
    attachment: attachment as AnsweredQuestion['attachment'],
  });

  return Response.json({ opinion, emergency });
}
