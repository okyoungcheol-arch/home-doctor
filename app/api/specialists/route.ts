import { runSpecialistAnalysis } from '@/lib/agents/specialist';
import { getSpecialtyById } from '@/lib/agents/specialties';
import { getPatientProfile } from '@/lib/server/auth/patientProfile';
import { parseJsonBody } from '@/lib/server/http';

export const maxDuration = 60;

// 트리아지(triageResultSchema)는 최대 4개까지만 추천하고, 사용자는 그 추천 목록의 부분집합만 고를
// 수 있다 — 이 라우트 자체는 공개(비로그인 손님도 호출)이므로 그 계약을 서버에서도 강제해 임의로 큰
// specialtyIds 배열을 보내는 요청이 무제한으로 AI 모델을 병렬 호출하지 못하게 막는다.
const MAX_SPECIALTY_IDS = 4;

export async function POST(request: Request) {
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as Record<string, unknown>;

  const transcript: string = typeof body.transcript === 'string' ? body.transcript : '';
  const specialtyIds: string[] = Array.isArray(body.specialtyIds) ? (body.specialtyIds as string[]) : [];

  if (!transcript.trim() || specialtyIds.length === 0) {
    return Response.json({ error: 'transcript와 specialtyIds가 필요합니다.' }, { status: 400 });
  }

  if (specialtyIds.length > MAX_SPECIALTY_IDS) {
    return Response.json(
      { error: `specialtyIds는 최대 ${MAX_SPECIALTY_IDS}개까지 지정할 수 있습니다.` },
      { status: 400 },
    );
  }

  const unknownId = specialtyIds.find((id) => !getSpecialtyById(id));
  if (unknownId) {
    return Response.json({ error: `알 수 없는 전문분야입니다: ${unknownId}` }, { status: 400 });
  }

  const profile = await getPatientProfile();
  const opinions = await Promise.all(
    specialtyIds.map((id) => runSpecialistAnalysis(id, transcript, profile)),
  );

  return Response.json({ opinions });
}
