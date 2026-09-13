import { runSynthesis } from '@/lib/agents/synthesize';
import { getViewer } from '@/lib/server/auth/authorize';
import { listRecordsForMember } from '@/lib/server/records/repository';
import { parseJsonBody } from '@/lib/server/http';
import type { SpecialistOpinion } from '@/lib/ai/schemas';

export const maxDuration = 60;

export async function POST(request: Request) {
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as Record<string, unknown>;

  const opinions: SpecialistOpinion[] = Array.isArray(body.opinions)
    ? (body.opinions as SpecialistOpinion[])
    : [];

  if (opinions.length === 0) {
    return Response.json({ error: 'opinions가 필요합니다.' }, { status: 400 });
  }

  const viewer = await getViewer();
  let pastRecordsSummary: string | null = null;
  if (viewer.role === 'manager' && viewer.activeMemberId) {
    const pastRecords = await listRecordsForMember(viewer.activeMemberId);
    if (pastRecords.length > 0) {
      pastRecordsSummary = pastRecords
        .slice(0, 3)
        .map(
          (r) =>
            `- [${new Date(r.recordDate).toLocaleDateString('ko-KR')}] 진단: ${r.diagnosisResult} / 특이사항: ${r.notableFindings ?? '없음'}`,
        )
        .join('\n');
    }
  }

  const report = await runSynthesis(opinions, pastRecordsSummary);
  return Response.json({ report });
}
