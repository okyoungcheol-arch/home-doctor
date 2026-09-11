import { generateObject } from 'ai';
import { z } from 'zod';
import { FAST_TEXT_MODEL } from '../ai/models';
import { SPECIALTY_CATALOG } from './specialties';

const specialtyIds = SPECIALTY_CATALOG.map((s) => s.id) as [string, ...string[]];

export const triageResultSchema = z.object({
  specialties: z
    .array(
      z.object({
        id: z.enum(specialtyIds),
        reason: z.string().describe('이 전문분야를 선택한 이유 (한국어)'),
      }),
    )
    .min(2)
    .max(4),
});

export type TriageResult = z.infer<typeof triageResultSchema>;

export async function runTriage(transcript: string): Promise<TriageResult> {
  const catalogList = SPECIALTY_CATALOG.map((s) => `- ${s.id}: ${s.name}`).join('\n');

  const { object } = await generateObject({
    model: FAST_TEXT_MODEL,
    instructions:
      '당신은 병원 접수 트리아지 담당자입니다. 아래 환자 상담 내용을 읽고, 증상과 가장 관련 있는 전문 분야를 정확히 2~4개 선택하세요. 반드시 주어진 목록의 id만 사용하세요.\n\n전문분야 목록:\n' +
      catalogList,
    schema: triageResultSchema,
    prompt: `환자 상담 내용:\n"""\n${transcript}\n"""`,
  });

  return object;
}
