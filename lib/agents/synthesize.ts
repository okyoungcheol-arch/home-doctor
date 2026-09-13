import { generateObject } from 'ai';
import { TEXT_MODEL } from '../ai/models';
import { synthesisReportSchema, type SynthesisReport, type SpecialistOpinion } from '../ai/schemas';

export async function runSynthesis(
  opinions: SpecialistOpinion[],
  pastRecordsSummary?: string | null,
): Promise<SynthesisReport> {
  const opinionsSummary = opinions
    .map(
      (opinion) =>
        `## ${opinion.specialtyName}\n` +
        opinion.suspectedConditions
          .map((c) => `- ${c.name} (확신도 ${Math.round(c.confidence * 100)}%): ${c.rationale}`)
          .join('\n'),
    )
    .join('\n\n');

  const historySection = pastRecordsSummary
    ? `\n\n다음은 이 회원의 과거 문진 기록 요약입니다(최근 방문 순):\n${pastRecordsSummary}\n\n위 과거 기록과 이번 소견을 비교해, 특별히 나빠졌거나 심해진 증상·소견이 있다면 overallImpression에 명확히 언급하세요(예: "지난 방문 대비 ~가 악화되었습니다"). 비교할 만한 뚜렷한 변화가 없다면 이번 소견만으로 작성하세요.`
    : '';

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions:
      '당신은 여러 전문의의 소견을 취합해 종합 소견을 작성하는 코디네이터입니다. 특정 진단을 단정하지 말고 가능성이 높은 순서로 정리하며, 응급 신호가 있다면 반드시 redFlags에 포함하세요.',
    schema: synthesisReportSchema,
    prompt: `다음은 각 전문의의 소견입니다:\n\n${opinionsSummary}${historySection}`,
  });

  return object;
}
