import { generateObject } from 'ai';
import { FAST_TEXT_MODEL } from '../ai/models';
import { getSpecialtyById } from './specialties';
import { specialistFindingsSchema, type SpecialistOpinion } from '../ai/schemas';
import { formatPatientProfileLine, type PatientProfile } from './patientProfile';

export async function runSpecialistAnalysis(
  specialtyId: string,
  transcript: string,
  profile: PatientProfile | null = null,
): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  if (!specialty) {
    throw new Error(`Unknown specialty id: ${specialtyId}`);
  }

  const profileLine = formatPatientProfileLine(profile);

  const { object } = await generateObject({
    model: FAST_TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt: `${profileLine}다음은 환자와의 상담 내용(통화 녹음 전사문 또는 첨부 문서에서 추출한 내용)입니다. 이 내용을 바탕으로 ${specialty.name} 관점에서 1차 소견을 작성하세요.\n\n상담 내용:\n"""\n${transcript}\n"""\n\nfollowUpQuestions의 각 질문에는 반드시 환자가 탭 한 번으로 고를 수 있는 답변 선택지(options)를 2~5개 함께 제시하세요. 질문, 선택지, 이유는 예외 없이 한국어로만 작성하고 영어를 섞지 마세요.`,
  });

  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}

export type AnsweredQuestion = {
  question: string;
  answerText: string;
  attachment?: { data: string; mediaType: string; filename?: string };
};

export async function runSpecialistFollowUp(
  specialtyId: string,
  transcript: string,
  priorOpinion: SpecialistOpinion,
  answered: AnsweredQuestion,
): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  if (!specialty) {
    throw new Error(`Unknown specialty id: ${specialtyId}`);
  }

  // Deliberately does not re-embed the full transcript here (unlike runSpecialistAnalysis
  // above): priorOpinion.suspectedConditions already carries this specialist's distilled
  // rationale from the original transcript, and it carries forward round to round since
  // callers always pass the just-updated opinion as the next round's priorOpinion. Re-sending
  // the (unbounded-length) original transcript on every one of up to 15 follow-up rounds per
  // session was a real input-token/latency cost for no benefit once that context exists.
  const promptText =
    `이전 ${specialty.name} 소견의 의심 질환 및 근거:\n${JSON.stringify(priorOpinion.suspectedConditions)}\n\n` +
    `방금 받은 문진 답변:\n질문: ${answered.question}\n답변: ${answered.answerText}\n\n` +
    `위 답변을 반영해 ${specialty.name} 소견을 갱신하세요. 이미 답변된 질문은 followUpQuestions에서 제외하고, 더 필요한 질문이 없다면 followUpQuestions를 빈 배열로 반환하세요. 새로 제시하는 각 질문에는 반드시 답변 선택지(options)를 2~5개 함께 제시하고, 질문·선택지·이유는 예외 없이 한국어로만 작성하세요.`;

  const prompt = answered.attachment
    ? [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: promptText },
            {
              type: 'file' as const,
              data: answered.attachment.data,
              mediaType: answered.attachment.mediaType,
              filename: answered.attachment.filename,
            },
          ],
        },
      ]
    : promptText;

  const { object } = await generateObject({
    model: FAST_TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt,
  });

  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}
