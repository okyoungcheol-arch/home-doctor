# harness.md — 멀티에이전트 오케스트레이션 아키텍처

이 문서는 앱 내부 파이프라인이 어떤 순서로 어떤 코드를 호출하는지 설명한다. 설계 원문은
`docs/superpowers/specs/2026-08-28-medical-interview-app-design.md`, 태스크 단위 구현 계획은
`docs/superpowers/plans/2026-08-28-medical-interview-app-plan.md`를 참고.

계획의 Task 1~12가 모두 구현·커밋되어 있다. 6단계 파이프라인 전체(전사 → 트리아지 → 전문의 병렬
초기 분석 → 문진 질문 병합 → 통합 문진 루프 → 종합)가 API 라우트(`app/api/*/route.ts`)와 UI
(`components/*.tsx`, `app/page.tsx`)로 조립되어 실제로 동작한다.

## 6단계 파이프라인 개요

```
[1] 전사(Transcription)
      ↓
[2] 트리아지 — 관련 전문분야 2~4개 동적 선택
      ↓
[3] 전문의 병렬 초기 분석 (선택된 각 전문의가 동시에 1차 소견 작성)
      ↓
[4] 문진 질문 병합 — 여러 전문의의 질문을 하나의 큐로 통합/중복제거
      ↓
[5] 통합 문진 루프 — 답변마다 해당 질문을 낸 전문의만 재호출 (전체 재분석 아님)
      ↓
[6] 종합 — 모든 전문의의 최종 소견을 별도 종합 에이전트가 취합
```

## 단계별 구현 매핑

### 1. 전사 (Transcription) — 구현됨

- `lib/ai/transcription.ts`의 `transcribeAudio(audio: Uint8Array | Buffer): Promise<TranscriptionOutput>`
- 내부적으로 Vercel AI SDK의 `transcribe()`를 `lib/ai/models.ts`의 `TRANSCRIPTION_MODEL`로 호출한다.
- `TranscriptionOutput`은 `{ text, language?, durationInSeconds? }` 형태.

### 2. 트리아지 — 구현됨

- `lib/agents/triage.ts`의 `runTriage(transcript: string): Promise<TriageResult>`
- `SPECIALTY_CATALOG`(`lib/agents/specialties.ts`)의 id 목록으로 만든 Zod `z.enum`을 사용해
  전사문과 관련된 전문분야를 정확히 2~4개(`triageResultSchema`가 `.min(2).max(4)`로 강제) 선택한다.
- `generateObject`를 `TEXT_MODEL`(`lib/ai/models.ts`)로 호출하며 `instructions`에 전문분야 카탈로그
  목록을 넣어 모델이 목록 밖의 과를 지어내지 못하게 한다.

### 3. 전문의 병렬 초기 분석 — 구현됨

- `lib/agents/specialist.ts`의 `runSpecialistAnalysis(specialtyId: string, transcript: string): Promise<SpecialistOpinion>`
- `app/api/specialists/route.ts`가 트리아지가 선택한 각 `specialtyId`에 대해 이 함수를
  `Promise.all`로 병렬 호출하고, 결과 배열을 `{ opinions: SpecialistOpinion[] }`로 반환한다.
- 반환 타입 `SpecialistOpinion`은 `lib/ai/schemas.ts`의 `specialistFindingsSchema`가 검증하는
  `SpecialistFindings`(`suspectedConditions`, `followUpQuestions`)에 `specialtyId`/`specialtyName`을
  덧붙인 것이다.

### 4. 문진 질문 병합 — 구현됨

- `lib/interview/mergeQuestions.ts`의 `mergeQuestions(opinions): QueuedQuestion[]`
- 여러 전문의의 `followUpQuestions`를 정규화(공백/문장부호 제거, 부분 포함 비교)해 유사/중복 질문을
  하나의 `QueuedQuestion`으로 합치고, `askedBy` 배열에 질문한 전문의들을 모두 기록한다.

### 5. 통합 문진 루프 (답변마다 해당 전문의만 재호출) — 구현됨

- 재호출 로직: `lib/agents/specialist.ts`의
  `runSpecialistFollowUp(specialtyId, transcript, priorOpinion, answered: AnsweredQuestion): Promise<SpecialistOpinion>`.
  `AnsweredQuestion`은 `{ question, answerText, attachment? }` 형태이며, `attachment`가 있으면
  텍스트+파일이 섞인 멀티모달 프롬프트를 구성해 전체 재분석 대신 해당 전문의 하나만 다시 호출한다.
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

### 6. 종합 — 구현됨

- `lib/agents/synthesize.ts`의 `runSynthesis(opinions: SpecialistOpinion[]): Promise<SynthesisReport>`는
  모든 전문의의 최종 소견을 입력받아 `lib/ai/schemas.ts`의 `synthesisReportSchema`(`overallImpression`,
  `topDifferentials`, `recommendedActions`, `redFlags`)를 만족하는 `SynthesisReport`를 반환한다.
- `app/api/synthesize/route.ts`가 이 함수를 HTTP로 노출하며, `app/page.tsx`의 `finishInterview`가
  문진 루프 종료(큐 비었음 또는 질문 수 상한 도달) 시 이를 호출해 결과를 `SynthesisReport` 컴포넌트로
  렌더링한다.

## "서버 미저장" 원칙

계획 문서의 Global Constraints에 명시된 대로, 서버 측 영구 저장은 없다: 업로드된 오디오, 전사문,
문진 답변을 DB/파일/Blob에 저장하지 않는다. 모든 세션 상태(전사문, 전문의 소견, 문진 큐)는
클라이언트 React state에만 존재하며, 새로고침 시 소실된다. 로그인/회원가입도 없다. 이는 민감한
의료 데이터를 다루는 개인/학습용 프로토타입에서 저장 부담과 컴플라이언스 리스크를 회피하기 위한
설계 결정이다(설계 문서 §2, §6 참고).

## 응급 감지 안전장치

- `lib/safety/emergencyCheck.ts`의 `checkEmergency(text: string): EmergencyCheckResult`
  (`{ isEmergency: boolean; matchedFlags: string[] }`)는 키워드/키워드 쌍 매칭으로 응급 신호를
  감지한다(예: "의식 소실" 단일 키워드, "가슴 통증 동반 호흡곤란"처럼 두 키워드가 함께 나타나야
  플래그되는 페어 트리거).
- 계획 문서에 따르면 이 함수는 **최초 전사문**과 **모든 문진 답변**에 대해 실행되어 매칭된 플래그를
  즉시 화면에 노출한다. 실제로 `app/api/triage/route.ts`가 최초 전사문에, `app/api/interview/route.ts`가
  매 문진 답변에 이 함수를 호출하며, `app/page.tsx`가 두 라우트 응답의 `emergency.matchedFlags`를
  모아 응급 배너에 표시한다. 함수 자체의 유닛 테스트는 `tests/lib/emergencyCheck.test.ts`에 있다.
