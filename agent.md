# agent.md — 전문의 에이전트 카탈로그

이 문서는 `lib/agents/specialties.ts`의 전문의 페르소나 카탈로그와, 트리아지/전문의 에이전트가 이
카탈로그를 어떻게 소비하는지 설명한다. 전체 파이프라인 맥락은 harness.md 참고.

## `SPECIALTY_CATALOG`란

`lib/agents/specialties.ts`는 다음 타입과 상수를 내보낸다.

```ts
export type Specialty = { id: string; name: string; systemPrompt: string };
export const SPECIALTY_CATALOG: Specialty[];
export function getSpecialtyById(id: string): Specialty | undefined;
```

카탈로그의 각 항목은 세 필드를 가진다.

- `id` — 트리아지 결과와 API 호출에서 사용하는 내부 식별자(영문, kebab-case).
- `name` — 화면에 표시되는 한국어 전문분야명.
- `systemPrompt` — 해당 전문의 페르소나의 한국어 시스템 프롬프트. 모든 항목이 공통 안전 문구
  (아래 "안전 문구" 절)로 끝난다.

## 카탈로그 전체 목록 (id → 한국어 명칭)

`lib/agents/specialties.ts`를 직접 읽어 확인한 현재 카탈로그 11개 항목:

| id | name |
|---|---|
| `internal-medicine` | 내과 |
| `pulmonology` | 호흡기내과 |
| `cardiology` | 심장내과 |
| `gastroenterology` | 소화기내과 |
| `ent` | 이비인후과 |
| `neurology` | 신경과 |
| `psychiatry` | 정신건강의학과 |
| `dermatology` | 피부과 |
| `orthopedics` | 정형외과 |
| `urology` | 비뇨의학과 |
| `oriental-medicine` | 한의학 |

## 트리아지가 카탈로그에서 동적으로 선택하는 방식

`lib/agents/triage.ts`의 `runTriage(transcript: string): Promise<TriageResult>`는 전사문을 읽고
`SPECIALTY_CATALOG`에서 관련 전문분야를 2~4개 선택한다. 핵심은 결과 스키마다.

```ts
const specialtyIds = SPECIALTY_CATALOG.map((s) => s.id) as [string, ...string[]];

export const triageResultSchema = z.object({
  specialties: z
    .array(z.object({ id: z.enum(specialtyIds), reason: z.string() }))
    .min(2)
    .max(4),
});
```

`id` 필드가 카탈로그의 id들로 만든 `z.enum`이기 때문에, `generateObject`가 스키마 검증을 강제하는
한 모델은 카탈로그에 없는 전문분야를 지어낼 수 없다 — 목록 밖의 문자열을 반환하면 Zod 파싱이
실패한다. 이렇게 트리아지 단계와 카탈로그가 같은 소스(`SPECIALTY_CATALOG`)에서 파생되므로 목록이
바뀌어도 트리아지 코드를 손댈 필요가 없다. `runTriage`는 분류 작업이라 품질 민감도가 낮아
`FAST_TEXT_MODEL`(`lib/ai/models.ts`)로 호출한다.

`app/api/triage/route.ts`는 `runTriage`가 반환한 `{id, reason}` 각각에 `getSpecialtyById(id).name`
으로 한국어 이름을 채워 `{id, name, reason}`으로 응답한다. 이는 사용자가 트리아지 추천을 확인/선택하는
`components/SpecialtySelector.tsx`(harness.md §3)가 카탈로그 전체(`systemPrompt` 텍스트 포함)를
클라이언트로 가져오지 않고도 이름을 표시할 수 있게 하기 위함이다.

## `SpecialistFindings` / `SpecialistOpinion` 스키마와 병합 방식

`lib/ai/schemas.ts`가 정의하는 전문의 응답 스키마:

```ts
export const specialistFindingsSchema = z.object({
  suspectedConditions: z.array(suspectedConditionSchema).min(1).max(5), // { name, confidence(0~1), rationale }
  followUpQuestions: z.array(followUpQuestionSchema).max(5),            // { question, options(2~5개), reason }
  precautions: z.array(z.string()).max(3).optional(),                   // 음식·생활습관 주의사항 등, 짧은 문구 1~3개(선택)
});
export type SpecialistFindings = z.infer<typeof specialistFindingsSchema>;

export type SpecialistOpinion = SpecialistFindings & {
  specialtyId: string;
  specialtyName: string;
};
```

`precautions`는 선택 필드다 — 프롬프트가 음식/생활습관 관련 주의사항이나 추가로 확인이 필요한
의학적 소견을 짧게(1~3개) 요청하지만, 해당 사항이 없으면 모델이 생략할 수 있다. 기존
`suspectedConditions`/`followUpQuestions`와 달리 모든 전문분야에 공통으로 적용되는 하나의 스키마
필드이며, `한의학`(`oriental-medicine`)처럼 식이/생활습관 조언이 특히 중요한 전문분야는
`systemPrompt`에서 이 필드를 적극적으로 채우도록 별도로 지시한다. `components/SpecialistCard.tsx`가
값이 있을 때만 별도 목록으로 렌더링한다.

`followUpQuestionSchema`의 `question`/`options`/`reason` 각 필드 `.describe()`에는 "맞춤법에 맞게 작성"
지침이 포함되어 있다 — 모델이 생성하는 문진 질문/선택지에서 간헐적으로 발생하는 한글 맞춤법 오류(예:
"만져집니다"를 "관져집니다"로 잘못 생성하는 경우)를 줄이기 위한 것이다. 완전히 막지는 못하지만 재발
확률을 낮춘다.

모델(`generateObject`)에게는 `specialistFindingsSchema`만 스키마로 전달한다 — 즉 모델은
`suspectedConditions`와 `followUpQuestions`만 생성하고, `specialtyId`/`specialtyName`은 모델
출력에 포함되지 않는다. 이 두 필드는 `lib/agents/specialist.ts`의 함수들이 호출부에서 이미 알고
있는 `specialty.id`/`specialty.name`을 응답 객체에 스프레드해 붙여준다.

```ts
// lib/agents/specialist.ts
export async function runSpecialistAnalysis(specialtyId: string, transcript: string): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  // ... generateObject({ model: FAST_TEXT_MODEL, instructions: specialty.systemPrompt, schema: specialistFindingsSchema, prompt: ... })
  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}
```

같은 파일의 `runSpecialistFollowUp(specialtyId, transcript, priorOpinion: SpecialistOpinion, answered: AnsweredQuestion): Promise<SpecialistOpinion>`도
동일한 방식으로 동작한다 — 문진 답변 하나를 반영해 해당 전문의만 다시 호출하고, 응답에 다시
`specialtyId`/`specialtyName`을 붙여 반환한다. `AnsweredQuestion`은 `{ question, answerText,
attachment?: { data, mediaType, filename? } }` 형태이며, `attachment`가 있으면 텍스트와 파일이
섞인 멀티모달 프롬프트로 호출한다. 이 함수도 `FAST_TEXT_MODEL`을 쓴다 — 세션당 최대 15회까지 호출될
수 있는 고빈도 구간이기 때문이다. 문진 재호출(`runSpecialistFollowUp`)의 프롬프트는 매 라운드 전체
전사문을 다시 포함하지 않는다 — 대신 `priorOpinion.suspectedConditions`(이전 소견과 근거, 라운드를
거치며 누적됨)와 방금 받은 질문/답변만으로 소견을 갱신한다. `runSynthesis`(`lib/agents/synthesize.ts`)
만은 세션당 1회 호출되는 최종 결과물이라 품질 우선 `TEXT_MODEL`을 그대로 쓴다.

## 안전 문구

카탈로그의 모든 `systemPrompt`는 다음 공통 접미사로 끝난다(`lib/agents/specialties.ts`의
`SAFETY_SUFFIX` 상수).

> 주의: 이것은 실제 진단이 아닌 참고용 소견입니다. 확정적인 표현("~입니다")을 피하고 "~일
> 가능성이 있습니다"처럼 표현하세요. 근거가 부족하면 confidence를 낮게 설정하세요. 응급
> 가능성이 있다면 rationale에 그 사실을 명확히 언급하세요. 반드시 한국어 존댓말로 답변하세요.

## 새 전문분야 추가하는 법

1. `lib/agents/specialties.ts`의 `SPECIALTY_CATALOG` 배열에 새 항목을 추가한다:
   `{ id, name, systemPrompt: '<한국어 페르소나 설명>' + SAFETY_SUFFIX }`.
2. 그 외에는 아무것도 바꿀 필요가 없다 — 트리아지의 `z.enum`(`specialtyIds`)과 전문의 조회
   (`getSpecialtyById`)가 모두 `SPECIALTY_CATALOG`에서 동적으로 파생되기 때문에, 배열에 항목을
   추가하는 순간 트리아지가 새 전문분야를 선택 후보로 인식하고, `runSpecialistAnalysis`/
   `runSpecialistFollowUp`도 해당 id로 즉시 호출 가능해진다.
