import { z } from 'zod';

export const suspectedConditionSchema = z.object({
  name: z.string().describe('의심되는 질환명 (한국어)'),
  confidence: z.number().min(0).max(1).describe('확신도 0~1'),
  rationale: z.string().describe('이 질환을 의심하는 근거'),
});

export const followUpQuestionSchema = z.object({
  question: z.string().describe('환자에게 물어볼 질문 (한국어, 존댓말)'),
  reason: z.string().describe('이 질문이 필요한 이유'),
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
