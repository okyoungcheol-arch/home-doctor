# 다중 전문의 AI 문진 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통화 녹음 파일을 업로드하면 전사 → 동적 전문의 소집 → 통합 문진(텍스트/음성/파일) → 종합소견까지 이어지는 Next.js 웹앱을 만든다.

**Architecture:** Next.js App Router API 라우트가 `lib/agents/*`의 순수 함수(트리아지 → 전문의 병렬 분석 → 문진 후속 반영 → 종합)를 호출한다. 각 함수는 Vercel AI SDK `generateObject`/`transcribe`를 AI Gateway 모델 문자열로 호출한다. 서버는 상태를 저장하지 않으며, 모든 세션 상태(전사문, 전문의 소견, 문진 큐)는 클라이언트 React state에만 존재한다.

**Tech Stack:** Next.js 16 (App Router, TypeScript, Tailwind), Vercel AI SDK `ai@7` (AI Gateway 모델 문자열), Zod 4, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-28-medical-interview-app-design.md](../specs/2026-08-28-medical-interview-app-design.md)

## Global Constraints

- 텍스트/추론 모델: `anthropic/claude-sonnet-5` (env `AI_TEXT_MODEL`로 override 가능).
- 전사(STT) 모델: `openai/gpt-4o-transcribe` (env `AI_TRANSCRIPTION_MODEL`로 override 가능).
- `ai@7`에서는 `generateObject`/`generateText`의 시스템 프롬프트 파라미터가 `system`에서 `instructions`로 이름이 바뀌었다(`system`은 deprecated). 모든 호출에서 `instructions`를 사용한다.
- 서버 측 영구 저장 없음: 오디오, 전사문, 문진 답변을 DB/파일/Blob에 저장하지 않는다. 클라이언트 React state로만 유지한다.
- 로그인/회원가입 없음.
- 모든 화면에 고정 의료 면책 배너를 표시한다(`app/layout.tsx`에 배치).
- 응급 키워드 감지는 최초 전사문과 모든 문진 답변에 대해 실행하고, 매칭된 플래그를 즉시 화면에 노출한다.
- UI 문구와 에이전트 프롬프트는 모두 한국어(존댓말)로 작성한다.
- 전문의 카탈로그는 `lib/agents/specialties.ts`의 고정 목록에서만 트리아지가 선택한다(모델이 임의의 과를 지어내지 못하도록 Zod `enum`으로 제한).

---

### Task 1: 프로젝트 스캐폴딩 및 테스트 하네스

**Files:**
- Create: Next.js 프로젝트 전체(`app/`, `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` 등 — `create-next-app`이 생성)
- Create: `.env.local.example`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json` (devDependencies, `test` script)

**Interfaces:**
- Produces: `@/*` import alias(`tsconfig.json`의 `paths`), `npm run test` (vitest), `npm run build`, `npm run dev` 커맨드. 이후 모든 태스크는 이 alias와 vitest 설정을 그대로 사용한다.

- [ ] **Step 1: Next.js 프로젝트 생성**

현재 디렉토리(`c:/Gen_AI/Home_Doctor`)에는 이미 `.git`과 `docs/`가 있다. `create-next-app`은 이런 안전한 파일이 있어도 정상 동작한다(사전 검증 완료).

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --import-alias "@/*" --use-npm --disable-git --yes
```

Expected: `app/`, `package.json`, `tsconfig.json` 등이 생성됨. `tsconfig.json`의 `paths`에 `"@/*": ["./*"]`가 있는지 확인.

- [ ] **Step 2: 런타임 의존성 설치**

Run:
```bash
npm install ai@^7 zod@^4
```

- [ ] **Step 3: 테스트 의존성 설치 및 vitest 설정 작성**

Run:
```bash
npm install -D vitest@latest
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

Modify `package.json` `scripts`에 추가:
```json
"test": "vitest run"
```

- [ ] **Step 4: 스모크 테스트 작성 및 실행**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs vitest correctly', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm run test`
Expected: PASS, 1 test.

- [ ] **Step 5: 환경변수 예시 파일 작성**

Create `.env.local.example`:
```
AI_GATEWAY_API_KEY=
AI_TEXT_MODEL=anthropic/claude-sonnet-5
AI_TRANSCRIPTION_MODEL=openai/gpt-4o-transcribe
```

실제 개발 시에는 이 파일을 `.env.local`로 복사하고 [Vercel AI Gateway API 키](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)를 채워 넣어야 한다(`.env.local`은 `create-next-app`의 기본 `.gitignore`에 이미 포함되어 git에 커밋되지 않는다).

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공 (기본 템플릿 그대로이므로 에러 없어야 함).

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with vitest test harness"
```

---

### Task 2: 공용 Zod 스키마 및 타입

**Files:**
- Create: `lib/ai/schemas.ts`
- Test: `tests/lib/schemas.test.ts`

**Interfaces:**
- Produces: `suspectedConditionSchema`, `followUpQuestionSchema`, `specialistFindingsSchema`, `SpecialistFindings`, `SpecialistOpinion`(= `SpecialistFindings & { specialtyId: string; specialtyName: string }`), `synthesisReportSchema`, `SynthesisReport`. Task 3+의 모든 에이전트/컴포넌트가 이 타입들을 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { specialistFindingsSchema, synthesisReportSchema } from '@/lib/ai/schemas';

describe('specialistFindingsSchema', () => {
  it('accepts a valid findings object', () => {
    const result = specialistFindingsSchema.safeParse({
      suspectedConditions: [
        { name: '천식', confidence: 0.6, rationale: '마른기침과 야간 악화' },
      ],
      followUpQuestions: [
        { question: '운동 시 숨이 차나요?', reason: '천식 악화 요인 확인' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence outside the 0-1 range', () => {
    const result = specialistFindingsSchema.safeParse({
      suspectedConditions: [{ name: '천식', confidence: 1.5, rationale: '테스트' }],
      followUpQuestions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('synthesisReportSchema', () => {
  it('accepts a valid report', () => {
    const result = synthesisReportSchema.safeParse({
      overallImpression: '호흡기 증상이 우세합니다.',
      topDifferentials: [
        { condition: '천식', supportingSpecialties: ['호흡기내과'], confidence: 0.6 },
      ],
      recommendedActions: ['호흡기내과 방문 권장'],
      redFlags: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty recommendedActions array', () => {
    const result = synthesisReportSchema.safeParse({
      overallImpression: '요약',
      topDifferentials: [],
      recommendedActions: [],
      redFlags: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/lib/schemas.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/schemas'`.

- [ ] **Step 3: 스키마 구현**

Create `lib/ai/schemas.ts`:
```ts
import { z } from 'zod';

export const suspectedConditionSchema = z.object({
  name: z.string().describe('의심되는 질환명 (한국어)'),
  confidence: z.number().min(0).max(1).describe('확신도 0~1'),
  rationale: z.string().describe('이 질환을 의심하는 근거'),
});

export const followUpQuestionSchema = z.object({
  question: z.string().describe('환자에게 물어볼 질문 (한국어, 존댓말)'),
  reason: z.string().describe('이 질문이 필요한 이유'),
});

export const specialistFindingsSchema = z.object({
  suspectedConditions: z.array(suspectedConditionSchema).min(1).max(5),
  followUpQuestions: z.array(followUpQuestionSchema).max(5),
});
export type SpecialistFindings = z.infer<typeof specialistFindingsSchema>;

export type SpecialistOpinion = SpecialistFindings & {
  specialtyId: string;
  specialtyName: string;
};

export const synthesisReportSchema = z.object({
  overallImpression: z.string(),
  topDifferentials: z
    .array(
      z.object({
        condition: z.string(),
        supportingSpecialties: z.array(z.string()),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(5),
  recommendedActions: z.array(z.string()).min(1),
  redFlags: z.array(z.string()),
});
export type SynthesisReport = z.infer<typeof synthesisReportSchema>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/lib/schemas.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: 커밋**

```bash
git add lib/ai/schemas.ts tests/lib/schemas.test.ts
git commit -m "feat: add shared zod schemas for specialist findings and synthesis report"
```

---

### Task 3: 전문의 페르소나 카탈로그

**Files:**
- Create: `lib/agents/specialties.ts`
- Test: `tests/lib/specialties.test.ts`

**Interfaces:**
- Produces: `type Specialty = { id: string; name: string; systemPrompt: string }`, `SPECIALTY_CATALOG: Specialty[]`, `getSpecialtyById(id: string): Specialty | undefined`. Task 7(트리아지)의 enum 제약과 Task 8(전문의 에이전트)의 페르소나 프롬프트가 이 카탈로그를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/specialties.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SPECIALTY_CATALOG, getSpecialtyById } from '@/lib/agents/specialties';

describe('SPECIALTY_CATALOG', () => {
  it('has at least 6 specialties with unique ids', () => {
    const ids = SPECIALTY_CATALOG.map((s) => s.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every specialty has a non-empty systemPrompt', () => {
    for (const specialty of SPECIALTY_CATALOG) {
      expect(specialty.systemPrompt.length).toBeGreaterThan(20);
    }
  });
});

describe('getSpecialtyById', () => {
  it('finds an existing specialty', () => {
    expect(getSpecialtyById('pulmonology')?.name).toBe('호흡기내과');
  });

  it('returns undefined for an unknown id', () => {
    expect(getSpecialtyById('not-a-real-specialty')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/lib/specialties.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 카탈로그 구현**

Create `lib/agents/specialties.ts`:
```ts
export type Specialty = {
  id: string;
  name: string;
  systemPrompt: string;
};

const SAFETY_SUFFIX =
  '\n\n주의: 이것은 실제 진단이 아닌 참고용 소견입니다. 확정적인 표현("~입니다")을 피하고 "~일 가능성이 있습니다"처럼 표현하세요. 근거가 부족하면 confidence를 낮게 설정하세요. 응급 가능성이 있다면 rationale에 그 사실을 명확히 언급하세요. 반드시 한국어 존댓말로 답변하세요.';

export const SPECIALTY_CATALOG: Specialty[] = [
  {
    id: 'internal-medicine',
    name: '내과',
    systemPrompt:
      '당신은 경험이 풍부한 내과 전문의입니다. 발열, 피로, 체중 변화, 전신 쇠약 등 여러 장기에 걸친 비특이적 증상을 폭넓게 감별합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'pulmonology',
    name: '호흡기내과',
    systemPrompt:
      '당신은 호흡기내과 전문의입니다. 기침, 가래, 호흡곤란, 흉부 불편감, 천명음 등 호흡기 증상을 중심으로 분석합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'cardiology',
    name: '심장내과',
    systemPrompt:
      '당신은 심장내과 전문의입니다. 가슴 통증, 두근거림, 실신, 부종 등 심혈관계 증상을 중심으로 분석하며, 응급을 요할 수 있는 심장 관련 신호를 놓치지 않도록 특히 주의합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'gastroenterology',
    name: '소화기내과',
    systemPrompt:
      '당신은 소화기내과 전문의입니다. 복통, 소화불량, 구역/구토, 배변 습관 변화 등 소화기 증상을 중심으로 분석합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'ent',
    name: '이비인후과',
    systemPrompt:
      '당신은 이비인후과 전문의입니다. 인후통, 콧물, 코막힘, 귀 통증, 어지럼증, 목소리 변화 등 귀·코·목 증상을 중심으로 분석합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'neurology',
    name: '신경과',
    systemPrompt:
      '당신은 신경과 전문의입니다. 두통, 어지럼증, 감각 이상, 저림, 힘빠짐 등 신경학적 증상을 중심으로 분석하며, 뇌졸중을 시사하는 신호에 특히 주의합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'psychiatry',
    name: '정신건강의학과',
    systemPrompt:
      '당신은 정신건강의학과 전문의입니다. 불안, 우울, 수면 문제, 스트레스, 기분 변화 등 정신건강 증상을 공감적이고 비판단적인 태도로 분석합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'dermatology',
    name: '피부과',
    systemPrompt:
      '당신은 피부과 전문의입니다. 발진, 가려움, 피부 변색, 상처, 부기 등 피부 증상을 중심으로 분석합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'orthopedics',
    name: '정형외과',
    systemPrompt:
      '당신은 정형외과 전문의입니다. 관절통, 근육통, 부상, 움직임 제한 등 근골격계 증상을 중심으로 분석합니다.' +
      SAFETY_SUFFIX,
  },
  {
    id: 'urology',
    name: '비뇨의학과',
    systemPrompt:
      '당신은 비뇨의학과 전문의입니다. 배뇨 이상, 옆구리 통증, 생식기 증상 등 비뇨생식기 문제를 중심으로 분석합니다.' +
      SAFETY_SUFFIX,
  },
];

export function getSpecialtyById(id: string): Specialty | undefined {
  return SPECIALTY_CATALOG.find((specialty) => specialty.id === id);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/lib/specialties.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: 커밋**

```bash
git add lib/agents/specialties.ts tests/lib/specialties.test.ts
git commit -m "feat: add specialty persona catalog"
```

---

### Task 4: 응급 키워드 감지

**Files:**
- Create: `lib/safety/emergencyCheck.ts`
- Test: `tests/lib/emergencyCheck.test.ts`

**Interfaces:**
- Produces: `type EmergencyCheckResult = { isEmergency: boolean; matchedFlags: string[] }`, `checkEmergency(text: string): EmergencyCheckResult`. Task 10(트리아지/문진 API 라우트)에서 전사문과 답변마다 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/emergencyCheck.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

describe('checkEmergency', () => {
  it('flags a single strong trigger keyword', () => {
    const result = checkEmergency('갑자기 의식을 잃고 쓰러졌어요.');
    expect(result.isEmergency).toBe(true);
    expect(result.matchedFlags).toContain('의식 소실');
  });

  it('flags a paired trigger (chest pain + breathing difficulty)', () => {
    const result = checkEmergency('가슴이 답답하고 숨이 차서 힘들어요.');
    expect(result.isEmergency).toBe(true);
    expect(result.matchedFlags).toContain('가슴 통증 동반 호흡곤란');
  });

  it('does not flag a pair when only one side is present', () => {
    const result = checkEmergency('가슴이 답답하지만 숨쉬기는 편해요.');
    expect(result.matchedFlags).not.toContain('가슴 통증 동반 호흡곤란');
  });

  it('returns no flags for a benign transcript', () => {
    const result = checkEmergency('며칠 전부터 마른기침이 계속돼요.');
    expect(result.isEmergency).toBe(false);
    expect(result.matchedFlags).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/lib/emergencyCheck.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

Create `lib/safety/emergencyCheck.ts`:
```ts
export type EmergencyCheckResult = {
  isEmergency: boolean;
  matchedFlags: string[];
};

const SINGLE_TRIGGERS: { flag: string; keywords: string[] }[] = [
  { flag: '의식 소실', keywords: ['의식을 잃', '기절', '의식소실', '반응이 없'] },
  { flag: '심한 출혈', keywords: ['피가 멈추지', '심한 출혈', '피를 많이', '지혈이 안'] },
  {
    flag: '마비/발음 이상(뇌졸중 의심)',
    keywords: ['한쪽이 마비', '발음이 어눌', '입이 돌아가', '얼굴이 한쪽만'],
  },
  { flag: '자살/자해 위험', keywords: ['자살', '죽고 싶', '자해'] },
  { flag: '심한 알레르기 반응', keywords: ['목이 부어', '숨을 못 쉬', '아나필락시스'] },
];

const PAIR_TRIGGERS: { flag: string; a: string[]; b: string[] }[] = [
  {
    flag: '가슴 통증 동반 호흡곤란',
    a: ['가슴이 아프', '가슴 통증', '가슴이 답답'],
    b: ['숨이 차', '호흡곤란', '숨쉬기 힘들', '숨 쉬기 힘들'],
  },
];

export function checkEmergency(text: string): EmergencyCheckResult {
  const matchedFlags: string[] = [];

  for (const trigger of SINGLE_TRIGGERS) {
    if (trigger.keywords.some((keyword) => text.includes(keyword))) {
      matchedFlags.push(trigger.flag);
    }
  }

  for (const trigger of PAIR_TRIGGERS) {
    const hasA = trigger.a.some((keyword) => text.includes(keyword));
    const hasB = trigger.b.some((keyword) => text.includes(keyword));
    if (hasA && hasB) {
      matchedFlags.push(trigger.flag);
    }
  }

  return { isEmergency: matchedFlags.length > 0, matchedFlags };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/lib/emergencyCheck.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: 커밋**

```bash
git add lib/safety/emergencyCheck.ts tests/lib/emergencyCheck.test.ts
git commit -m "feat: add keyword-based emergency detection"
```

---

### Task 5: 문진 질문 병합/중복제거 유틸

**Files:**
- Create: `lib/interview/mergeQuestions.ts`
- Test: `tests/lib/mergeQuestions.test.ts`

**Interfaces:**
- Consumes: `SpecialistOpinion`(Task 2)의 `followUpQuestions` 형태.
- Produces: `type QueuedQuestion = { id: string; question: string; reason: string; askedBy: { specialtyId: string; specialtyName: string }[] }`, `mergeQuestions(opinions): QueuedQuestion[]`. Task 12(메인 페이지)와 Task 11(InterviewChat)이 이 타입/함수를 클라이언트에서 직접 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/mergeQuestions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mergeQuestions } from '@/lib/interview/mergeQuestions';

describe('mergeQuestions', () => {
  it('merges near-duplicate questions from two specialties into one entry', () => {
    const result = mergeQuestions([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        followUpQuestions: [{ question: '기침은 언제부터 시작됐나요?', reason: '기간 확인' }],
      },
      {
        specialtyId: 'internal-medicine',
        specialtyName: '내과',
        followUpQuestions: [{ question: '기침은 언제부터 시작됐나요?', reason: '증상 발생 시점' }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].askedBy).toHaveLength(2);
    expect(result[0].askedBy.map((a) => a.specialtyId)).toEqual(
      expect.arrayContaining(['pulmonology', 'internal-medicine']),
    );
  });

  it('keeps distinct questions separate', () => {
    const result = mergeQuestions([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        followUpQuestions: [
          { question: '기침은 언제부터 시작됐나요?', reason: 'A' },
          { question: '가래에 피가 섞여 나오나요?', reason: 'B' },
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].askedBy).toHaveLength(1);
  });

  it('returns an empty array when there are no follow-up questions', () => {
    expect(mergeQuestions([{ specialtyId: 'x', specialtyName: 'X과', followUpQuestions: [] }])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/lib/mergeQuestions.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

Create `lib/interview/mergeQuestions.ts`:
```ts
import type { SpecialistOpinion } from '@/lib/ai/schemas';

export type QueuedQuestion = {
  id: string;
  question: string;
  reason: string;
  askedBy: { specialtyId: string; specialtyName: string }[];
};

function normalize(text: string): string {
  return text.replace(/[\s.,?!~()]/g, '').toLowerCase();
}

export function mergeQuestions(
  opinions: Pick<SpecialistOpinion, 'specialtyId' | 'specialtyName' | 'followUpQuestions'>[],
): QueuedQuestion[] {
  const merged: QueuedQuestion[] = [];

  for (const opinion of opinions) {
    for (const followUp of opinion.followUpQuestions) {
      const normalized = normalize(followUp.question);
      const existing = merged.find((item) => {
        const itemNormalized = normalize(item.question);
        return (
          itemNormalized === normalized ||
          itemNormalized.includes(normalized) ||
          normalized.includes(itemNormalized)
        );
      });

      if (existing) {
        existing.askedBy.push({ specialtyId: opinion.specialtyId, specialtyName: opinion.specialtyName });
      } else {
        merged.push({
          id: globalThis.crypto.randomUUID(),
          question: followUp.question,
          reason: followUp.reason,
          askedBy: [{ specialtyId: opinion.specialtyId, specialtyName: opinion.specialtyName }],
        });
      }
    }
  }

  return merged;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/lib/mergeQuestions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: 커밋**

```bash
git add lib/interview/mergeQuestions.ts tests/lib/mergeQuestions.test.ts
git commit -m "feat: add interview question merge/dedupe utility"
```

---

### Task 6: 모델 설정 및 전사(STT) 래퍼

**Files:**
- Create: `lib/ai/models.ts`
- Create: `lib/ai/transcription.ts`
- Test: `tests/lib/transcription.test.ts`

**Interfaces:**
- Produces: `TEXT_MODEL: string`, `TRANSCRIPTION_MODEL: string`, `type TranscriptionOutput = { text: string; language?: string; durationInSeconds?: number }`, `transcribeAudio(audio: Uint8Array | Buffer): Promise<TranscriptionOutput>`. Task 10의 `/api/transcribe` 라우트가 이 함수를 소비한다.

- [ ] **Step 1: 모델 설정 작성**

Create `lib/ai/models.ts`:
```ts
export const TEXT_MODEL = process.env.AI_TEXT_MODEL ?? 'anthropic/claude-sonnet-5';
export const TRANSCRIPTION_MODEL = process.env.AI_TRANSCRIPTION_MODEL ?? 'openai/gpt-4o-transcribe';
```

- [ ] **Step 2: 실패하는 테스트 작성**

Create `tests/lib/transcription.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    transcribe: vi.fn(async () => ({
      text: '기침이 3일째 계속되고 있어요.',
      segments: [],
      language: 'ko',
      durationInSeconds: 8.2,
      warnings: [],
    })),
  };
});

import { transcribeAudio } from '@/lib/ai/transcription';

describe('transcribeAudio', () => {
  it('returns the transcript text, language, and duration', async () => {
    const result = await transcribeAudio(new Uint8Array([0, 1, 2]));
    expect(result.text).toBe('기침이 3일째 계속되고 있어요.');
    expect(result.language).toBe('ko');
    expect(result.durationInSeconds).toBeCloseTo(8.2);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm run test -- tests/lib/transcription.test.ts`
Expected: FAIL — `@/lib/ai/transcription` 모듈을 찾을 수 없음.

- [ ] **Step 4: 구현**

Create `lib/ai/transcription.ts`:
```ts
import { transcribe } from 'ai';
import { TRANSCRIPTION_MODEL } from './models';

export type TranscriptionOutput = {
  text: string;
  language?: string;
  durationInSeconds?: number;
};

export async function transcribeAudio(audio: Uint8Array | Buffer): Promise<TranscriptionOutput> {
  const result = await transcribe({
    model: TRANSCRIPTION_MODEL,
    audio,
  });

  return {
    text: result.text,
    language: result.language,
    durationInSeconds: result.durationInSeconds,
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test -- tests/lib/transcription.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: 커밋**

```bash
git add lib/ai/models.ts lib/ai/transcription.ts tests/lib/transcription.test.ts
git commit -m "feat: add AI Gateway model config and transcription wrapper"
```

---

### Task 7: 트리아지 에이전트

**Files:**
- Create: `lib/agents/triage.ts`
- Test: `tests/agents/triage.test.ts`

**Interfaces:**
- Consumes: `SPECIALTY_CATALOG`, `TEXT_MODEL`(Task 3, 6).
- Produces: `triageResultSchema`, `type TriageResult = { specialties: { id: string; reason: string }[] }`, `runTriage(transcript: string): Promise<TriageResult>`. Task 10의 `/api/triage` 라우트가 이 함수를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/agents/triage.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: vi.fn(async () => ({
      object: {
        specialties: [
          { id: 'pulmonology', reason: '기침과 호흡곤란 언급' },
          { id: 'cardiology', reason: '가슴 답답함 언급' },
        ],
      },
    })),
  };
});

import { runTriage, triageResultSchema } from '@/lib/agents/triage';

describe('runTriage', () => {
  it('returns the specialties chosen by the model', async () => {
    const result = await runTriage('기침이 심하고 가슴이 답답해요.');
    expect(result.specialties).toHaveLength(2);
    expect(result.specialties[0].id).toBe('pulmonology');
  });
});

describe('triageResultSchema', () => {
  it('rejects an id that is not in the specialty catalog', () => {
    const result = triageResultSchema.safeParse({
      specialties: [{ id: 'not-a-real-specialty', reason: 'test' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 specialties', () => {
    const result = triageResultSchema.safeParse({
      specialties: [{ id: 'pulmonology', reason: 'test' }],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/agents/triage.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

Create `lib/agents/triage.ts`:
```ts
import { generateObject } from 'ai';
import { z } from 'zod';
import { TEXT_MODEL } from '../ai/models';
import { SPECIALTY_CATALOG } from './specialties';

const specialtyIds = SPECIALTY_CATALOG.map((s) => s.id) as [string, ...string[]];

export const triageResultSchema = z.object({
  specialties: z
    .array(
      z.object({
        id: z.enum(specialtyIds),
        reason: z.string().describe('이 전문분야를 선택한 이유 (한국어)'),
      }),
    )
    .min(2)
    .max(4),
});

export type TriageResult = z.infer<typeof triageResultSchema>;

export async function runTriage(transcript: string): Promise<TriageResult> {
  const catalogList = SPECIALTY_CATALOG.map((s) => `- ${s.id}: ${s.name}`).join('\n');

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions:
      '당신은 병원 접수 트리아지 담당자입니다. 아래 통화 녹음 전사문을 읽고, 증상과 가장 관련 있는 전문 분야를 정확히 2~4개 선택하세요. 반드시 주어진 목록의 id만 사용하세요.\n\n전문분야 목록:\n' +
      catalogList,
    schema: triageResultSchema,
    prompt: `통화 녹음 전사문:\n"""\n${transcript}\n"""`,
  });

  return object;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/agents/triage.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: 커밋**

```bash
git add lib/agents/triage.ts tests/agents/triage.test.ts
git commit -m "feat: add triage agent for dynamic specialty selection"
```

---

### Task 8: 전문의 에이전트 (초기 분석 + 문진 후속 반영)

**Files:**
- Create: `lib/agents/specialist.ts`
- Test: `tests/agents/specialist.test.ts`

**Interfaces:**
- Consumes: `getSpecialtyById`(Task 3), `TEXT_MODEL`(Task 6), `specialistFindingsSchema`/`SpecialistOpinion`(Task 2).
- Produces: `runSpecialistAnalysis(specialtyId: string, transcript: string): Promise<SpecialistOpinion>`, `type AnsweredQuestion = { question: string; answerText: string; attachment?: { data: string; mediaType: string; filename?: string } }`, `runSpecialistFollowUp(specialtyId: string, transcript: string, priorOpinion: SpecialistOpinion, answered: AnsweredQuestion): Promise<SpecialistOpinion>`. Task 10의 `/api/specialists`, `/api/interview` 라우트가 이 두 함수를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/agents/specialist.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const mockGenerateObject = vi.fn(async () => ({
  object: {
    suspectedConditions: [{ name: '천식', confidence: 0.5, rationale: '마른기침' }],
    followUpQuestions: [{ question: '운동 시 숨이 차나요?', reason: '천식 확인' }],
  },
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: mockGenerateObject };
});

import { runSpecialistAnalysis, runSpecialistFollowUp } from '@/lib/agents/specialist';

describe('runSpecialistAnalysis', () => {
  it('attaches the specialty id and name to the model output', async () => {
    const opinion = await runSpecialistAnalysis('pulmonology', '기침이 오래갑니다.');
    expect(opinion.specialtyId).toBe('pulmonology');
    expect(opinion.specialtyName).toBe('호흡기내과');
    expect(opinion.suspectedConditions[0].name).toBe('천식');
  });

  it('throws for an unknown specialty id', async () => {
    await expect(runSpecialistAnalysis('not-real', '증상')).rejects.toThrow();
  });
});

describe('runSpecialistFollowUp', () => {
  it('sends a plain text prompt when no attachment is provided', async () => {
    mockGenerateObject.mockClear();
    await runSpecialistFollowUp(
      'pulmonology',
      '기침이 오래갑니다.',
      { specialtyId: 'pulmonology', specialtyName: '호흡기내과', suspectedConditions: [], followUpQuestions: [] },
      { question: '운동 시 숨이 차나요?', answerText: '네, 계단을 오를 때 숨이 찹니다.' },
    );
    const call = mockGenerateObject.mock.calls[0][0];
    expect(typeof call.prompt).toBe('string');
  });

  it('sends a multimodal prompt when an attachment is provided', async () => {
    mockGenerateObject.mockClear();
    await runSpecialistFollowUp(
      'dermatology',
      '피부에 발진이 있습니다.',
      { specialtyId: 'dermatology', specialtyName: '피부과', suspectedConditions: [], followUpQuestions: [] },
      {
        question: '사진을 보여주실 수 있나요?',
        answerText: '사진을 첨부합니다.',
        attachment: { data: 'ZmFrZQ==', mediaType: 'image/png', filename: 'rash.png' },
      },
    );
    const call = mockGenerateObject.mock.calls[0][0];
    expect(Array.isArray(call.prompt)).toBe(true);
    expect(call.prompt[0].content[1].type).toBe('file');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/agents/specialist.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

Create `lib/agents/specialist.ts`:
```ts
import { generateObject } from 'ai';
import { TEXT_MODEL } from '../ai/models';
import { getSpecialtyById } from './specialties';
import { specialistFindingsSchema, type SpecialistOpinion } from '../ai/schemas';

export async function runSpecialistAnalysis(
  specialtyId: string,
  transcript: string,
): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  if (!specialty) {
    throw new Error(`Unknown specialty id: ${specialtyId}`);
  }

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt: `다음은 환자와의 통화 녹음 전사문입니다. 이 내용을 바탕으로 ${specialty.name} 관점에서 1차 소견을 작성하세요.\n\n전사문:\n"""\n${transcript}\n"""`,
  });

  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}

export type AnsweredQuestion = {
  question: string;
  answerText: string;
  attachment?: { data: string; mediaType: string; filename?: string };
};

export async function runSpecialistFollowUp(
  specialtyId: string,
  transcript: string,
  priorOpinion: SpecialistOpinion,
  answered: AnsweredQuestion,
): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  if (!specialty) {
    throw new Error(`Unknown specialty id: ${specialtyId}`);
  }

  const promptText =
    `통화 녹음 전사문:\n"""\n${transcript}\n"""\n\n` +
    `이전 소견의 의심 질환:\n${JSON.stringify(priorOpinion.suspectedConditions)}\n\n` +
    `방금 받은 문진 답변:\n질문: ${answered.question}\n답변: ${answered.answerText}\n\n` +
    `위 답변을 반영해 ${specialty.name} 소견을 갱신하세요. 이미 답변된 질문은 followUpQuestions에서 제외하고, 더 필요한 질문이 없다면 followUpQuestions를 빈 배열로 반환하세요.`;

  const prompt = answered.attachment
    ? [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: promptText },
            {
              type: 'file' as const,
              data: answered.attachment.data,
              mediaType: answered.attachment.mediaType,
              filename: answered.attachment.filename,
            },
          ],
        },
      ]
    : promptText;

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt,
  });

  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/agents/specialist.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: 커밋**

```bash
git add lib/agents/specialist.ts tests/agents/specialist.test.ts
git commit -m "feat: add specialist agent for initial analysis and follow-up"
```

---

### Task 9: 종합 에이전트

**Files:**
- Create: `lib/agents/synthesize.ts`
- Test: `tests/agents/synthesize.test.ts`

**Interfaces:**
- Consumes: `synthesisReportSchema`, `SynthesisReport`, `SpecialistOpinion`(Task 2), `TEXT_MODEL`(Task 6).
- Produces: `runSynthesis(opinions: SpecialistOpinion[]): Promise<SynthesisReport>`. Task 10의 `/api/synthesize` 라우트가 이 함수를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/agents/synthesize.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: vi.fn(async () => ({
      object: {
        overallImpression: '호흡기 증상이 우세하며 천식 가능성이 있습니다.',
        topDifferentials: [
          { condition: '천식', supportingSpecialties: ['호흡기내과', '내과'], confidence: 0.6 },
        ],
        recommendedActions: ['호흡기내과 방문 및 폐기능 검사 권장'],
        redFlags: [],
      },
    })),
  };
});

import { runSynthesis } from '@/lib/agents/synthesize';

describe('runSynthesis', () => {
  it('returns the synthesis report from the model', async () => {
    const report = await runSynthesis([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        suspectedConditions: [{ name: '천식', confidence: 0.6, rationale: '마른기침' }],
        followUpQuestions: [],
      },
    ]);

    expect(report.overallImpression).toContain('천식');
    expect(report.topDifferentials[0].condition).toBe('천식');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/agents/synthesize.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

Create `lib/agents/synthesize.ts`:
```ts
import { generateObject } from 'ai';
import { TEXT_MODEL } from '../ai/models';
import { synthesisReportSchema, type SynthesisReport, type SpecialistOpinion } from '../ai/schemas';

export async function runSynthesis(opinions: SpecialistOpinion[]): Promise<SynthesisReport> {
  const opinionsSummary = opinions
    .map(
      (opinion) =>
        `## ${opinion.specialtyName}\n` +
        opinion.suspectedConditions
          .map((c) => `- ${c.name} (확신도 ${Math.round(c.confidence * 100)}%): ${c.rationale}`)
          .join('\n'),
    )
    .join('\n\n');

  const { object } = await generateObject({
    model: TEXT_MODEL,
    instructions:
      '당신은 여러 전문의의 소견을 취합해 종합 소견을 작성하는 코디네이터입니다. 특정 진단을 단정하지 말고 가능성이 높은 순서로 정리하며, 응급 신호가 있다면 반드시 redFlags에 포함하세요.',
    schema: synthesisReportSchema,
    prompt: `다음은 각 전문의의 소견입니다:\n\n${opinionsSummary}`,
  });

  return object;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/agents/synthesize.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: 커밋**

```bash
git add lib/agents/synthesize.ts tests/agents/synthesize.test.ts
git commit -m "feat: add synthesis agent combining specialist opinions"
```

---

### Task 10: API 라우트 (전사/트리아지/전문의/문진/종합)

**Files:**
- Create: `app/api/transcribe/route.ts`
- Create: `app/api/triage/route.ts`
- Create: `app/api/specialists/route.ts`
- Create: `app/api/interview/route.ts`
- Create: `app/api/synthesize/route.ts`
- Test: `tests/api/transcribe.test.ts`, `tests/api/triage.test.ts`, `tests/api/specialists.test.ts`, `tests/api/interview.test.ts`, `tests/api/synthesize.test.ts`

**Interfaces:**
- Consumes: `transcribeAudio`(Task 6), `runTriage`(Task 7), `runSpecialistAnalysis`/`runSpecialistFollowUp`(Task 8), `runSynthesis`(Task 9), `checkEmergency`(Task 4).
- Produces: 5개의 `POST` 라우트 핸들러(각각 JSON 응답). Task 12(메인 페이지)가 `fetch`로 이 라우트들을 호출한다.
  - `POST /api/transcribe` — `FormData(audio: File)` → `{ text, language?, durationInSeconds? }`
  - `POST /api/triage` — `{ transcript }` → `{ specialties, emergency }`
  - `POST /api/specialists` — `{ transcript, specialtyIds }` → `{ opinions }`
  - `POST /api/interview` — `{ specialtyId, transcript, priorOpinion, question, answerText, attachment? }` → `{ opinion, emergency }`
  - `POST /api/synthesize` — `{ opinions }` → `{ report }`

- [ ] **Step 1: transcribe 라우트 — 실패하는 테스트 작성**

Create `tests/api/transcribe.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/transcription', () => ({
  transcribeAudio: vi.fn(async () => ({ text: '테스트 전사', language: 'ko', durationInSeconds: 3 })),
}));

import { POST } from '@/app/api/transcribe/route';

describe('POST /api/transcribe', () => {
  it('transcribes an uploaded audio file', async () => {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], 'test.webm', { type: 'audio/webm' }));

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('테스트 전사');
  });

  it('returns 400 when no audio file is provided', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

Run: `npm run test -- tests/api/transcribe.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 2: transcribe 라우트 구현**

Create `app/api/transcribe/route.ts`:
```ts
import { transcribeAudio } from '@/lib/ai/transcription';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('audio');

  if (!(file instanceof File)) {
    return Response.json({ error: 'audio 파일이 필요합니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await transcribeAudio(buffer);
    return Response.json(result);
  } catch (error) {
    console.error('transcribe error', error);
    return Response.json({ error: '음성을 텍스트로 변환하지 못했습니다.' }, { status: 502 });
  }
}
```

Run: `npm run test -- tests/api/transcribe.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: triage 라우트 — 테스트 및 구현**

Create `tests/api/triage.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/triage', () => ({
  runTriage: vi.fn(async () => ({ specialties: [{ id: 'pulmonology', reason: '기침 언급' }] })),
}));

import { POST } from '@/app/api/triage/route';

describe('POST /api/triage', () => {
  it('returns triage specialties and emergency flags for a valid transcript', async () => {
    const request = new Request('http://localhost/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '가슴이 답답하고 숨이 차서 쓰러질 것 같아요.' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.specialties[0].id).toBe('pulmonology');
    expect(data.emergency.isEmergency).toBe(true);
  });

  it('returns 400 when transcript is missing', async () => {
    const request = new Request('http://localhost/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

Create `app/api/triage/route.ts`:
```ts
import { runTriage } from '@/lib/agents/triage';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

export async function POST(request: Request) {
  const body = await request.json();
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';

  if (!transcript.trim()) {
    return Response.json({ error: 'transcript가 필요합니다.' }, { status: 400 });
  }

  const emergency = checkEmergency(transcript);
  const triage = await runTriage(transcript);

  return Response.json({ ...triage, emergency });
}
```

Run: `npm run test -- tests/api/triage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 4: specialists 라우트 — 테스트 및 구현**

Create `tests/api/specialists.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/specialist', () => ({
  runSpecialistAnalysis: vi.fn(async (specialtyId: string) => ({
    specialtyId,
    specialtyName: specialtyId === 'pulmonology' ? '호흡기내과' : '심장내과',
    suspectedConditions: [],
    followUpQuestions: [],
  })),
}));

import { POST } from '@/app/api/specialists/route';

describe('POST /api/specialists', () => {
  it('runs analysis for every requested specialty', async () => {
    const request = new Request('http://localhost/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '증상 설명', specialtyIds: ['pulmonology', 'cardiology'] }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.opinions).toHaveLength(2);
  });

  it('returns 400 when specialtyIds is empty', async () => {
    const request = new Request('http://localhost/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '증상 설명', specialtyIds: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

Create `app/api/specialists/route.ts`:
```ts
import { runSpecialistAnalysis } from '@/lib/agents/specialist';

export async function POST(request: Request) {
  const body = await request.json();
  const transcript: string = typeof body.transcript === 'string' ? body.transcript : '';
  const specialtyIds: string[] = Array.isArray(body.specialtyIds) ? body.specialtyIds : [];

  if (!transcript.trim() || specialtyIds.length === 0) {
    return Response.json({ error: 'transcript와 specialtyIds가 필요합니다.' }, { status: 400 });
  }

  const opinions = await Promise.all(specialtyIds.map((id) => runSpecialistAnalysis(id, transcript)));

  return Response.json({ opinions });
}
```

Run: `npm run test -- tests/api/specialists.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: interview 라우트 — 테스트 및 구현**

Create `tests/api/interview.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/specialist', () => ({
  runSpecialistFollowUp: vi.fn(async () => ({
    suspectedConditions: [{ name: '천식', confidence: 0.7, rationale: '운동 시 호흡곤란 확인됨' }],
    followUpQuestions: [],
  })),
}));

import { POST } from '@/app/api/interview/route';

describe('POST /api/interview', () => {
  it('returns an updated opinion and emergency flags', async () => {
    const request = new Request('http://localhost/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specialtyId: 'pulmonology',
        transcript: '기침이 계속됩니다.',
        priorOpinion: {
          specialtyId: 'pulmonology',
          specialtyName: '호흡기내과',
          suspectedConditions: [],
          followUpQuestions: [],
        },
        question: '운동 시 숨이 차나요?',
        answerText: '네, 계단을 오르면 숨이 찹니다.',
      }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.opinion.suspectedConditions[0].name).toBe('천식');
    expect(data.emergency).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

Create `app/api/interview/route.ts`:
```ts
import { runSpecialistFollowUp } from '@/lib/agents/specialist';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

export async function POST(request: Request) {
  const body = await request.json();
  const { specialtyId, transcript, priorOpinion, question, answerText, attachment } = body;

  if (
    typeof specialtyId !== 'string' ||
    typeof transcript !== 'string' ||
    !priorOpinion ||
    typeof question !== 'string' ||
    typeof answerText !== 'string'
  ) {
    return Response.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
  }

  const emergency = checkEmergency(answerText);
  const opinion = await runSpecialistFollowUp(specialtyId, transcript, priorOpinion, {
    question,
    answerText,
    attachment,
  });

  return Response.json({ opinion, emergency });
}
```

Run: `npm run test -- tests/api/interview.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: synthesize 라우트 — 테스트 및 구현**

Create `tests/api/synthesize.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/synthesize', () => ({
  runSynthesis: vi.fn(async () => ({
    overallImpression: '호흡기 증상이 우세합니다.',
    topDifferentials: [],
    recommendedActions: ['경과 관찰'],
    redFlags: [],
  })),
}));

import { POST } from '@/app/api/synthesize/route';

describe('POST /api/synthesize', () => {
  it('returns a synthesis report', async () => {
    const request = new Request('http://localhost/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opinions: [
          { specialtyId: 'pulmonology', specialtyName: '호흡기내과', suspectedConditions: [], followUpQuestions: [] },
        ],
      }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.report.overallImpression).toBe('호흡기 증상이 우세합니다.');
  });

  it('returns 400 when opinions is empty', async () => {
    const request = new Request('http://localhost/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opinions: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

Create `app/api/synthesize/route.ts`:
```ts
import { runSynthesis } from '@/lib/agents/synthesize';

export async function POST(request: Request) {
  const body = await request.json();
  const opinions = Array.isArray(body.opinions) ? body.opinions : [];

  if (opinions.length === 0) {
    return Response.json({ error: 'opinions가 필요합니다.' }, { status: 400 });
  }

  const report = await runSynthesis(opinions);
  return Response.json({ report });
}
```

Run: `npm run test -- tests/api/synthesize.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: 전체 테스트 스위트 실행**

Run: `npm run test`
Expected: 모든 테스트 PASS (Task 1~10 누적).

- [ ] **Step 8: 커밋**

```bash
git add app/api tests/api
git commit -m "feat: add API routes wiring transcription, triage, specialists, interview, synthesis"
```

---

### Task 11: UI 컴포넌트 (배너/업로드/문진 채팅/소견 카드)

**Files:**
- Create: `components/DisclaimerBanner.tsx`
- Create: `components/UploadPanel.tsx`
- Create: `components/InterviewChat.tsx`
- Create: `components/SpecialistCard.tsx`
- Create: `components/SynthesisReport.tsx`

**Interfaces:**
- Consumes: `QueuedQuestion`(Task 5), `SpecialistOpinion`/`SynthesisReport` 타입(Task 2).
- Produces: 5개의 React 컴포넌트. Task 12(`app/page.tsx`, `app/layout.tsx`)가 이들을 조립한다.

구현 전에 `design.md`(레포 루트)를 먼저 읽고 그 컴포넌트 패턴을 따를 것.

이 태스크는 UI 컴포넌트이므로 자동화 유닛 테스트 대신 Task 12에서 브라우저로 수동 검증한다(디자인 스펙 7절 기준).

- [ ] **Step 1: DisclaimerBanner 구현**

Create `components/DisclaimerBanner.tsx`:
```tsx
export function DisclaimerBanner() {
  return (
    <div className="border-b border-status-cautionary bg-accent-orange-bg px-4 py-2 text-center text-sm text-status-cautionary">
      이 앱은 실제 의료 진단을 대체하지 않으며 학습·참고 목적입니다. 응급 증상이 있다면 즉시 119 또는 응급실을 방문하세요.
    </div>
  );
}
```

- [ ] **Step 2: UploadPanel 구현**

Create `components/UploadPanel.tsx`:
```tsx
'use client';

import { useState, type ChangeEvent } from 'react';

type UploadPanelProps = {
  onComplete: (transcript: string) => void;
};

export function UploadPanel({ onComplete }: UploadPanelProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('전사 요청이 실패했습니다.');
      const data = await response.json();
      onComplete(data.text);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">통화 녹음 파일 업로드</h2>
      <input
        type="file"
        accept="audio/*"
        disabled={status === 'uploading'}
        onChange={handleFileChange}
        className="text-sm"
      />
      {status === 'uploading' && <p className="text-sm text-label-alternative">전사 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">{errorMessage}</p>}
    </div>
  );
}
```

- [ ] **Step 3: InterviewChat 구현**

Create `components/InterviewChat.tsx`:
```tsx
'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import type { QueuedQuestion } from '@/lib/interview/mergeQuestions';

export type AnswerAttachment = { data: string; mediaType: string; filename?: string };

type InterviewChatProps = {
  currentQuestion: QueuedQuestion | null;
  onAnswer: (answerText: string, attachment?: AnswerAttachment) => Promise<void>;
};

export function InterviewChat({ currentQuestion, onAnswer }: InterviewChatProps) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<AnswerAttachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  if (!currentQuestion) {
    return <p className="text-sm text-label-alternative">모든 문진 질문에 답변했습니다.</p>;
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'answer.webm');
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (response.ok) {
        const data = await response.json();
        setText((prev) => (prev ? `${prev} ${data.text}` : data.text));
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setAttachment({ data: base64, mediaType: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!text.trim() && !attachment) return;
    setIsSubmitting(true);
    try {
      await onAnswer(text.trim(), attachment ?? undefined);
      setText('');
      setAttachment(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <div>
        <span className="text-xs font-medium text-primary-normal">
          {currentQuestion.askedBy.map((a) => a.specialtyName).join(', ')} 문진
        </span>
        <p className="mt-1 text-base font-medium">{currentQuestion.question}</p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="답변을 입력하세요"
        rows={3}
        className="rounded-8 border border-line-normal p-2 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm"
        >
          {isRecording ? '녹음 중지' : '음성으로 답변'}
        </button>

        <label className="cursor-pointer rounded-8 bg-fill-normal px-3 py-1.5 text-sm">
          사진/파일 첨부
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
        </label>

        {attachment && <span className="text-xs text-label-alternative">{attachment.filename} 첨부됨</span>}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || (!text.trim() && !attachment)}
        className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
      >
        답변 제출
      </button>
    </div>
  );
}
```

- [ ] **Step 4: SpecialistCard, SynthesisReport 구현**

Create `components/SpecialistCard.tsx`:
```tsx
import type { SpecialistOpinion } from '@/lib/ai/schemas';

export function SpecialistCard({ opinion }: { opinion: SpecialistOpinion }) {
  return (
    <div className="rounded-12 border border-line-normal bg-background-elevated p-4 shadow-sm">
      <h3 className="font-semibold">{opinion.specialtyName}</h3>
      <ul className="mt-2 space-y-2">
        {opinion.suspectedConditions.map((condition) => (
          <li key={condition.name} className="text-sm">
            <span className="font-medium">{condition.name}</span>
            <span className="ml-2 text-label-alternative">확신도 {Math.round(condition.confidence * 100)}%</span>
            <p className="text-label-neutral">{condition.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `components/SynthesisReport.tsx`:
```tsx
import type { SynthesisReport as SynthesisReportType } from '@/lib/ai/schemas';

export function SynthesisReport({ report }: { report: SynthesisReportType }) {
  return (
    <div className="rounded-16 border-2 border-primary-normal bg-accent-blue-bg p-6 shadow-md">
      <h2 className="text-lg font-semibold">종합 소견</h2>
      <p className="mt-2 text-sm">{report.overallImpression}</p>

      {report.redFlags.length > 0 && (
        <div className="mt-4 rounded-8 bg-accent-red-bg p-3 text-sm text-status-negative">
          <strong>주의 신호:</strong> {report.redFlags.join(', ')}
        </div>
      )}

      <h3 className="mt-4 text-sm font-semibold">가능성 높은 진단</h3>
      <ul className="mt-1 space-y-1">
        {report.topDifferentials.map((d) => (
          <li key={d.condition} className="text-sm">
            {d.condition} — {d.supportingSpecialties.join(', ')} (확신도 {Math.round(d.confidence * 100)}%)
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-semibold">권장 조치</h3>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {report.recommendedActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add components
git commit -m "feat: add UI components for upload, interview chat, and reports"
```

---

### Task 12: 메인 페이지 상태 흐름 조립 + E2E 수동 검증

**Files:**
- Modify: `app/layout.tsx` (DisclaimerBanner 삽입)
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: 모든 이전 태스크의 컴포넌트/타입/API 라우트.

구현 전에 `design.md`(레포 루트)를 먼저 읽고 그 컴포넌트 패턴을 따를 것.

- [ ] **Step 1: layout.tsx에 배너 삽입**

`app/layout.tsx`의 `<body>` 내부, `{children}` 바로 위에 `<DisclaimerBanner />`를 추가한다:
```tsx
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
// ...기존 import 유지

// body 내부:
// <body className={...}>
//   <DisclaimerBanner />
//   {children}
// </body>
```

- [ ] **Step 2: 메인 페이지 상태 흐름 구현**

Replace `app/page.tsx` with:
```tsx
'use client';

import { useState } from 'react';
import { UploadPanel } from '@/components/UploadPanel';
import { InterviewChat, type AnswerAttachment } from '@/components/InterviewChat';
import { SpecialistCard } from '@/components/SpecialistCard';
import { SynthesisReport } from '@/components/SynthesisReport';
import { mergeQuestions, type QueuedQuestion } from '@/lib/interview/mergeQuestions';
import type { SpecialistOpinion, SynthesisReport as SynthesisReportType } from '@/lib/ai/schemas';

type Stage = 'upload' | 'analyzing' | 'interview' | 'synthesizing' | 'report';

export default function Home() {
  const [stage, setStage] = useState<Stage>('upload');
  const [transcript, setTranscript] = useState('');
  const [opinions, setOpinions] = useState<SpecialistOpinion[]>([]);
  const [queue, setQueue] = useState<QueuedQuestion[]>([]);
  const [report, setReport] = useState<SynthesisReportType | null>(null);
  const [emergencyFlags, setEmergencyFlags] = useState<string[]>([]);

  async function handleTranscribed(text: string) {
    setTranscript(text);
    setStage('analyzing');

    const triageResponse = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text }),
    });
    const triageData = await triageResponse.json();
    setEmergencyFlags(triageData.emergency?.matchedFlags ?? []);

    const specialistsResponse = await fetch('/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: text,
        specialtyIds: triageData.specialties.map((s: { id: string }) => s.id),
      }),
    });
    const specialistsData = await specialistsResponse.json();
    const initialOpinions: SpecialistOpinion[] = specialistsData.opinions;
    const initialQueue = mergeQuestions(initialOpinions);

    setOpinions(initialOpinions);
    setQueue(initialQueue);

    if (initialQueue.length === 0) {
      await finishInterview(initialOpinions);
    } else {
      setStage('interview');
    }
  }

  async function handleAnswer(answerText: string, attachment?: AnswerAttachment) {
    const current = queue[0];
    if (!current) return;

    const specialtyId = current.askedBy[0].specialtyId;
    const priorOpinion = opinions.find((o) => o.specialtyId === specialtyId);
    if (!priorOpinion) return;

    const response = await fetch('/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specialtyId,
        transcript,
        priorOpinion,
        question: current.question,
        answerText,
        attachment,
      }),
    });
    const data = await response.json();

    if (data.emergency?.matchedFlags?.length) {
      setEmergencyFlags((prev) => Array.from(new Set([...prev, ...data.emergency.matchedFlags])));
    }

    const updatedOpinion: SpecialistOpinion = {
      ...data.opinion,
      specialtyId: priorOpinion.specialtyId,
      specialtyName: priorOpinion.specialtyName,
    };

    const updatedOpinions = opinions.map((o) => (o.specialtyId === specialtyId ? updatedOpinion : o));
    setOpinions(updatedOpinions);

    const remainingQueue = queue.slice(1);
    const freshQuestions = mergeQuestions([
      {
        specialtyId: updatedOpinion.specialtyId,
        specialtyName: updatedOpinion.specialtyName,
        followUpQuestions: updatedOpinion.followUpQuestions,
      },
    ]).filter((nq) => !remainingQueue.some((rq) => rq.question === nq.question));

    const nextQueue = [...remainingQueue, ...freshQuestions];
    setQueue(nextQueue);

    if (nextQueue.length === 0) {
      await finishInterview(updatedOpinions);
    }
  }

  async function finishInterview(finalOpinions: SpecialistOpinion[]) {
    setStage('synthesizing');
    const response = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opinions: finalOpinions }),
    });
    const data = await response.json();
    setReport(data.report);
    setStage('report');
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">다중 전문의 AI 문진</h1>

      {emergencyFlags.length > 0 && (
        <div className="rounded-12 bg-accent-red-bg p-4 text-sm font-medium text-status-negative">
          응급 신호가 감지되었습니다: {emergencyFlags.join(', ')}. 즉시 119 또는 응급실을 방문하세요.
        </div>
      )}

      {stage === 'upload' && <UploadPanel onComplete={handleTranscribed} />}
      {stage === 'analyzing' && <p className="text-sm text-label-alternative">전문의를 소집하는 중입니다...</p>}

      {stage === 'interview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <InterviewChat currentQuestion={queue[0] ?? null} onAnswer={handleAnswer} />
        </>
      )}

      {stage === 'synthesizing' && <p className="text-sm text-label-alternative">종합 소견을 작성하는 중입니다...</p>}

      {stage === 'report' && report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <SynthesisReport report={report} />
        </>
      )}
    </main>
  );
}
```

참고(프로토타입 범위 내 단순화): 여러 전문의가 유사한 질문을 물어 하나로 병합된 경우, 답변은 `askedBy` 배열의 첫 번째 전문의에게만 반영된다. 나머지 전문의의 소견은 최종 종합 단계에서 함께 취합되므로 정보가 완전히 유실되지는 않는다.

- [ ] **Step 3: 타입체크 및 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 전체 자동화 테스트 재실행**

Run: `npm run test`
Expected: Task 1~11에서 작성된 모든 테스트 PASS.

- [ ] **Step 5: 수동 E2E 검증**

1. `.env.local.example`을 `.env.local`로 복사하고 `AI_GATEWAY_API_KEY`를 실제 키로 채운다.
2. `npm run dev` 실행 후 브라우저로 `http://localhost:3000` 접속.
3. 페이지 상단에 의료 면책 배너가 보이는지 확인한다.
4. 짧은 한국어 음성 메모(예: "3일째 기침이 심하고 가슴이 답답해요")를 mp3/wav로 준비해 업로드하고, 전사 → 전문의 소집까지 정상 진행되는지 확인한다.
5. 문진 화면에서: (a) 텍스트로 답변, (b) "음성으로 답변" 버튼으로 마이크 녹음 후 텍스트가 채워지는지, (c) 이미지 파일을 첨부해 제출했을 때 에러 없이 진행되는지 각각 확인한다.
6. 모든 질문에 답한 뒤 종합 소견 화면이 표시되는지 확인한다.
7. 응급 키워드가 포함된 전사문(예: "가슴이 답답하고 숨을 못 쉬겠어요")으로 다시 시도해 상단에 응급 경고가 뜨는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: wire main page state machine for upload-to-synthesis flow"
```

---

## Self-Review 결과

- **스펙 커버리지:** 설계 문서의 6단계 파이프라인(전사→트리아지→전문의→통합문진→최종소견→종합)이 각각 Task 6/7/8/8/9에 매핑되고 Task 12에서 조립됨. 멀티모달 문진 입력(텍스트/음성/파일)은 Task 11의 `InterviewChat`에서 모두 구현됨. 면책 배너와 응급 감지는 Task 4, 11, 12에서 구현됨. 서버 미저장 원칙은 전체 설계에서 DB/파일 저장 코드가 전혀 없는 것으로 충족됨.
- **플레이스홀더 스캔:** 모든 스텝에 실행 가능한 실제 코드가 포함되어 있으며 "TODO"/"나중에 구현" 표현 없음.
- **타입 일관성:** `SpecialistOpinion`(Task 2) → `runSpecialistAnalysis`/`runSpecialistFollowUp`(Task 8) 반환 타입 → `mergeQuestions`(Task 5) 입력 타입 → `SpecialistCard`/`SynthesisReport`(Task 11) props → `app/page.tsx`(Task 12) 상태 타입까지 필드명(`specialtyId`, `specialtyName`, `suspectedConditions`, `followUpQuestions`)이 모든 태스크에서 동일하게 사용됨을 확인함.
