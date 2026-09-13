# harness.md — 멀티에이전트 오케스트레이션 아키텍처

이 문서는 앱 내부 파이프라인이 어떤 순서로 어떤 코드를 호출하는지 설명한다. 설계 원문은
`docs/superpowers/specs/2026-08-28-medical-interview-app-design.md`, 태스크 단위 구현 계획은
`docs/superpowers/plans/2026-08-28-medical-interview-app-plan.md`를 참고.

계획의 Task 1~12가 모두 구현·커밋되어 있다. 이후 후속 라운드에서 사용자 전문분야 선택 체크포인트,
세션 초기화("처음으로") 버튼, PWA 설치 가능성, 속도/모델 개선이 추가되어 이 문서는 그 결과인 현재
7단계 상태를 반영한다. 전체 파이프라인(전사 → 트리아지 → 사용자 전문분야 선택 → 전문의 병렬 초기
분석 → 문진 질문 병합 → 통합 문진 루프 → 종합)이 API 라우트(`app/api/*/route.ts`)와 UI
(`components/*.tsx`, `app/page.tsx`)로 조립되어 실제로 동작한다.

## 7단계 파이프라인 개요

```
[1] 전사/문서 분석(Transcription / Document Extraction)
      ↓
[2] 트리아지 — 관련 전문분야 2~4개 추천
      ↓
[3] 사용자 전문분야 선택 — 추천된 전문분야를 사용자가 확인/체크 해제 (최소 1개 필수)
      ↓
[4] 전문의 병렬 초기 분석 (선택된 각 전문의가 동시에 1차 소견 작성)
      ↓
[5] 문진 질문 병합 — 여러 전문의의 질문을 하나의 큐로 통합/중복제거
      ↓
[6] 통합 문진 루프 — 답변마다 해당 질문을 낸 전문의만 재호출 (전체 재분석 아님)
      ↓
[7] 종합 — 모든 전문의의 최종 소견을 별도 종합 에이전트가 취합
```

## 단계별 구현 매핑

### 1. 전사/문서 분석 (Transcription / Document Extraction) — 구현됨

- `components/UploadPanel.tsx`가 문서(이미지/PDF) 최대 2개와 음성 녹음 1개를 클라이언트에서
  스테이징한다 — 예전처럼 파일을 고르는 즉시 업로드하는 것이 아니라, 사용자가 원하는 만큼(문서 0~2개
  +/- 녹음 0~1개, 최소 1개는 있어야 함) 담아둔 뒤 "분석 시작" 버튼을 눌러야 한 번에 제출된다.
- `app/api/intake/route.ts`(신규, 현재 클라이언트가 실제로 호출하는 활성 경로)가 이 다중 입력을
  받아 각 문서를 `lib/ai/documentExtraction.ts`의 `extractDocumentText`로, 녹음이 있으면
  `lib/ai/transcription.ts`의 `transcribeAudio`로 각각 텍스트화한 뒤, `[문서 1]`/`[문서 2]`/
  `[음성 녹음]` 레이블을 붙인 섹션을 빈 줄로 이어붙여 하나의 `combinedTranscript` 문자열로 합친다.
  응답 형태는 `{ documentTexts: string[], recordingText: string | null, combinedTranscript: string }`.
- 오디오 전사(`transcribeAudio(audio: Uint8Array | Buffer): Promise<TranscriptionOutput>`)와 문서
  추출(`extractDocumentText(file: { data, mediaType, filename? }): Promise<DocumentExtractionOutput>`)
  함수 자체의 계약은 이전과 동일하다 — 전자는 Vercel AI SDK의 `transcribe()`를
  `lib/ai/models.ts`의 `TRANSCRIPTION_MODEL`로, 후자는 `generateText`를 `FAST_TEXT_MODEL`로
  멀티모달(`{ type: 'file' }` 콘텐츠 파트) 호출해 문서에 적힌 증상·진단명·처방 약물 등을 한국어
  텍스트로 정리한다.
- `combinedTranscript`는 이후 파이프라인(트리아지 이하)에 예전의 단일 "전사문" 자리에 그대로
  전달되는 동일한 계약을 따른다 — 트리아지/전문의 프롬프트 계약은 바뀌지 않았다.
- `app/api/transcribe/route.ts`(단일 파일을 MIME 타입으로 분기해 전사/문서 분석하던 옛 경로)는
  코드베이스에 그대로 남아 있지만 클라이언트는 더 이상 호출하지 않는다 — `/api/intake`가 그
  역할을 대체했다.

### 2. 트리아지 — 구현됨

- `lib/agents/triage.ts`의 `runTriage(transcript: string): Promise<TriageResult>`
- `SPECIALTY_CATALOG`(`lib/agents/specialties.ts`)의 id 목록으로 만든 Zod `z.enum`을 사용해
  전사문과 관련된 전문분야를 정확히 2~4개(`triageResultSchema`가 `.min(2).max(4)`로 강제) 선택한다.
- `generateObject`를 `FAST_TEXT_MODEL`(`lib/ai/models.ts`)로 호출하며 `instructions`에 전문분야
  카탈로그 목록을 넣어 모델이 목록 밖의 과를 지어내지 못하게 한다. 분류 작업이라 품질 민감도가
  낮아 속도 우선 모델을 쓴다.
- `app/api/triage/route.ts`는 `runTriage`가 반환한 `{id, reason}` 목록 각각에
  `getSpecialtyById(id).name`으로 한국어 이름을 채워 `{id, name, reason}`으로 응답한다 — 클라이언트가
  전체 카탈로그(`systemPrompt` 텍스트 포함)를 import하지 않고도 §3의 선택 UI에 이름을 표시할 수 있게
  하기 위함이다.

### 3. 사용자 전문분야 선택 — 구현됨

- `components/SpecialtySelector.tsx`는 트리아지가 추천한 전문분야 목록(`{id, name, reason}`)을
  전부 기본 선택된 체크박스로 렌더링한다. 사용자가 원치 않는 항목의 체크를 해제할 수 있으며, 0개
  선택 시 확정 버튼("문진 시작")이 비활성화된다.
- `app/page.tsx`의 `selecting-specialties` 단계에서 렌더링되며, 확정 시 `handleConfirmSpecialties`가
  사용자가 체크한 id만으로 `/api/specialists`를 호출한다 — 트리아지가 추천한 전체 목록이 아니라
  사용자가 확정한 부분집합만 다음 단계로 넘어간다.

### 4. 전문의 병렬 초기 분석 — 구현됨

- `lib/agents/specialist.ts`의 `runSpecialistAnalysis(specialtyId: string, transcript: string): Promise<SpecialistOpinion>`
- `app/api/specialists/route.ts`가 트리아지가 선택한 각 `specialtyId`에 대해 이 함수를
  `Promise.all`로 병렬 호출하고, 결과 배열을 `{ opinions: SpecialistOpinion[] }`로 반환한다.
- 반환 타입 `SpecialistOpinion`은 `lib/ai/schemas.ts`의 `specialistFindingsSchema`가 검증하는
  `SpecialistFindings`(`suspectedConditions`, `followUpQuestions`)에 `specialtyId`/`specialtyName`을
  덧붙인 것이다.

### 5. 문진 질문 병합 — 구현됨

- `lib/interview/mergeQuestions.ts`의 `mergeQuestions(opinions): QueuedQuestion[]`
- 여러 전문의의 `followUpQuestions`를 정규화(공백/문장부호 제거, 부분 포함 비교)해 유사/중복 질문을
  하나의 `QueuedQuestion`으로 합치고, `askedBy` 배열에 질문한 전문의들을 모두 기록한다.

### 6. 통합 문진 루프 (답변마다 해당 전문의만 재호출) — 구현됨

- 재호출 로직: `lib/agents/specialist.ts`의
  `runSpecialistFollowUp(specialtyId, transcript, priorOpinion, answered: AnsweredQuestion): Promise<SpecialistOpinion>`.
  `AnsweredQuestion`은 `{ question, answerText, attachment? }` 형태이며, `attachment`가 있으면
  텍스트+파일이 섞인 멀티모달 프롬프트를 구성해 전체 재분석 대신 해당 전문의 하나만 다시 호출한다.
  `generateObject`는 `FAST_TEXT_MODEL`로 호출한다(세션당 최대 15회까지 호출되는 고빈도 구간).
  이 프롬프트는 매 라운드 원본 전사문 전체를 다시 포함하지 않는다 — 대신 `priorOpinion.suspectedConditions`
  (이전 소견과 그 근거, 라운드를 거치며 누적됨)와 방금 받은 질문/답변만으로 소견을 갱신한다. `transcript`
  파라미터 자체는 함수 시그니처와 `/api/interview` 요청 계약에는 그대로 남아 있다.
- 이 함수는 `app/api/interview/route.ts`가 HTTP로 노출한다. 이 라우트는 답변 텍스트에 대해서도
  `checkEmergency`를 실행해 `{ opinion, emergency }`를 반환한다.
- 큐 순회는 `app/page.tsx`의 `handleAnswer`가 담당한다. `InterviewChat` 컴포넌트(텍스트/음성/파일
  입력)에서 답변을 받으면 해당 질문을 낸 전문의의 `/api/interview`만 호출하고, 응답의
  `followUpQuestions`를 `mergeQuestions`로 다시 병합해 큐에 추가한다.
- **종료 보장**: 답변이 끝난 질문은 정규화된 형태로 `answeredQuestions` state에 누적되며, 새로
  들어온 후속 질문은 `mergeQuestions`가 쓰는 것과 동일한 유사도 비교(`lib/interview/mergeQuestions.ts`의
  `normalize`/`isSimilar`)로 이미 답변된 질문·현재 큐에 남은 질문 모두와 비교해 걸러진다. 그래도
  모델이 계속 새 질문을 만들어내는 극단적인 경우를 대비해 answeredQuestions 개수가
  `MAX_TOTAL_QUESTIONS`(15)에 도달하면 남은 큐와 무관하게 즉시 종합 단계로 강제 전환한다.
- **응답 대기 피드백**: `components/LoadingIndicator.tsx`(스피너 + 경과 초 표시)는 원래 `app/page.tsx`에
  단계 전환용으로만 쓰였으나, `InterviewChat`이 답변 제출 후 `/api/interview` 응답을 기다리는 동안
  (`isSubmitting`)에도 동일 컴포넌트를 재사용해 보여준다. 이전에는 이 구간에서 버튼만 흐려지고 별도
  피드백이 없어 실제 지연(최대 60초까지 걸릴 수 있는 LLM 호출)보다 훨씬 느리게 느껴지는 문제가 있었다.

### 7. 종합 — 구현됨

- `lib/agents/synthesize.ts`의 `runSynthesis(opinions: SpecialistOpinion[]): Promise<SynthesisReport>`는
  모든 전문의의 최종 소견을 입력받아 `lib/ai/schemas.ts`의 `synthesisReportSchema`(`overallImpression`,
  `topDifferentials`, `recommendedActions`, `redFlags`)를 만족하는 `SynthesisReport`를 반환한다.
- `app/api/synthesize/route.ts`가 이 함수를 HTTP로 노출하며, `app/page.tsx`의 `finishInterview`가
  문진 루프 종료(큐 비었음 또는 질문 수 상한 도달) 시 이를 호출해 결과를 `SynthesisReport` 컴포넌트로
  렌더링한다.

## 회원/저장 아키텍처

역할은 관리자(admin)/매니저(manager)/손님(guest) 3계층이며, 회원(member)은 로그인하지 않는
대상이다. `lib/server/auth/authorize.ts`의 `getViewer()`가 Clerk admin 확인 → `readSession()`
(매니저 쿠키) → 없으면 `guest` 순으로 판정한다. `ViewerRole`에는 더 이상 독립된 `'member'` 값이
없다 — `Viewer = { role, userId, organizationId, managerId?, activeMemberId? }`.

- **관리자(admin)**: 기존과 동일하게 Clerk 이메일+비밀번호 로그인, `publicMetadata.role === 'admin'`,
  `requireAdmin()`으로 보호.
- **매니저(manager)**: Clerk 계정이 없다. `lib/server/db/schema.ts`의 `managers` 테이블
  (`id`/`organizationId` FK/`phoneNumber` unique/`position`/`createdAt`)에 관리자가 등록해둔
  전화번호를 `app/manager-entry/page.tsx`의 입력 폼에 제출하면 `POST /api/manager-entry`가
  `findManagerByPhoneNumber`(`lib/server/organizations/repository.ts`)로 조회하고, 일치하면
  `lib/server/auth/session.ts`의 `createManagerSession(managerId, organizationId)`이 서명된
  HttpOnly 쿠키(`hd_session`, `jose` HS256 JWT, 비밀키는 `SESSION_SECRET`, 만료 30일 — 시설
  비치 태블릿/키오스크에 로그인 상태를 유지하는 용도라 방문 세션이 아닌 긴 만료를 쓴다)를 발급한다.
  비밀번호/PIN/OTP는 없다 — 전화번호 자체가 자격 증명이며, 개인/학습용 프로토타입 전제의 명시적
  저보안 트레이드오프다.
- **회원(member)**: 로그인 자체가 없다. `members` 테이블(`id`/`organizationId` FK/`name`/
  `phoneNumber`/`gender`/`ageBand`/`occupation`/`createdAt`, 전 필드 필수)에 매니저가
  `/dashboard`(`POST /api/dashboard/members`)에서 등록한다. 매니저가 `GET /api/dashboard/members`
  목록에서 회원을 선택하면 `POST /api/dashboard/select-member`가 `setActiveMember(memberId)`로
  세션 쿠키에 `activeMemberId`를 추가하고, 그 회원 명의로 문진이 진행된다.
- **손님(guest)**: 세션이 전혀 없다. `components/WelcomeScreen.tsx`(클라이언트 컴포넌트)가 로컬
  `entered` state만으로 "손님입장" 클릭 시 `<InterviewApp canSave={false} />`를 그 자리에서
  렌더한다 — 실제 네비게이션 없이 인라인 전환이다(게스트의 `getViewer()`는 항상 `guest`를
  반환하므로 `/`로 다시 이동시키면 무한 루프가 되기 때문에 의도적으로 네비게이션을 쓰지 않는다).
  "매니저 전화번호 입장" 링크는 `/manager-entry`로 연결된다.
- `proxy.ts` 미들웨어는 이제 `/admin(.*)`, `/api/admin(.*)`만 Clerk로 보호한다. 대시보드, 기록
  저장, AI 문진 파이프라인(`/api/triage`, `/api/specialists`, `/api/interview`, `/api/synthesize`,
  `/api/intake`)을 포함한 나머지 모든 라우트는 각 라우트 핸들러 내부에서 자체적으로 인가를
  수행한다 — 특히 AI 파이프라인 라우트들은 손님도 호출해야 하므로 의도적으로 인증 검사가 전혀
  없다.
- `/sign-up`, `/complete-profile`은 삭제되었다. `/sign-in`은 남아 있으나 관리자 로그인 전용이며
  일반 사용자 동선 어디에서도 링크되지 않는다.
- `requireMember()`(`lib/server/auth/authorize.ts`)는 이제 "로그인한 회원 본인"이 아니라 "활성
  회원을 선택한 매니저인지"를 의미하며, `POST /api/records`에서만 쓰인다.

**저장**: 활성 회원을 선택한 매니저가 진행한 문진 결과만 Neon Postgres(Drizzle)의
`medical_records` 테이블에 영구 저장된다 — 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한
텍스트만 저장한다. `medical_records`는 더 이상 `clerkUserId`나 자유 텍스트 `organizationId`를
갖지 않고, `memberId`(→ `members.id`)와 `organizationId`(→ `organizations.id`) FK로 회원·조직에
연결된다. `documentTexts`(jsonb `string[]`, 업로드 문서별 추출 텍스트 — 기존의 단일
`prescriptionText`를 대체)와 `recordingText`(nullable, 음성 녹음 전사)가 문서/녹음을 각각
보존하고, `notableFindings`(nullable)는 종합 소견의 `redFlags`를 요약해 채운다(기존에 있었지만
한 번도 채워지지 않았던 `historicalComparisonNote`를 대체). `POST /api/records`
(`app/api/records/route.ts`)는 `requireMember()`로 보호되어 실패 시 401 `저장 권한이 없습니다.`를
반환하며, `memberId`/`organizationId`를 클라이언트가 보내는 값이 아니라 매니저 세션에서 직접
파생한다 — 손님은 `InterviewApp`의 `canSave` prop이 저장 요청 자체를 막아 이 엔드포인트를 호출하지
않는다. 회원 본인 로그인이 없으므로 `GET /api/records`나 `listRecordsForUser` 같은 개인별 히스토리
조회는 없다. 대신 `lib/server/records/repository.ts`의 `listRecordsForOrganization`이
`medical_records`를 `members`와 조인해 레코드마다 `memberName`을 함께 반환하고(회원명 오름차순 →
문진일 내림차순 정렬), `components/ManagerDashboard.tsx`의 기록 테이블은 (예전의 전화번호 컬럼
대신) 회원명 컬럼과 (예전의 과거비교 특이사항 컬럼 대신) `notableFindings` 기반 특이사항 컬럼을
보여준다.

`getPatientProfile()`(`lib/server/auth/patientProfile.ts`)도 Clerk `unsafeMetadata`가 아니라
세션에서 값을 읽는다: 세션이 없으면 `null`, 매니저 세션이지만 `activeMemberId`가 없으면 `null`,
있으면 `findMemberById`로 회원 행을 조회해 `{ ageBand, gender, occupation }`을 반환한다(이름·
전화번호는 의도적으로 제외 — AI 프롬프트에 전달되지 않는다). `lib/agents/patientProfile.ts`의
`PatientProfile` 타입과 `formatPatientProfileLine`은 값의 출처만 바뀌었을 뿐 그대로다.

자세한 아키텍처는 `docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`(최신,
이 모델의 근거)를 참고. 배경 문서인
`docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`,
`docs/superpowers/plans/2026-09-11-accounts-medical-records-plan.md`,
`docs/superpowers/specs/2026-09-12-onboarding-profile-design.md`는 당시 Clerk 기반 회원 로그인/
Clerk Organizations 모델을 설명하며 위 내용으로 대체되었지만, 그 이전 라운드의 배경으로 남겨둔다.

## 응급 감지 안전장치

- `lib/safety/emergencyCheck.ts`의 `checkEmergency(text: string): EmergencyCheckResult`
  (`{ isEmergency: boolean; matchedFlags: string[] }`)는 키워드/키워드 쌍 매칭으로 응급 신호를
  감지한다(예: "의식 소실" 단일 키워드, "가슴 통증 동반 호흡곤란"처럼 두 키워드가 함께 나타나야
  플래그되는 페어 트리거).
- 계획 문서에 따르면 이 함수는 **최초 전사문**과 **모든 문진 답변**에 대해 실행되어 매칭된 플래그를
  즉시 화면에 노출한다. 실제로 `app/api/triage/route.ts`가 최초 전사문에, `app/api/interview/route.ts`가
  매 문진 답변에 이 함수를 호출하며, `app/page.tsx`가 두 라우트 응답의 `emergency.matchedFlags`를
  모아 응급 배너에 표시한다. 함수 자체의 유닛 테스트는 `tests/lib/emergencyCheck.test.ts`에 있다.
- **응급 배너 UI**: `components/EmergencyBanner.tsx`가 `emergencyFlags` 배열을 받아 렌더링한다.
  `matchedFlags`가 하나라도 있으면(최초 전사문에서 감지됐든 문진 도중 감지됐든 동일하게) 빨간 점
  pulse 애니메이션(경고등 역할)과 매칭된 플래그 목록 안내 문구, `tel:119` 링크의 "119 전화하기"
  버튼을 함께 보여준다 — 모바일에서 탭하면 전화 앱이 즉시 119로 연결된다. 조건 없이 모든 `Stage`에서
  표시되므로, 문진 중간에 응급 신호가 잡혀도 화면 전환 없이 바로 노출된다.

## 세션 초기화 ("처음으로")

- `app/page.tsx`의 `handleReset`이 모든 세션 state(전사문, 트리아지 결과, 전문의 소견, 문진 큐,
  응답 기록, 종합 리포트, 응급 플래그, 에러)를 초기화하고 `stage`를 `'upload'`로 되돌린다. 서버 측
  저장이 없으므로 순수 클라이언트 state 리셋이다. `upload` 단계를 제외한 모든 단계에서 헤더에
  "처음으로" 버튼이 노출된다.
- **`sessionIdRef` 가드**: `handleTranscribed`/`handleConfirmSpecialties`/`handleAnswer`/
  `finishInterview` 네 비동기 핸들러 모두 최대 60초(`maxDuration`)까지 걸릴 수 있는 fetch를 포함한다.
  리셋 버튼이 그 도중에 눌리면, 뒤늦게 도착하는 응답이 이미 초기화된(혹은 그 사이 새로 시작된) 세션의
  state를 덮어쓸 수 있다. 이를 막기 위해 각 핸들러는 시작 시 `sessionIdRef.current`를 캡처해두고
  `setState`를 호출하기 직전마다 그 값이 여전히 최신인지 확인한다. `handleReset`은 가장 먼저
  `sessionIdRef.current`를 증가시켜, 진행 중이던 모든 핸들러의 다음 가드 체크를 실패시킨다. 이
  메커니즘은 자동 테스트로 커버되지 않으므로("답변 제출 중 처음으로 클릭" 같은 타이밍 의존적 시나리오),
  변경 시 반드시 수동으로 재검증해야 한다.

## PWA 설치 가능성

- `app/manifest.ts`(Next.js App Router 메타데이터 파일 컨벤션)가 `/manifest.webmanifest`를 자동
  서빙하며, Next가 `<link rel="manifest">`도 자동으로 삽입한다. 아이콘은 `public/icons/`에 커밋된
  3개 PNG(`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`) — `scripts/generate-pwa-icons.mjs`로
  1회 생성(브랜드 블루 `#0066FF` 배경 + "AI" 글자, sharp를 이용한 SVG→PNG 변환). 이 스크립트는
  빌드/CI의 일부가 아니며 아이콘 디자인이 바뀔 때만 수동으로 재실행한다.
- `components/InstallButton.tsx`가 설치 버튼을 담당한다: Chrome/Android/데스크톱에서는
  `beforeinstallprompt` 이벤트를 가로채 저장해두었다가 클릭 시 `.prompt()`를 호출한다. iOS Safari는
  이 이벤트를 지원하지 않으므로 UA로 감지해 "Safari 공유 버튼 → 홈 화면에 추가" 안내 팝오버를 대신
  보여준다. 이미 설치되어 standalone 모드로 실행 중이면(`display-mode: standalone` 또는
  `navigator.standalone`) 버튼을 렌더링하지 않는다. `app/layout.tsx`에 마운트되어 모든 `Stage`에서
  계속 보인다.
- 서비스 워커/오프라인 캐싱은 구현하지 않는다 — 요청 범위는 설치 가능성까지이며 오프라인 지원은
  별도 범위 밖 결정이다.
