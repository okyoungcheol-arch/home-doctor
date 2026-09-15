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
  최초 업로드 단계에서는 더 이상 쓰이지 않는다 — `/api/intake`가 그 역할을 대체했다. 다만 완전히
  죽은 경로는 아니다: `components/InterviewChat.tsx`가 통합 문진 루프(§6) 중 답변을 음성으로
  녹음할 때마다 이 라우트를 그대로 호출해 전사한다. 즉 `/api/intake`는 초기 업로드만, `/api/transcribe`는
  문진 중 음성 답변만 처리하는 두 개의 별도 활성 경로다.

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
  `SpecialistFindings`(`suspectedConditions`, `followUpQuestions`, 선택 필드 `precautions`)에
  `specialtyId`/`specialtyName`을 덧붙인 것이다. `precautions`는 음식/생활습관 주의사항이나 추가로
  확인이 필요한 의학적 소견을 짧은 문구 1~3개로 담는 선택 필드로, 해당 사항이 없으면 모델이
  생략할 수 있다 — `components/SpecialistCard.tsx`가 값이 있을 때만 별도 목록으로 렌더링한다.
  전문분야 카탈로그(`lib/agents/specialties.ts`의 `SPECIALTY_CATALOG`, 자세한 내용은 agent.md)에는
  기존 10개 전문분야에 이어 `한의학`(`oriental-medicine`)이 추가되어 총 11개다 — 이 전문분야의
  `systemPrompt`는 다른 전문분야보다 `precautions`를 적극적으로 채우도록 별도로 지시한다.

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

- `lib/agents/synthesize.ts`의
  `runSynthesis(opinions: SpecialistOpinion[], pastRecordsSummary?: string | null): Promise<SynthesisReport>`는
  모든 전문의의 최종 소견을 입력받아 `lib/ai/schemas.ts`의 `synthesisReportSchema`(`overallImpression`,
  `topDifferentials`, `recommendedActions`, `redFlags`, `severityLevel`)를 만족하는 `SynthesisReport`를
  반환한다. `severityLevel`(1~5 정수, 필수)은 AI가 전체 소견을 종합해 직접 판정하는 심각도 등급이다
  — 1=경미(경과 관찰), 2=관찰 필요, 3=주의(병원 방문 권장), 4=심각(빠른 진료 필요), 5=응급(즉시
  119/응급실)이며, `redFlags`가 있으면 최소 4 이상으로 판정하도록 프롬프트에 명시한다. 이 함수는
  세션당 1회 호출되는 최종 결과물이라 `TEXT_MODEL`(기본값 `anthropic/claude-opus-5`)로 호출하므로,
  `severityLevel`도 자연히 이 모델로 추론된다 — 별도의 모델 호출을 추가하지 않았다.
- `app/api/synthesize/route.ts`가 이 함수를 HTTP로 노출한다. 매니저 세션에 활성 회원이 있으면
  `listRecordsForMember`로 해당 회원의 과거 기록 최근 3건을 조회해 날짜/진단/특이사항 요약 문자열을
  만들고, 이를 `pastRecordsSummary`로 `runSynthesis`에 함께 넘긴다(손님, 또는 과거 기록이 없는
  회원은 `null` — 프롬프트에 과거 비교 섹션 자체가 붙지 않는다). 과거 기록이 있으면 모델에게 이번
  소견과 비교해 악화된 부분이 있으면 `overallImpression`에 명시하도록 지시한다. `app/page.tsx`의
  `finishInterview`가 문진 루프 종료(큐 비었음 또는 질문 수 상한 도달) 시 이 라우트를 호출해 결과를
  `SynthesisReport` 컴포넌트로 렌더링한다 — 이 컴포넌트는 `lib/severity.ts`의
  `getSeverityColor`/`getSeverityLabel`로 `severityLevel`을 색점 + 라벨로 함께 보여준다.
  `severityLevel`은 저장 시(`medical_records.severityLevel`, nullable integer) `POST /api/records`로도
  전달되며(§ 저장 참고), 매니저 대시보드 회원 목록의 경고등이 이 값을 회원별로 조회해 보여준다.

## 회원/저장 아키텍처

역할은 관리자(admin)/매니저(manager)/손님(guest) 3계층이며, 회원(member)은 로그인하지 않는
대상이다. `lib/server/auth/authorize.ts`의 `getViewer()`는 Clerk을 전혀 쓰지 않고 오직
`readSession()`만으로 역할을 판정한다 — admin 역할 세션 쿠키면 `admin`, manager 역할 세션 쿠키면
`manager`, 세션이 없으면 `guest`. `ViewerRole`에는 더 이상 독립된 `'member'` 값이 없다 —
`Viewer = { role, organizationId, adminId?, managerId?, activeMemberId? }`(더 이상 `userId`
필드가 없다).

- **관리자(admin)**: Clerk 계정도 비밀번호도 없다. `lib/server/db/schema.ts`의 `admins` 테이블
  (`id`/`phoneNumber` unique/`name`/`pinCode`(nullable)/`createdAt` — `organizationId`가 없다,
  조직에 속하지 않는 전역 역할이기 때문이다)에 등록된 관리자 전화번호를 보관하며, 이 테이블은 로컬
  스크립트 `npm run seed:admin -- <전화번호> <이름>`(`scripts/seed-admin.ts`,
  `lib/server/admins/repository.ts`의 `createAdmin`을 직접 호출한다)으로만 부트스트랩된다 — admin
  행을 만드는 공개 HTTP 라우트는 없다. 관리자가 `app/admin-entry/page.tsx`에서 전화번호(및 PIN이
  설정된 계정이면 PIN)를 제출하면 `POST /api/admin-entry`가 `findAdminByPhoneNumber`로 조회하고,
  일치하면 `lib/server/auth/session.ts`의 `createAdminSession(adminId)`이 매니저와 동일한
  `hd_session` 쿠키 포맷을 발급한다(다만 `role: 'manager'`/`managerId`/`organizationId` 대신
  `role: 'admin'`과 `adminId`를 담는다). `requireAdmin()`으로 보호되며, manager-entry와 동일하게
  IP당 5분에 10회로 속도 제한된다. `/admin-entry`는 `components/PhoneEntryForm.tsx`
  (title/description/apiPath/redirectPath를 props로 받는 공용 컴포넌트, 기존의 단일 목적
  `ManagerEntryForm`을 대체했다)를 렌더한다 — 전용 페이지가 남아있는 진입점은 이제 관리자뿐이다
  (매니저는 아래 참고).
  - **선택적 PIN**: 대부분의 관리자는 여전히 전화번호만으로 로그인하지만, 계정별로 PIN을 추가해
    둘 수 있다 — 개인/학습용 프로토타입의 기본 저보안 방침에 대한 관리자 전용 예외다(매니저는
    영향 없음, 계속 전화번호만). `npm run set-admin-pin -- <전화번호> <PIN>`
    (`scripts/set-admin-pin.ts` → `lib/server/admins/repository.ts`의
    `setAdminPinByPhoneNumber`)만이 PIN을 설정하는 경로이며, 이 함수는 평문을 그대로 저장하지
    않고 `lib/server/admins/pin.ts`의 `hashPin()`(Node 내장 `crypto.scryptSync` + 요청마다 새로
    생성하는 salt, `salt:hash` 형태 문자열)을 거쳐 `admins.pinCode`에 저장한다. `POST
    /api/admin-entry`는 조회된 `admin.pinCode`가 값이 있을 때만 `pin` 필드를 요구하고
    `verifyPin()`(같은 파일, `timingSafeEqual`로 상수 시간 비교)으로 검증한다 — 일치하지 않거나
    PIN이 아예 없으면 401 `PIN이 올바르지 않습니다.`를 반환하고 세션을 발급하지 않는다.
    `admin.pinCode`가 `null`인 계정은 이 검사를 건너뛰어 기존 동작 그대로다. admin 행을 그대로
    반환하는 다른 API가 없으므로(admin-entry 자신도 `{ success: true }`만 응답) 해시가 클라이언트로
    노출될 경로는 없다.
  - **관리자 화면 3분할**: `/admin` 계열은 `app/admin/layout.tsx`가 `requireAdmin`이 아니라
    `getViewer().role !== 'admin'`이면 `/`로 redirect하는 가드를 한 번만 수행하고
    (`app/dashboard/layout.tsx`와 동일 패턴) `components/admin/AdminNav.tsx`(단체 생성/매니저
    등록/단체별 조회 링크 + "다른 계정으로 로그인")를 공용으로 렌더한다. 예전에는 이 세 기능이
    `components/AdminPanel.tsx` 한 파일에 몰려 있었으나, 화면별로 분리했다:
    - `/admin`(`components/admin/OrganizationForm.tsx`): 단체 생성 폼만.
    - `/admin/managers`(`components/admin/ManagerForm.tsx`): 매니저 등록 폼 — 단체 선택 드롭다운을
      위해 `GET /api/admin/organizations`를 이 컴포넌트가 직접 조회한다(다른 두 화면과 상태를
      공유하지 않는 별도 페이지이므로).
    - `/admin/status`(`components/admin/AdminStatusScreen.tsx`): 단체별 조회 — 단체를 고르면
      **회원**과 **매니저** 목록을 구분해서 보여준다. 회원 목록은 `GET
      /api/admin/members?organizationId=<id>`(`listMembersForOrganization` 재사용), 매니저 목록은
      신규 `GET /api/admin/managers?organizationId=<id>`(신규 `listManagersForOrganization`)로
      조회한다. 회원을 클릭하면 `GET /api/admin/members/notable-finding?memberId=<id>`가 신규
      `findMemberById`(단체 경계 없이 id만으로 조회 — admin은 특정 단체에 속하지 않는 전역 역할이라
      매니저용 `findMemberInOrganization`과 달리 조직 일치 검사가 없다)로 회원 존재를 확인한 뒤
      `listRecordsForMember`가 이미 문진일 내림차순으로 정렬해 반환하는 배열의 첫 번째 항목(최신
      문진 1건)에서 `notableFindings`만 뽑아 반환하고, **팝업**으로 200자를 넘으면 잘라서("...")
      보여준다(기록이 아예 없으면 "특이사항 기록이 없습니다."). 매니저를 클릭하면 신규 `GET
      /api/admin/managers/notable-finding?managerId=<id>`가 신규 `findManagerById`로 매니저를
      조회한 뒤, "매니저도 회원이 될 수 있다"는 요구사항에 따라 신규
      `findMemberByPhoneInOrganization(manager.phoneNumber, manager.organizationId)`로 같은
      단체 안에서 전화번호가 일치하는 회원을 찾는다(두 테이블 모두 저장 시 이미
      `normalizePhoneNumber`로 정규화되어 있어 그대로 비교 가능) — 매칭되면 그 회원의 특이사항을
      회원 팝업과 동일하게 보여주고, 매칭되지 않으면 `isMember: false`를 반환해 팝업에 "등록된
      회원이 아닙니다"를 표시한다. `organizationId`는 항상 조회된 매니저 행에서 서버가 직접
      파생하며 클라이언트가 별도로 보내지 않는다. 매니저 대시보드처럼 단체 경계로 접근을 제한할
      필요가 없으므로(admin은 모든 단체를 볼 수 있는 역할) 이 절의 모든 라우트가
      `organizationId`/`memberId`/`managerId`를 querystring으로만 받는다(다른 admin 라우트와
      동일하게 이 프로젝트는 동적 `[param]` 라우트 세그먼트를 쓰지 않는다).
- **매니저(manager)**: 관리자와 마찬가지로 Clerk 계정이 없다. `lib/server/db/schema.ts`의 `managers` 테이블
  (`id`/`organizationId` FK/`phoneNumber` unique/`position`/`createdAt`)에 관리자가 등록해둔
  전화번호를 `components/WelcomeScreen.tsx`(첫 화면)에 내장된 입력 폼에 제출하면 `POST
  /api/manager-entry`가 `findManagerByPhoneNumber`(`lib/server/organizations/repository.ts`)로
  조회하고, 일치하면 `lib/server/auth/session.ts`의 `createManagerSession(managerId,
  organizationId)`이 서명된 HttpOnly 쿠키(`hd_session`, `jose` HS256 JWT, 비밀키는
  `SESSION_SECRET`, 만료 30일 — 시설 비치 태블릿/키오스크에 로그인 상태를 유지하는 용도라 방문
  세션이 아닌 긴 만료를 쓴다)를 발급한다. 비밀번호/PIN/OTP는 없다 — 전화번호 자체가 자격
  증명이며, 개인/학습용 프로토타입 전제의 명시적 저보안 트레이드오프다. 로그인 성공 시 입력한
  전화번호를 `localStorage`(`lib/phone.ts`의 `MANAGER_PHONE_STORAGE_KEY`)에도 저장해두고,
  `WelcomeScreen` 마운트 시 저장된 번호가 있으면 자동으로 `POST /api/manager-entry`를 다시
  호출해 즉시 `/dashboard`로 이동한다(실패하면 저장된 번호를 지우고 평소 입력 화면으로 전환) —
  같은 기기를 계속 쓰는 태블릿/키오스크에서 매번 전화번호를 다시 입력하지 않도록 하기 위함이다.
  `/dashboard` 계열 페이지 상단의 "다른 계정으로 로그인" 버튼(`components/DashboardNav.tsx`,
  `app/dashboard/layout.tsx`가 렌더)이 이 저장된 번호를 지우고, `POST /api/logout`
  (`lib/server/auth/session.ts`의 `clearSession()`이 `hd_session` 쿠키 자체를 삭제한다)을 호출해
  서버 세션까지 완전히 종료한 뒤 첫 화면으로 돌려보낸다 — 세션 쿠키를 지우지 않고 로컬 저장값만
  지우면 `/`으로 이동해도 매니저 세션이 남아 있어 `app/page.tsx`가 같은 계정의 `/dashboard`로
  즉시 되돌려보내는 버그가 있었다(현재는 수정됨). `clearSession()`은 `clearActiveMember()`와
  달리 매니저/관리자 신원까지 포함해 세션 전체를 지운다. 전화번호
  입력 필드들은 `lib/phone.ts`의 `formatPhoneNumber`로
  타이핑 중 `010-1234-5678` 형태로 자동 하이픈 포맷되지만, 서버(리포지토리 계층)는 항상
  `normalizePhoneNumber`로 숫자만 남겨 저장/조회하므로 표시 포맷과 무관하게 기존 데이터와
  계속 일치한다.
- **회원(member)**: 로그인 자체가 없다. `members` 테이블(`id`/`organizationId` FK/`name`/
  `phoneNumber`/`gender`/`ageBand`/`occupation`/`createdAt`는 전 필드 필수, `consentSignatureUrl`은
  nullable — 개인정보 동의 서명 이미지의 Vercel Blob URL, 기존에 서명 없이 등록된 회원과의
  호환을 위해 필수가 아니다)에 매니저가
  `/dashboard/register`(`components/MemberRegistrationScreen.tsx` → `POST
  /api/dashboard/members`)에서 등록한다. `/dashboard`(`components/InterviewStartScreen.tsx`)는
  회원 등록과는 분리된 별도 화면으로, `GET /api/dashboard/members` 목록에서 회원을 선택하면
  `POST /api/dashboard/select-member`가 `setActiveMember(memberId)`로 세션 쿠키에
  `activeMemberId`를 추가하고, 그 회원 명의로 문진이 진행된다. `app/dashboard/layout.tsx`가
  두 페이지 모두에 대해 매니저 세션(`role !== 'manager'`면 `/`로 redirect)을 한 번만 확인하고
  공용 내비게이션(`DashboardNav`)을 렌더한다.
- **손님(guest)**: 세션이 전혀 없다. `components/WelcomeScreen.tsx`(클라이언트 컴포넌트)가 로컬
  `entered` state만으로 "손님입장" 클릭 시 `<InterviewApp canSave={false} />`를 그 자리에서
  렌더한다 — 실제 네비게이션 없이 인라인 전환이다(게스트의 `getViewer()`는 항상 `guest`를
  반환하므로 `/`로 다시 이동시키면 무한 루프가 되기 때문에 의도적으로 네비게이션을 쓰지 않는다).
  같은 화면의 매니저 전화번호 입력 폼과는 완전히 분리된 별도 버튼이다.
- `proxy.ts` 미들웨어는 더 이상 존재하지 않는다(삭제됨) — 앱 전체에 미들웨어 기반 라우트 보호가
  없다. admin 라우트(`app/admin/page.tsx`, `app/admin/managers/page.tsx`, `app/admin/status/page.tsx`,
  `app/api/admin/organizations/route.ts`, `app/api/admin/managers/route.ts`,
  `app/api/admin/managers/notable-finding/route.ts`, `app/api/admin/members/route.ts`,
  `app/api/admin/members/notable-finding/route.ts`)를 포함해 대시보드, 기록 저장, AI 문진 파이프라인
  (`/api/triage`, `/api/specialists`, `/api/interview`, `/api/synthesize`, `/api/intake`) 등
  모든 라우트가 각자의 핸들러 내부에서 `requireAdmin()`/`getViewer()` 등으로 자체적으로 인가를
  수행한다 — 특히 AI 파이프라인 라우트들은 손님도 호출해야 하므로 의도적으로 인증 검사가 전혀
  없다.
- `/sign-up`, `/sign-in`, `/complete-profile`, `/manager-entry`는 모두 삭제되었다 — 이 앱은
  이제 Clerk을 어디서도 쓰지 않고, 매니저 로그인도 더 이상 전용 페이지가 아니라 `WelcomeScreen`에
  내장돼 있다. 관리자 진입점만 여전히 별도 페이지(`/admin-entry`, 전화번호만 입력하는 방식)로
  남아있으며, 일반 사용자 동선(`WelcomeScreen`) 어디에서도 링크되지 않고 URL을 직접 입력해
  접근한다.
- `requireMember()`(`lib/server/auth/authorize.ts`)는 이제 "로그인한 회원 본인"이 아니라 "활성
  회원을 선택한 매니저인지"를 의미하며, `POST /api/records`에서만 쓰인다.

**저장**: 활성 회원을 선택한 매니저가 진행한 문진 결과만 Neon Postgres(Drizzle)의
`medical_records` 테이블에 영구 저장된다 — 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한
텍스트만 저장한다. `medical_records`는 더 이상 `clerkUserId`나 자유 텍스트 `organizationId`를
갖지 않고, `memberId`(→ `members.id`)와 `organizationId`(→ `organizations.id`) FK로 회원·조직에
연결된다. `documentTexts`(jsonb `string[]`, 업로드 문서별 추출 텍스트 — 기존의 단일
`prescriptionText`를 대체)와 `recordingText`(nullable, 음성 녹음 전사)가 문서/녹음을 각각
보존하고, `notableFindings`(nullable)는 종합 소견의 `redFlags`를 요약해 채운다(기존에 있었지만
한 번도 채워지지 않았던 `historicalComparisonNote`를 대체). `diagnosisResult`/`precautions`는
종합 소견의 `overallImpression`/`recommendedActions`를 각각 그대로/세미콜론으로 이어붙여 채우고,
`memberName`/`memberPhoneNumber`는 저장 시점 `members` 행 값의 스냅샷이다(이후 회원 정보가
바뀌어도 과거 레코드의 표시값은 바뀌지 않는다). `severityLevel`(nullable integer)은 종합 소견의
동명 필드를 그대로 저장한다 — 이 컬럼이 생기기 전에 저장된 기존 기록은 `null`이다.
`POST /api/records`(`app/api/records/route.ts`)는
`requireMember()`로 보호되어 실패 시 401 `저장 권한이 없습니다.`를 반환하고, `activeMemberId`로
`lib/server/organizations/repository.ts`의 `findMemberInOrganization(id, organizationId)`을
조회해 회원이 이미 삭제됐거나(세션의 stale `memberId`를 그대로 믿지 않음) 다른 단체 소속이면
404를 반환한다 — 이 함수는 DB 쿼리 자체를 `id`/`organizationId` 두 조건으로 제한해 "이 회원이
호출자의 단체에 속하는지" 확인이 필요한 모든 곳(이 라우트, `select-member`, `getPatientProfile()`)이
하나를 공유한다. `memberId`/`organizationId`를 클라이언트가 보내는 값이 아니라 매니저 세션에서
직접 파생한다 — 손님은 `InterviewApp`의 `canSave` prop이 저장 요청 자체를 막아 이 엔드포인트를
호출하지 않는다. 종합 소견(§7)이 나오면 자동으로 저장되지 않는다 — `components/InterviewApp.tsx`의
리포트 화면에 "이 문진 결과를 저장하시겠습니까?" 확인 UI(저장/저장 안 함 버튼, `saveState`
state)가 뜨고, 매니저가 "저장"을 눌러야 `handleSaveRecord()`가 `POST /api/records`를 호출한다
("저장 안 함"을 누르면 API 호출 없이 그 문진 결과는 저장되지 않은 채로 남는다 — 이후 "처음으로"를
누르면 `clear-member` 경로로 활성 회원 선택만 해제된다). 저장이 성공하면 이 라우트 자신이
`clearActiveMember()`를 호출해 세션의 `activeMemberId`를 지운다(클라이언트가 별도로 기억해 호출할
필요가 없다 — "처음으로" 클릭 시 저장 없이 회원 선택만 취소하는 경우에는 `InterviewApp`이 `POST
/api/dashboard/clear-member`를 호출한다). 그렇지 않으면 공용 태블릿에서 다음 문진이 이전 회원
명의로 저장되는 사고로 이어진다.
회원 본인 로그인이 없으므로 `GET /api/records`나
`listRecordsForUser` 같은 개인별 히스토리 조회는 없다. `components/InterviewStartScreen.tsx`의
`/dashboard` 화면은 더 이상 소속단체 전체 기록을 보여주지 않는다 — 회원을 선택하지 않은 채로는
어떤 회원의 기록도 노출되지 않는다. "회원 선택" 목록에는 이름/전화번호로 필터링하는 검색창이
있고, 각 회원 행에는 "문진 시작"(기존의 `select-member` → `/` 이동)과는 별개로 "기록 보기"
버튼이 있어, 누르면 그 회원만의 기록을 `GET /api/dashboard/records?memberId=...`
(`app/api/dashboard/records/route.ts`)로 조회해 같은 화면에 인라인으로 펼쳐 보여준다("기록
보기"는 세션의 `activeMemberId`를 바꾸지 않는 순수 조회 동작이다). 이 라우트는
`findMemberInOrganization`으로 해당 회원이 호출자의 단체 소속인지 먼저 확인한 뒤
`lib/server/records/repository.ts`의 `listRecordsForMember(memberId)`로 그 회원의 기록만
반환한다(조직 전체를 조인해 반환하던 `listRecordsForOrganization`은 이 기능과 함께 삭제됐다).
`listRecordsForMember(memberId)`는 §7의 종합 단계가 과거 기록 비교에 쓰는 조회도 겸한다.

**경고등**: "회원 선택" 목록의 "기록 보기" 버튼 뒤에는 그 회원의 가장 최근 문진 `severityLevel`을
색점으로 보여주는 `SeverityIndicator`가 붙는다(`components/InterviewStartScreen.tsx`,
`lib/severity.ts`의 `getSeverityColor`/`getSeverityLabel` 공유 — §7의 `SynthesisReport`와 색상이
어긋나지 않도록 색/라벨을 한 곳에서 관리한다). 이 값은 `GET /api/dashboard/members`
(`app/api/dashboard/members/route.ts`)가 `listMembersForOrganization`과
`lib/server/records/repository.ts`의 `listLatestSeverityByMember(organizationId)`를 함께 호출해
각 회원에 `latestSeverityLevel`로 붙여 응답한다. `listLatestSeverityByMember`는 조직 전체
`medical_records`에서 `memberId`/`severityLevel` 두 컬럼만 조회해(다른 특이사항 텍스트는 절대
포함하지 않음) 회원별 가장 최근 값만 골라 `Map`으로 반환한다 — 회원을 선택하지 않고도 노출되는
정보를 "1~5 등급 숫자 하나"로 엄격히 제한해, 앞서 삭제한 소속단체 전체 기록 노출과 같은 문제로
되돌아가지 않도록 한다. 기록이 없거나(신규 회원) 이 컬럼이 생기기 전에 저장된 기존 기록만 있으면
회색("미평가")으로 표시한다.

`MemberRecordsPanel`(`components/InterviewStartScreen.tsx`)은 여러 기록을 표(table)로 나열하는
대신, 헤더 줄에 "일자 선택 콤보(`<select>`, 각 기록의 `recordDate`를 항목으로) → 복사 버튼 → 닫기
버튼" 순서로 배치하고, 콤보에서 고른 기록 하나(기본값은 최신 기록)의 일자/중대성 유무/특이사항만
본문에 보여준다. 콤보 선택 state는 effect로 초기화하지 않는다 — `selectedRecordId`가 아직
없거나 현재 목록에 없는 id면 매 렌더에서 `records[0]`(최신)으로 대체해서 파생시킨다(다른 회원의
기록을 열 때도 새로 마운트되는 컴포넌트라 effect 리셋이 필요 없다).

**복사 기능**: "복사" 버튼은 선택된 기록의 특이사항을 `navigator.clipboard.writeText()`로
클립보드에 복사한다 — 매니저가 이 텍스트를 복사해 보호자 등에게 문자로 전달하는 용도이며, 문자
발송 자체(수신자 선택, 전송)는 이 앱이 하지 않고 매니저가 클립보드 내용을 자신의 문자 앱에 붙여넣어
직접 보낸다. 복사 텍스트 형식은 `[{회원명}] {YYYY.MM.DD} 문진 특이사항\n{특이사항 또는 '특이사항
없음'}`. 복사 성공/실패 상태(`copyState`)는 어느 기록에 대한 결과인지(`recordId`)까지 함께
저장해, 복사 후 다른 일자로 바꿔도 "복사됨" 표시가 잘못 남지 않게 한다. `navigator.clipboard`가
없는 환경(예: 비-HTTPS)에서는 곧바로 실패로 처리해 "복사에 실패했습니다" 안내를 보여준다.

`getPatientProfile()`(`lib/server/auth/patientProfile.ts`)도 Clerk `unsafeMetadata`가 아니라
세션에서 값을 읽는다: 세션이 없으면 `null`, 매니저 세션이지만 `activeMemberId`가 없으면 `null`,
있으면 `findMemberInOrganization`으로 회원 행을 조회해 `{ ageBand, gender, occupation }`을
반환한다(이름·전화번호는 의도적으로 제외 — AI 프롬프트에 전달되지 않는다). `lib/agents/patientProfile.ts`의
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
