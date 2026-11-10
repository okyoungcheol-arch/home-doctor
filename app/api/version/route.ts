// 현재 서버가 서빙 중인 배포의 식별자를 돌려준다 — 열려 있는 화면(특히 홈 화면에 설치돼 며칠씩
// 닫히지 않는 PWA)이 자신이 로드된 뒤 새 배포가 올라왔는지 확인하는 용도다
// (`components/UpdateNotifier.tsx`). Vercel이 배포마다 주입하는 값을 쓰고, 로컬에서는 고정값이라
// 업데이트 알림이 뜨지 않는다.
export const dynamic = 'force-dynamic';

export function GET() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
  return Response.json({ version }, { headers: { 'Cache-Control': 'no-store' } });
}
