# 다중 전문의 AI 문진 앱 (Medical Interview App)

통화 녹음 파일을 업로드하거나 마이크로 직접 녹음하면 전사(Transcription) → 트리아지(관련 전문분야 동적 선택) →
여러 전문의 AI 에이전트의 1차 소견 → 통합 문진(추가 질의응답) → 종합 소견까지 이어지는
다중 전문의 AI 문진 프로토타입입니다. 개인/학습용이며 실제 의료 진단을 대체하지 않습니다.
서버에 오디오, 전사문, 문진 답변을 영구 저장하지 않으며 모든 세션 상태는 브라우저의 React
state에만 존재합니다(새로고침 시 소실).

## 기술 스택

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript + [Tailwind CSS v4](https://tailwindcss.com)
- [Vercel AI SDK](https://ai-sdk.dev) `ai@7` — AI Gateway 모델 문자열로 텍스트 생성/전사 호출
- [Zod 4](https://zod.dev) — 에이전트 응답 스키마 검증
- [Vitest](https://vitest.dev) — 유닛/통합 테스트

아키텍처(파이프라인 단계별 구현 매핑)는 `harness.md`, 전문의 에이전트 카탈로그는 `agent.md`,
시각 디자인 시스템은 `design.md`를 참고하세요.

## 시작하기

### 1. 환경 변수 설정

`.env.local.example`을 `.env.local`로 복사하고 `AI_GATEWAY_API_KEY`를 채워주세요. (모델 문자열
기본값은 `AI_TEXT_MODEL=anthropic/claude-sonnet-5`, `AI_TRANSCRIPTION_MODEL=openai/gpt-4o-transcribe`이며,
필요하면 같은 파일에서 덮어쓸 수 있습니다.)

```bash
cp .env.local.example .env.local
# .env.local을 열어 AI_GATEWAY_API_KEY 값을 채워넣으세요
```

### 2. 의존성 설치 및 개발 서버 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

### 3. 테스트 실행

```bash
npm test
```

빌드와 타입 체크는 각각 `npm run build`, `npx tsc --noEmit`로 실행할 수 있습니다.
