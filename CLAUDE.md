@AGENTS.md

## 프로젝트 개요

이 앱은 통화 녹음, 처방전 등 이미지 파일이나 PDF 파일을 업로드하거나 마이크로 직접 녹음하면 전사/문서 분석 → 트리아지(전문분야 추천) → 사용자가 추천된 전문분야를 확인/선택 → 선택된 전문의들의 병렬 1차 소견 → 통합 문진(추가 질의응답) → 종합 소견까지 이어지는 다중 전문의 AI 문진 앱 '홈 닥터'다. 언제든 "처음으로" 버튼으로 세션을 초기화할 수 있고, PWA로 홈 화면에 설치할 수도 있다. 개인/학습용 프로토타입이며 실제 의료 진단을 대체하지 않는다.

## 기술 스택

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Vercel AI SDK `ai@7` (AI Gateway 모델 문자열로 호출)
- Zod 4 (스키마/타입 검증)
- Vitest (테스트)

## 문서 안내

아키텍처는 harness.md, 전문의 에이전트 카탈로그는 agent.md, 시각 디자인 시스템은 design.md 참고.

## 스펙/계획 문서 위치

- 설계 문서: `docs/superpowers/specs/2026-08-28-medical-interview-app-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-28-medical-interview-app-plan.md`

## 핵심 전역 제약

- 회원가입/로그인(Clerk, 이메일+비밀번호 — 전화번호는 가입 후 별도 화면에서 입력받아 프로필로만
  저장)이 필요하며, 로그인한 회원의 문진 결과는 Neon Postgres(`medical_records` 테이블)에 영구
  저장된다. 단, 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한 텍스트만 저장한다. 게스트
  로그인은 기존과 동일하게 아무것도 저장하지 않는다. 자세한 내용은
  `docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md` 참고.
- `ai@7`에서는 `generateObject`/`generateText`의 시스템 프롬프트 파라미터가 `system`에서 `instructions`로 이름이 바뀌었다(`system`은 deprecated). 모든 호출에서 `instructions`를 사용한다.
- UI 문구와 에이전트 프롬프트는 모두 한국어(존댓말)로 작성한다.
- 생성 모델은 `lib/ai/models.ts`의 `TEXT_MODEL`(품질 우선, `runSynthesis` 전용)과 `FAST_TEXT_MODEL`(속도 우선, 트리아지·전문의 분석/문진 재호출 등 세션당 여러 번 호출되는 구간용)로 구분한다. 새 `generateObject`/`generateText` 호출을 추가할 때 호출 빈도와 품질 민감도를 고려해 이 중 하나를 선택한다.
