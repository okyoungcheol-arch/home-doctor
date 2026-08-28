import { generateObject } from 'ai';
import { TEXT_MODEL } from '../ai/models';
import { getSpecialtyById } from './specialties';
import { specialistFindingsSchema, type SpecialistOpinion } from '../ai/schemas';

export async function runSpecialistAnalysis(
  specialtyId: string,
  transcript: string,
): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  if (!specialty) {
    throw new Error(`Unknown specialty id: ${specialtyId}`);
  }

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt: `다음은 환자와의 통화 녹음 전사문입니다. 이 내용을 바탕으로 ${specialty.name} 관점에서 1차 소견을 작성하세요.\n\n전사문:\n"""\n${transcript}\n"""`,
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

  const promptText =
    `통화 녹음 전사문:\n"""\n${transcript}\n"""\n\n` +
    `이전 소견의 의심 질환:\n${JSON.stringify(priorOpinion.suspectedConditions)}\n\n` +
    `방금 받은 문진 답변:\n질문: ${answered.question}\n답변: ${answered.answerText}\n\n` +
    `위 답변을 반영해 ${specialty.name} 소견을 갱신하세요. 이미 답변된 질문은 followUpQuestions에서 제외하고, 더 필요한 질문이 없다면 followUpQuestions를 빈 배열로 반환하세요.`;

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
    model: TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt,
  });

  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}
