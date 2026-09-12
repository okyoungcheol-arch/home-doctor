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

- `app/api/transcribe/route.ts`가 업로드된 파일의 MIME 타입으로 분기한다: `audio/*`는 전사, 이미지 또는
  PDF는 문서 분석 경로로 보낸다.
- 오디오: `lib/ai/transcription.ts`의 `transcribeAudio(audio: Uint8Array | Buffer): Promise<TranscriptionOutput>`.
  내부적으로 Vercel AI SDK의 `transcribe()`를 `lib/ai/models.ts`의 `TRANSCRIPTION_MODEL`로 호출한다.
  `TranscriptionOutput`은 `{ text, language?, durationInSeconds? }` 형태.
- 이미지/PDF(처방전, 진단서 등): `lib/ai/documentExtraction.ts`의
  `extractDocumentText(file: { data, mediaType, filename? }): Promise<DocumentExtractionOutput>`.
  `generateText`를 `FAST_TEXT_MODEL`로 멀티모달(`{ type: 'file' }` 콘텐츠 파트) 호출해 문서에 적힌
  증상·진단명·처방 약물 등을 한국어 텍스트로 정리한다. 반환 타입은 `{ text }`.
- 두 경로 모두 결과의 `text`가 이후 파이프라인(트리아지 이하)에 "전사문" 자리에 그대로 전달되는 동일한
  계약을 따른다 — 트리아지/전문의 프롬프트는 이 텍스트를 "환자 상담 내용"으로 지칭해 오디오/문서 중
  어느 쪽에서 왔는지 구분하지 않는다.

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

로그인(Clerk, 이메일+비밀번호)한 회원의 문진 결과는 `medical_records` 테이블(Neon Postgres,
Drizzle)에 영구 저장된다 — 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한 텍스트만 저장한다.
전화번호는 Clerk의 로그인 식별자가 아니라(Pro 유료 플랜 전용 기능이라 쓰지 않음), 회원가입 직후
`/complete-profile` 화면에서 전화번호·연령대·성별·직업을 함께 입력받아 `unsafeMetadata`(각각
`phoneNumber`/`ageBand`/`gender`/`occupation`)에 저장하는 프로필 필드다. 연령대/성별/직업은
`lib/agents/patientProfile.ts`의 `formatPatientProfileLine`을 통해 트리아지·전문의 1차 분석
프롬프트에도 전달된다. 무계정 게스트 모드는 없다 — 로그인(손님입장) 또는 회원가입 없이는 앱을 쓸 수
없으며, `role: 'guest'`(Clerk 세션 없음)는 로그인/회원가입 유도 화면(`WelcomeScreen`)만 보여주는
용도로만 쓰인다. 자세한 내용은
`docs/superpowers/specs/2026-09-12-onboarding-profile-design.md` 참고.

역할은 게스트/일반 회원/매니져/관리자 네 가지이며, Clerk가 회원정보(이메일, 전화번호, 소속단체,
매니져여부)의 단일 진실 공급원이다. 매니져는 자신이 속한 단체의 의료정보를 일자별로 조회할 수
있고, 관리자는 단체 생성과 매니져 임명을 담당한다. 자세한 아키텍처는
`docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`와
`docs/superpowers/plans/2026-09-11-accounts-medical-records-plan.md` 참고.

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
