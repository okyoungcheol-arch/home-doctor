import { z } from 'zod';

export const suspectedConditionSchema = z.object({
  name: z.string().describe('의심되는 질환명 (한국어)'),
  confidence: z.number().min(0).max(1).describe('확신도 0~1'),
  rationale: z.string().describe('이 질환을 의심하는 근거'),
});

export const followUpQuestionSchema = z.object({
  question: z.string().describe('환자에게 물어볼 질문. 반드시 한국어(존댓말)로만 작성'),
  options: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      '환자가 탭 한 번으로 고를 수 있는 짧은 답변 선택지 2~5개. 서로 겹치지 않고 실제 상황을 폭넓게 커버할 것. 반드시 한국어(존댓말 또는 자연스러운 응답체)로만 작성하고 영어를 섞지 말 것',
    ),
  reason: z.string().describe('이 질문이 필요한 이유. 반드시 한국어로만 작성'),
});

export const specialistFindingsSchema = z.object({
  suspectedConditions: z.array(suspectedConditionSchema).min(1).max(5),
  followUpQuestions: z.array(followUpQuestionSchema).max(5),
});
export type SpecialistFindings = z.infer<typeof specialistFindingsSchema>;

export type SpecialistOpinion = SpecialistFindings & {
  specialtyId: string;
  specialtyName: string;
};

export const synthesisReportSchema = z.object({
  overallImpression: z.string(),
  topDifferentials: z
    .array(
      z.object({
        condition: z.string(),
        supportingSpecialties: z.array(z.string()),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(5),
  recommendedActions: z.array(z.string()).min(1),
  redFlags: z.array(z.string()),
});
export type SynthesisReport = z.infer<typeof synthesisReportSchema>;
