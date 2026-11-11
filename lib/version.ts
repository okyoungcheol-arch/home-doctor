// 현재 배포의 식별자. Vercel이 배포마다(빌드·런타임 모두) 주입하는 값을 쓰고, 로컬에서는
// 고정값이라 업데이트 감지가 일어나지 않는다. 화면에 심어 보내는 값(`app/layout.tsx`)과
// `GET /api/version`이 같은 함수를 써야 "내가 로드된 배포"와 "지금 서빙 중인 배포"를 비교할 수 있다.
export function getDeploymentVersion(): string {
  return process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
}
