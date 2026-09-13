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
- 회원/저장: `docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`,
  `docs/superpowers/plans/2026-09-11-accounts-medical-records-plan.md`
- 온보딩/프로필: `docs/superpowers/specs/2026-09-12-onboarding-profile-design.md`,
  `docs/superpowers/plans/2026-09-12-onboarding-profile-plan.md`
- 매니저/회원 전화번호 인증 재구축: `docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`,
  `docs/superpowers/plans/2026-09-13-manager-member-phone-auth-plan.md`
- 관리자 전화번호 인증 전환(Clerk 제거): `docs/superpowers/specs/2026-09-14-admin-phone-auth-design.md`,
  `docs/superpowers/plans/2026-09-14-admin-phone-auth-plan.md`

## 핵심 전역 제약

- 인증/권한은 관리자(admin)·매니저(manager)·손님(guest) 3계층이며, 회원(member)은 로그인하지
  않는다. Clerk는 이 프로젝트에서 더 이상 사용하지 않는다 — 관리자도 매니저와 동일하게 Clerk
  계정 없이, 관리자용으로 미리 등록해둔 전화번호를 입력하는 것만으로 입장한다
  (`app/admin-entry/page.tsx` → `POST /api/admin-entry` → `admins` 테이블 조회 성공 시
  `createAdminSession`이 세션 쿠키 발급). 최초 admin 계정은 웹 UI가 아니라 로컬 스크립트
  `npm run seed:admin -- <전화번호> <이름>`으로 DB에 직접 등록한다. 매니저는 관리자가 등록해둔
  전화번호를 입력하는 것만으로 입장한다
  (`app/manager-entry/page.tsx` → `POST /api/manager-entry` → `managers` 테이블 조회 성공 시
  `lib/server/auth/session.ts`의 `createManagerSession`이 서명된 HttpOnly 쿠키(`hd_session`, `jose`
  JWT, 30일 만료)를 발급 — 관리자·매니저 모두 비밀번호/PIN/OTP 없음, 개인/학습용 프로토타입
  전제의 낮은 보안 수준으로 의도된 것). 회원은 매니저가 이름·전화번호·성별·연령대·직업을 모두 입력해 등록해두는 대상이며
  (`members` 테이블), 매니저가 `/dashboard`에서 회원을 선택하면 세션에 `activeMemberId`가 추가되어
  그 회원 명의로 문진이 진행된다 — 연령대/성별/직업은 트리아지·전문의 1차 분석 프롬프트에도
  전달된다(이름·전화번호는 전달하지 않음). 손님은 세션 없이 즉시 문진을 시작할 수 있지만 결과는
  저장되지 않는다. 매니저가 활성 회원을 선택한 상태에서 진행한 문진 결과만 Neon
  Postgres(`organizations`/`managers`/`members`/`medical_records` 테이블, Drizzle)에 영구
  저장되며, `medical_records`는 `memberId`/`organizationId` FK로 회원·조직에 연결되고
  `documentTexts`(업로드 문서별 추출 텍스트 배열, 최대 2개)·`recordingText`(음성 녹음 전사,
  nullable)·`interviewRecord`·`notableFindings`(종합 소견의 red flag를 요약한 특이사항, nullable)
  등을 담는다. 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한 텍스트만 저장한다. 자세한 내용은
  `docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`(매니저/회원 모델의 전체
  근거) 및 관리자 인증 전환 근거인
  `docs/superpowers/specs/2026-09-14-admin-phone-auth-design.md`, 배경 문서인
  `docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`,
  `docs/superpowers/specs/2026-09-12-onboarding-profile-design.md` 참고.
- `ai@7`에서는 `generateObject`/`generateText`의 시스템 프롬프트 파라미터가 `system`에서 `instructions`로 이름이 바뀌었다(`system`은 deprecated). 모든 호출에서 `instructions`를 사용한다.
- UI 문구와 에이전트 프롬프트는 모두 한국어(존댓말)로 작성한다.
- 생성 모델은 `lib/ai/models.ts`의 `TEXT_MODEL`(품질 우선, `runSynthesis` 전용)과 `FAST_TEXT_MODEL`(속도 우선, 트리아지·전문의 분석/문진 재호출 등 세션당 여러 번 호출되는 구간용)로 구분한다. 새 `generateObject`/`generateText` 호출을 추가할 때 호출 빈도와 품질 민감도를 고려해 이 중 하나를 선택한다.
