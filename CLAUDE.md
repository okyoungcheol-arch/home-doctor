@AGENTS.md

## 프로젝트 개요

이 앱은 통화 녹음 파일을 업로드하면 전사 → 동적으로 소집된 여러 전문의 AI 에이전트의 1차 소견 → 통합 문진(추가 질의응답) → 종합 소견까지 이어지는 다중 전문의 AI 문진 앱이다. 개인/학습용 프로토타입이며 실제 의료 진단을 대체하지 않는다.

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

- 서버 측 영구 저장 없음: 오디오, 전사문, 문진 답변을 DB/파일/Blob에 저장하지 않는다. 클라이언트 React state로만 유지한다.
- `ai@7`에서는 `generateObject`/`generateText`의 시스템 프롬프트 파라미터가 `system`에서 `instructions`로 이름이 바뀌었다(`system`은 deprecated). 모든 호출에서 `instructions`를 사용한다.
- UI 문구와 에이전트 프롬프트는 모두 한국어(존댓말)로 작성한다.
