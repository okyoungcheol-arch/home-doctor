import { generateObject } from 'ai';
import { TEXT_MODEL } from '../ai/models';
import { synthesisReportSchema, type SynthesisReport, type SpecialistOpinion } from '../ai/schemas';

export async function runSynthesis(opinions: SpecialistOpinion[]): Promise<SynthesisReport> {
  const opinionsSummary = opinions
    .map(
      (opinion) =>
        `## ${opinion.specialtyName}\n` +
        opinion.suspectedConditions
          .map((c) => `- ${c.name} (확신도 ${Math.round(c.confidence * 100)}%): ${c.rationale}`)
          .join('\n'),
    )
    .join('\n\n');

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions:
      '당신은 여러 전문의의 소견을 취합해 종합 소견을 작성하는 코디네이터입니다. 특정 진단을 단정하지 말고 가능성이 높은 순서로 정리하며, 응급 신호가 있다면 반드시 redFlags에 포함하세요.',
    schema: synthesisReportSchema,
    prompt: `다음은 각 전문의의 소견입니다:\n\n${opinionsSummary}`,
  });

  return object;
}
