import { getDeploymentVersion } from '@/lib/version';

// 현재 서버가 서빙 중인 배포의 식별자를 돌려준다 — 열려 있는 화면(특히 홈 화면에 설치돼 며칠씩
// 닫히지 않는 PWA)이 자신이 로드된 뒤 새 배포가 올라왔는지 확인하는 용도다
// (`components/UpdateNotifier.tsx`).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ version: getDeploymentVersion() }, { headers: { 'Cache-Control': 'no-store' } });
}
