# 진입 화면 재구성 및 기본정보 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무계정 게스트 모드를 제거하고 "손님입장(로그인)/회원가입" 2버튼 온보딩으로 바꾸며, 회원가입 직후
전화번호와 함께 연령대·성별·직업을 수집해 트리아지/전문의 1차 분석 AI 프롬프트에 반영하고, 앱 이름을
"홈 닥터"로 바꾼다.

**Architecture:** 새 DB 테이블 없이 기존 Clerk `unsafeMetadata` 저장 패턴을 재사용한다. 프로필 상수
(`lib/profile/constants.ts`)는 클라이언트 컴포넌트와 서버 양쪽에서 공유하고, AI 프롬프트용 순수 포맷팅
함수(`lib/agents/patientProfile.ts`)와 Clerk 세션 조회 함수(`lib/server/auth/patientProfile.ts`)를
분리해 `components/**`가 `lib/server/**`를 직접 import하지 못하게 막는 기존 ESLint 규칙을 그대로
지킨다. `runTriage`/`runSpecialistAnalysis`에 선택적 `profile` 매개변수를 추가하고, 해당 API 라우트가
클라이언트 입력이 아니라 서버에서 직접 Clerk 세션을 조회해 채운다.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Vercel AI SDK `ai@7`, Clerk(`@clerk/nextjs`),
Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-onboarding-profile-design.md` (및 이 문서가 부분적으로
대체하는 `docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`)

## Global Constraints

- `ai@7`의 `generateObject`/`generateText`는 시스템 프롬프트 파라미터로 `instructions`를 쓴다(`system`
  deprecated) — 이 플랜은 기존 호출부만 수정하므로 이미 지켜지고 있다.
- UI 문구와 에이전트 프롬프트는 모두 한국어(존댓말)로 작성한다.
- 트리아지·전문의 분석처럼 세션당 여러 번 호출되는 구간은 `FAST_TEXT_MODEL`을 쓴다(`runSynthesis`만
  `TEXT_MODEL`) — 이 플랜은 모델 선택을 바꾸지 않는다.
- `components/**`는 `lib/server/**`를 값으로 import할 수 없다(ESLint로 강제, 타입 import는 허용).
  프로필 상수/포맷팅 함수는 이 경계를 지키도록 `lib/profile/`, `lib/agents/`에 두고, Clerk 세션 조회는
  `lib/server/auth/`에만 둔다.
- 원본 오디오/이미지 파일은 저장하지 않는다 — 이 플랜은 저장 로직 자체를 바꾸지 않는다.
- 서버는 클라이언트가 보낸 역할/프로필 claim을 신뢰하지 않는다 — 환자 기본정보는 항상 서버가 Clerk
  세션에서 직접 조회한다.

---

## Task 1: 프로필 선택지 상수 (`lib/profile/constants.ts`)

**Files:**
- Create: `lib/profile/constants.ts`
- Test: `tests/lib/profile/constants.test.ts`

**Interfaces:**
- Produces:
  - `AGE_BANDS: readonly string[]` (18개, `'10세 미만'` ~ `'90세 이상'`)
  - `type Gender = 'male' | 'female' | 'unspecified'`
  - `GENDER_OPTIONS: ReadonlyArray<{ value: Gender; label: string }>` (3개)
  - `OCCUPATIONS: readonly string[]` (7개, `'농업'` 포함)

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/profile/constants.test.ts
import { describe, it, expect } from 'vitest';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS } from '@/lib/profile/constants';

describe('AGE_BANDS', () => {
  it('has 18 five-year bands from under 10 to 90+', () => {
    expect(AGE_BANDS).toHaveLength(18);
    expect(AGE_BANDS[0]).toBe('10세 미만');
    expect(AGE_BANDS.at(-1)).toBe('90세 이상');
    expect(AGE_BANDS).toContain('60~64세');
  });
});

describe('GENDER_OPTIONS', () => {
  it('offers male, female, and unspecified', () => {
    expect(GENDER_OPTIONS).toHaveLength(3);
    expect(GENDER_OPTIONS.map((g) => g.value)).toEqual(['male', 'female', 'unspecified']);
    expect(GENDER_OPTIONS.find((g) => g.value === 'male')?.label).toBe('남성');
  });
});

describe('OCCUPATIONS', () => {
  it('includes farming as a fixed category', () => {
    expect(OCCUPATIONS).toHaveLength(7);
    expect(OCCUPATIONS).toContain('농업');
    expect(OCCUPATIONS).toContain('기타');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/profile/constants.test.ts`
Expected: FAIL with "Cannot find module '@/lib/profile/constants'"

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/profile/constants.ts
export const AGE_BANDS = [
  '10세 미만',
  '10~14세',
  '15~19세',
  '20~24세',
  '25~29세',
  '30~34세',
  '35~39세',
  '40~44세',
  '45~49세',
  '50~54세',
  '55~59세',
  '60~64세',
  '65~69세',
  '70~74세',
  '75~79세',
  '80~84세',
  '85~89세',
  '90세 이상',
] as const;

export type Gender = 'male' | 'female' | 'unspecified';

export const GENDER_OPTIONS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'unspecified', label: '응답 안 함' },
];

export const OCCUPATIONS = [
  '농업',
  '자영업',
  '회사원/직장인',
  '주부',
  '학생',
  '무직/은퇴',
  '기타',
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/profile/constants.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/profile/constants.ts tests/lib/profile/constants.test.ts
git commit -m "feat: add shared age band/gender/occupation constants"
```

---

## Task 2: 환자 기본정보 AI 프롬프트 포맷팅 (`lib/agents/patientProfile.ts`)

**Files:**
- Create: `lib/agents/patientProfile.ts`
- Test: `tests/agents/patientProfile.test.ts`

**Interfaces:**
- Consumes: `Gender`, `GENDER_OPTIONS` from `@/lib/profile/constants` (Task 1)
- Produces:
  - `type PatientProfile = { ageBand: string; gender: Gender | ''; occupation: string }`
  - `formatPatientProfileLine(profile: PatientProfile | null): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/patientProfile.test.ts
import { describe, it, expect } from 'vitest';
import { formatPatientProfileLine, type PatientProfile } from '@/lib/agents/patientProfile';

describe('formatPatientProfileLine', () => {
  it('returns empty string for null profile', () => {
    expect(formatPatientProfileLine(null)).toBe('');
  });

  it('returns empty string when every field is empty', () => {
    const profile: PatientProfile = { ageBand: '', gender: '', occupation: '' };
    expect(formatPatientProfileLine(profile)).toBe('');
  });

  it('includes all three fields with Korean gender label when fully filled', () => {
    const profile: PatientProfile = { ageBand: '60~64세', gender: 'male', occupation: '농업' };
    const line = formatPatientProfileLine(profile);
    expect(line).toContain('연령대 60~64세');
    expect(line).toContain('성별 남성');
    expect(line).toContain('직업 농업');
  });

  it('includes only the fields that are present', () => {
    const profile: PatientProfile = { ageBand: '30~34세', gender: '', occupation: '' };
    const line = formatPatientProfileLine(profile);
    expect(line).toContain('연령대 30~34세');
    expect(line).not.toContain('성별');
    expect(line).not.toContain('직업');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agents/patientProfile.test.ts`
Expected: FAIL with "Cannot find module '@/lib/agents/patientProfile'"

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/agents/patientProfile.ts
import { GENDER_OPTIONS, type Gender } from '../profile/constants';

export type PatientProfile = {
  ageBand: string;
  gender: Gender | '';
  occupation: string;
};

function genderLabel(gender: Gender | ''): string {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? '';
}

export function formatPatientProfileLine(profile: PatientProfile | null): string {
  if (!profile) return '';

  const parts: string[] = [];
  if (profile.ageBand) parts.push(`연령대 ${profile.ageBand}`);
  const label = genderLabel(profile.gender);
  if (label) parts.push(`성별 ${label}`);
  if (profile.occupation) parts.push(`직업 ${profile.occupation}`);

  if (parts.length === 0) return '';
  return `환자 기본정보: ${parts.join(', ')}\n\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agents/patientProfile.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/agents/patientProfile.ts tests/agents/patientProfile.test.ts
git commit -m "feat: format patient profile as a prompt line for AI agents"
```

---

## Task 3: Clerk 세션에서 환자 프로필 조회 (`lib/server/auth/patientProfile.ts`)

**Files:**
- Create: `lib/server/auth/patientProfile.ts`
- Test: `tests/lib/server/auth/patientProfile.test.ts`

**Interfaces:**
- Consumes: `PatientProfile` type from `@/lib/agents/patientProfile` (Task 2), `currentUser` from
  `@clerk/nextjs/server`
- Produces:
  - `getPatientProfile(): Promise<PatientProfile | null>`
  - `isProfileComplete(user: { unsafeMetadata?: unknown } | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/server/auth/patientProfile.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentUserMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: () => currentUserMock(),
}));

import { getPatientProfile, isProfileComplete } from '@/lib/server/auth/patientProfile';

describe('getPatientProfile', () => {
  beforeEach(() => {
    currentUserMock.mockReset();
  });

  it('returns null when there is no signed-in user', async () => {
    currentUserMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
  });

  it('reads ageBand/gender/occupation from unsafeMetadata', async () => {
    currentUserMock.mockResolvedValue({
      unsafeMetadata: { ageBand: '60~64세', gender: 'male', occupation: '농업' },
    });
    expect(await getPatientProfile()).toEqual({ ageBand: '60~64세', gender: 'male', occupation: '농업' });
  });

  it('falls back to empty values when a field is missing or an invalid gender', async () => {
    currentUserMock.mockResolvedValue({ unsafeMetadata: { gender: 'not-a-real-gender' } });
    expect(await getPatientProfile()).toEqual({ ageBand: '', gender: '', occupation: '' });
  });
});

describe('isProfileComplete', () => {
  it('is false for a null user', () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it('is false when any required field is missing', () => {
    expect(
      isProfileComplete({ unsafeMetadata: { phoneNumber: '010-1234-5678', ageBand: '30~34세', gender: 'male' } }),
    ).toBe(false);
  });

  it('is true when phoneNumber/ageBand/occupation are non-empty and gender is a valid choice', () => {
    expect(
      isProfileComplete({
        unsafeMetadata: {
          phoneNumber: '010-1234-5678',
          ageBand: '30~34세',
          gender: 'unspecified',
          occupation: '회사원/직장인',
        },
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/server/auth/patientProfile.test.ts`
Expected: FAIL with "Cannot find module '@/lib/server/auth/patientProfile'"

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/server/auth/patientProfile.ts
import { currentUser } from '@clerk/nextjs/server';
import type { PatientProfile } from '../../agents/patientProfile';
import type { Gender } from '../../profile/constants';

const VALID_GENDERS: readonly string[] = ['male', 'female', 'unspecified'];

function readMetadata(unsafeMetadata: unknown): Record<string, unknown> {
  return (unsafeMetadata ?? {}) as Record<string, unknown>;
}

function readGender(metadata: Record<string, unknown>): Gender | '' {
  const raw = metadata.gender;
  return typeof raw === 'string' && VALID_GENDERS.includes(raw) ? (raw as Gender) : '';
}

export async function getPatientProfile(): Promise<PatientProfile | null> {
  const user = await currentUser();
  if (!user) return null;

  const metadata = readMetadata(user.unsafeMetadata);
  return {
    ageBand: typeof metadata.ageBand === 'string' ? metadata.ageBand : '',
    gender: readGender(metadata),
    occupation: typeof metadata.occupation === 'string' ? metadata.occupation : '',
  };
}

export function isProfileComplete(user: { unsafeMetadata?: unknown } | null | undefined): boolean {
  if (!user) return false;
  const metadata = readMetadata(user.unsafeMetadata);

  const phoneNumber = typeof metadata.phoneNumber === 'string' ? metadata.phoneNumber.trim() : '';
  const ageBand = typeof metadata.ageBand === 'string' ? metadata.ageBand.trim() : '';
  const occupation = typeof metadata.occupation === 'string' ? metadata.occupation.trim() : '';
  const gender = readGender(metadata);

  return phoneNumber.length > 0 && ageBand.length > 0 && occupation.length > 0 && gender !== '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/server/auth/patientProfile.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/server/auth/patientProfile.ts tests/lib/server/auth/patientProfile.test.ts
git commit -m "feat: derive patient profile and profile-completeness from Clerk session"
```

---

## Task 4: `runTriage`에 환자 프로필 전달

**Files:**
- Modify: `lib/agents/triage.ts`
- Test: `tests/agents/triage.test.ts`

**Interfaces:**
- Consumes: `PatientProfile`, `formatPatientProfileLine` from `@/lib/agents/patientProfile` (Task 2)
- Produces: `runTriage(transcript: string, profile?: PatientProfile | null): Promise<TriageResult>` (기존
  1-인자 호출부와 호환되도록 `profile`은 선택 매개변수, 기본값 `null`)

- [ ] **Step 1: Write the failing test**

`tests/agents/triage.test.ts` 전체를 다음으로 교체한다 (기존 테스트를 유지하면서 프롬프트 검사를
추가하기 위해 `generateObject` 목을 `vi.hoisted`로 캡처하도록 바꾼다):

```ts
// tests/agents/triage.test.ts
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(async () => ({
    object: {
      specialties: [
        { id: 'pulmonology', reason: '기침과 호흡곤란 언급' },
        { id: 'cardiology', reason: '가슴 답답함 언급' },
      ],
    },
  })),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: mockGenerateObject };
});

import { runTriage, triageResultSchema } from '@/lib/agents/triage';

describe('runTriage', () => {
  it('returns the specialties chosen by the model', async () => {
    const result = await runTriage('기침이 심하고 가슴이 답답해요.');
    expect(result.specialties).toHaveLength(2);
    expect(result.specialties[0].id).toBe('pulmonology');
  });

  it('works without a patient profile (backward compatible)', async () => {
    mockGenerateObject.mockClear();
    await runTriage('기침이 심하고 가슴이 답답해요.');
    const call = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).not.toContain('환자 기본정보');
  });

  it('includes the patient profile line in the prompt when provided', async () => {
    mockGenerateObject.mockClear();
    await runTriage('기침이 심하고 가슴이 답답해요.', { ageBand: '60~64세', gender: 'male', occupation: '농업' });
    const call = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('환자 기본정보: 연령대 60~64세, 성별 남성, 직업 농업');
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agents/triage.test.ts`
Expected: FAIL on the new "includes the patient profile line" test — `runTriage` doesn't accept a second
argument yet, and the prompt never contains `환자 기본정보`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/agents/triage.ts
import { generateObject } from 'ai';
import { z } from 'zod';
import { FAST_TEXT_MODEL } from '../ai/models';
import { SPECIALTY_CATALOG } from './specialties';
import { formatPatientProfileLine, type PatientProfile } from './patientProfile';

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

export async function runTriage(
  transcript: string,
  profile: PatientProfile | null = null,
): Promise<TriageResult> {
  const catalogList = SPECIALTY_CATALOG.map((s) => `- ${s.id}: ${s.name}`).join('\n');
  const profileLine = formatPatientProfileLine(profile);

  const { object } = await generateObject({
    model: FAST_TEXT_MODEL,
    instructions:
      '당신은 병원 접수 트리아지 담당자입니다. 아래 환자 상담 내용을 읽고, 증상과 가장 관련 있는 전문 분야를 정확히 2~4개 선택하세요. 반드시 주어진 목록의 id만 사용하세요.\n\n전문분야 목록:\n' +
      catalogList,
    schema: triageResultSchema,
    prompt: `${profileLine}환자 상담 내용:\n"""\n${transcript}\n"""`,
  });

  return object;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agents/triage.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/agents/triage.ts tests/agents/triage.test.ts
git commit -m "feat: pass patient profile into triage prompt"
```

---

## Task 5: `runSpecialistAnalysis`에 환자 프로필 전달

**Files:**
- Modify: `lib/agents/specialist.ts:6-23`
- Test: `tests/agents/specialist.test.ts`

**Interfaces:**
- Consumes: `PatientProfile`, `formatPatientProfileLine` from `@/lib/agents/patientProfile` (Task 2)
- Produces: `runSpecialistAnalysis(specialtyId: string, transcript: string, profile?: PatientProfile | null): Promise<SpecialistOpinion>`
  (`runSpecialistFollowUp`는 변경하지 않음 — 스펙 §5 근거)

- [ ] **Step 1: Write the failing test**

`tests/agents/specialist.test.ts`의 `describe('runSpecialistAnalysis', ...)` 블록에 아래 두 테스트를
추가한다 (파일 상단의 `mockGenerateObject` 설정은 그대로 유지):

```ts
  it('works without a patient profile (backward compatible)', async () => {
    mockGenerateObject.mockClear();
    await runSpecialistAnalysis('pulmonology', '기침이 오래갑니다.');
    const call = mockGenerateObject.mock.calls[0][0] as GenerateObjectCallArgs;
    expect(call.prompt as string).not.toContain('환자 기본정보');
  });

  it('includes the patient profile line in the prompt when provided', async () => {
    mockGenerateObject.mockClear();
    await runSpecialistAnalysis('pulmonology', '기침이 오래갑니다.', {
      ageBand: '60~64세',
      gender: 'male',
      occupation: '농업',
    });
    const call = mockGenerateObject.mock.calls[0][0] as GenerateObjectCallArgs;
    expect(call.prompt as string).toContain('환자 기본정보: 연령대 60~64세, 성별 남성, 직업 농업');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agents/specialist.test.ts`
Expected: FAIL on the new "includes the patient profile line" test — `runSpecialistAnalysis` doesn't
accept a third argument yet.

- [ ] **Step 3: Write minimal implementation**

`lib/agents/specialist.ts`의 `runSpecialistAnalysis`만 수정한다 (아래는 파일 상단 import와 함수
전체 — `runSpecialistFollowUp`와 그 이후는 그대로 둔다):

```ts
import { generateObject } from 'ai';
import { FAST_TEXT_MODEL } from '../ai/models';
import { getSpecialtyById } from './specialties';
import { specialistFindingsSchema, type SpecialistOpinion } from '../ai/schemas';
import { formatPatientProfileLine, type PatientProfile } from './patientProfile';

export async function runSpecialistAnalysis(
  specialtyId: string,
  transcript: string,
  profile: PatientProfile | null = null,
): Promise<SpecialistOpinion> {
  const specialty = getSpecialtyById(specialtyId);
  if (!specialty) {
    throw new Error(`Unknown specialty id: ${specialtyId}`);
  }

  const profileLine = formatPatientProfileLine(profile);

  const { object } = await generateObject({
    model: FAST_TEXT_MODEL,
    instructions: specialty.systemPrompt,
    schema: specialistFindingsSchema,
    prompt: `${profileLine}다음은 환자와의 상담 내용(통화 녹음 전사문 또는 첨부 문서에서 추출한 내용)입니다. 이 내용을 바탕으로 ${specialty.name} 관점에서 1차 소견을 작성하세요.\n\n상담 내용:\n"""\n${transcript}\n"""\n\nfollowUpQuestions의 각 질문에는 반드시 환자가 탭 한 번으로 고를 수 있는 답변 선택지(options)를 2~5개 함께 제시하세요. 질문, 선택지, 이유는 예외 없이 한국어로만 작성하고 영어를 섞지 마세요.`,
  });

  return { ...object, specialtyId: specialty.id, specialtyName: specialty.name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agents/specialist.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/agents/specialist.ts tests/agents/specialist.test.ts
git commit -m "feat: pass patient profile into specialist analysis prompt"
```

---

## Task 6: `/api/triage`가 서버에서 환자 프로필을 조회해 전달

**Files:**
- Modify: `app/api/triage/route.ts`
- Test: `tests/api/triage.test.ts`
- Test: `tests/api/chain.test.ts`

**Interfaces:**
- Consumes: `getPatientProfile` from `@/lib/server/auth/patientProfile` (Task 3), `runTriage(transcript, profile)` (Task 4)

- [ ] **Step 1: Write the failing test**

`tests/api/triage.test.ts`를 다음으로 교체한다:

```ts
// tests/api/triage.test.ts
import { describe, it, expect, vi } from 'vitest';

const runTriageMock = vi.fn(async () => ({ specialties: [{ id: 'pulmonology', reason: '기침 언급' }] }));
const getPatientProfileMock = vi.fn(async () => null);

vi.mock('@/lib/agents/triage', () => ({
  runTriage: (transcript: string, profile: unknown) => runTriageMock(transcript, profile),
}));
vi.mock('@/lib/server/auth/patientProfile', () => ({
  getPatientProfile: () => getPatientProfileMock(),
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
    expect(data.specialties[0].name).toBe('호흡기내과');
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

  it('fetches the patient profile from the server session and forwards it to runTriage', async () => {
    runTriageMock.mockClear();
    getPatientProfileMock.mockResolvedValueOnce({ ageBand: '60~64세', gender: 'male', occupation: '농업' });

    const request = new Request('http://localhost/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '기침이 심해요.' }),
    });
    await POST(request);

    expect(runTriageMock).toHaveBeenCalledWith('기침이 심해요.', {
      ageBand: '60~64세',
      gender: 'male',
      occupation: '농업',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/triage.test.ts`
Expected: FAIL — `@/lib/server/auth/patientProfile` mock is unused because the route doesn't import it
yet, so `getPatientProfileMock`/the forwarded-profile assertion fails.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/triage/route.ts
import { runTriage } from '@/lib/agents/triage';
import { checkEmergency } from '@/lib/safety/emergencyCheck';
import { getSpecialtyById } from '@/lib/agents/specialties';
import { getPatientProfile } from '@/lib/server/auth/patientProfile';

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';

  if (!transcript.trim()) {
    return Response.json({ error: 'transcript가 필요합니다.' }, { status: 400 });
  }

  const emergency = checkEmergency(transcript);
  const profile = await getPatientProfile();
  const triage = await runTriage(transcript, profile);
  const specialties = triage.specialties.map((s) => ({
    ...s,
    name: getSpecialtyById(s.id)?.name ?? s.id,
  }));

  return Response.json({ specialties, emergency });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/triage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update the cross-stage chain test so it still passes**

`tests/api/chain.test.ts`는 `app/api/triage/route.ts`와 `app/api/specialists/route.ts`의 실제 구현을
그대로 호출하므로, 이제 두 라우트가 (Task 7에서) 호출할 `getPatientProfile`을 함께 모킹해둔다. 파일
상단, 기존 `vi.mock('ai', ...)` 블록 바로 아래에 추가한다:

```ts
vi.mock('@/lib/server/auth/patientProfile', () => ({
  getPatientProfile: vi.fn(async () => null),
}));
```

- [ ] **Step 6: Run the full suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: PASS (all test files, including `tests/api/chain.test.ts`)

- [ ] **Step 7: Commit**

```bash
git add app/api/triage/route.ts tests/api/triage.test.ts tests/api/chain.test.ts
git commit -m "feat: fetch patient profile server-side for the triage route"
```

---

## Task 7: `/api/specialists`가 서버에서 환자 프로필을 조회해 전달

**Files:**
- Modify: `app/api/specialists/route.ts`
- Test: `tests/api/specialists.test.ts`

**Interfaces:**
- Consumes: `getPatientProfile` from `@/lib/server/auth/patientProfile` (Task 3),
  `runSpecialistAnalysis(specialtyId, transcript, profile)` (Task 5). `tests/api/chain.test.ts`의
  `@/lib/server/auth/patientProfile` 목은 Task 6에서 이미 추가되어 그대로 재사용된다.

- [ ] **Step 1: Write the failing test**

`tests/api/specialists.test.ts`를 다음으로 교체한다:

```ts
// tests/api/specialists.test.ts
import { describe, it, expect, vi } from 'vitest';

const runSpecialistAnalysisMock = vi.fn(async (specialtyId: string) => ({
  specialtyId,
  specialtyName: specialtyId === 'pulmonology' ? '호흡기내과' : '심장내과',
  suspectedConditions: [],
  followUpQuestions: [],
}));
const getPatientProfileMock = vi.fn(async () => null);

vi.mock('@/lib/agents/specialist', () => ({
  runSpecialistAnalysis: (specialtyId: string, transcript: string, profile: unknown) =>
    runSpecialistAnalysisMock(specialtyId, transcript, profile),
}));
vi.mock('@/lib/server/auth/patientProfile', () => ({
  getPatientProfile: () => getPatientProfileMock(),
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

  it('fetches the patient profile once and forwards it to every specialty call', async () => {
    runSpecialistAnalysisMock.mockClear();
    getPatientProfileMock.mockResolvedValueOnce({ ageBand: '30~34세', gender: 'female', occupation: '학생' });

    const request = new Request('http://localhost/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '증상 설명', specialtyIds: ['pulmonology', 'cardiology'] }),
    });
    await POST(request);

    const profile = { ageBand: '30~34세', gender: 'female', occupation: '학생' };
    expect(runSpecialistAnalysisMock).toHaveBeenCalledWith('pulmonology', '증상 설명', profile);
    expect(runSpecialistAnalysisMock).toHaveBeenCalledWith('cardiology', '증상 설명', profile);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/specialists.test.ts`
Expected: FAIL on the new "fetches the patient profile" test — the route doesn't call
`getPatientProfile`/forward a profile yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/specialists/route.ts
import { runSpecialistAnalysis } from '@/lib/agents/specialist';
import { getPatientProfile } from '@/lib/server/auth/patientProfile';

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const transcript: string = typeof body.transcript === 'string' ? body.transcript : '';
  const specialtyIds: string[] = Array.isArray(body.specialtyIds) ? body.specialtyIds : [];

  if (!transcript.trim() || specialtyIds.length === 0) {
    return Response.json({ error: 'transcript와 specialtyIds가 필요합니다.' }, { status: 400 });
  }

  const profile = await getPatientProfile();
  const opinions = await Promise.all(
    specialtyIds.map((id) => runSpecialistAnalysis(id, transcript, profile)),
  );

  return Response.json({ opinions });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/specialists.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite to confirm the chain test still passes**

Run: `npx vitest run`
Expected: PASS (all test files)

- [ ] **Step 6: Commit**

```bash
git add app/api/specialists/route.ts tests/api/specialists.test.ts
git commit -m "feat: fetch patient profile server-side for the specialists route"
```

---

## Task 8: 게스트가 쓰던 AI API 라우트를 보호 라우트로 전환 (`proxy.ts`)

**Files:**
- Modify: `proxy.ts`
- Test: `tests/proxy.test.ts`

**Interfaces:**
- Produces: `PROTECTED_ROUTE_PATTERNS: string[]` (named export, 테스트에서 검증할 수 있도록 노출)

- [ ] **Step 1: Write the failing test**

```ts
// tests/proxy.test.ts
import { describe, it, expect } from 'vitest';
import { PROTECTED_ROUTE_PATTERNS } from '@/proxy';

describe('PROTECTED_ROUTE_PATTERNS', () => {
  it('keeps protecting the existing member/manager/admin routes', () => {
    expect(PROTECTED_ROUTE_PATTERNS).toEqual(
      expect.arrayContaining([
        '/dashboard(.*)',
        '/admin(.*)',
        '/complete-profile(.*)',
        '/api/records(.*)',
        '/api/dashboard(.*)',
        '/api/admin(.*)',
      ]),
    );
  });

  it('now protects the AI interview API routes that used to allow anonymous guests', () => {
    expect(PROTECTED_ROUTE_PATTERNS).toEqual(
      expect.arrayContaining([
        '/api/triage(.*)',
        '/api/specialists(.*)',
        '/api/interview(.*)',
        '/api/synthesize(.*)',
        '/api/transcribe(.*)',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proxy.test.ts`
Expected: FAIL — `PROTECTED_ROUTE_PATTERNS` isn't exported from `proxy.ts` yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

export const PROTECTED_ROUTE_PATTERNS = [
  '/dashboard(.*)',
  '/admin(.*)',
  '/complete-profile(.*)',
  '/api/records(.*)',
  '/api/dashboard(.*)',
  '/api/admin(.*)',
  // Guest mode no longer exists (see docs/superpowers/specs/2026-09-12-onboarding-profile-design.md
  // §2) — these AI interview routes used to allow anonymous calls on purpose; now every caller
  // must be signed in.
  '/api/triage(.*)',
  '/api/specialists(.*)',
  '/api/interview(.*)',
  '/api/synthesize(.*)',
  '/api/transcribe(.*)',
];

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTE_PATTERNS);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proxy.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add proxy.ts tests/proxy.test.ts
git commit -m "feat: protect AI interview API routes now that guest mode is gone"
```

---

## Task 9: 게스트 모드 완전 제거 (온보딩 2버튼화)

**Files:**
- Modify: `components/WelcomeScreen.tsx` (전체 교체)
- Modify: `components/InterviewApp.tsx:31-33,45,235-237`
- Modify: `app/page.tsx` (전체 교체)
- Delete: `app/guest/page.tsx`

**Interfaces:**
- Consumes: `isProfileComplete` from `@/lib/server/auth/patientProfile` (Task 3)
- Produces: `InterviewApp`는 더 이상 props를 받지 않는다 (`export function InterviewApp()`)

이 작업이 건드리는 화면/라우팅 코드는 이 저장소에서 컴포넌트 단위 테스트 대상이 아니다(기존
`tests/`에도 `WelcomeScreen`/`InterviewApp`/`app/page.tsx` 테스트가 없다 — Vitest 환경이
`environment: 'node'`이고 React Testing Library도 설치되어 있지 않다). 기존 패턴을 따라 타입 체크 +
전체 테스트 스위트 + 수동 확인으로 검증한다.

- [ ] **Step 1: `WelcomeScreen`을 2버튼으로 교체**

```tsx
// components/WelcomeScreen.tsx
import Link from 'next/link';

export function WelcomeScreen() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">홈 닥터</h1>
      <p className="text-sm text-label-alternative">
        로그인하면 문진 결과가 저장되어 나중에 다시 확인할 수 있습니다.
      </p>

      <div className="flex flex-col gap-3">
        <Link
          href="/sign-in"
          className="rounded-full bg-primary-normal px-4 py-2 text-center text-sm font-medium text-static-white"
        >
          손님입장
        </Link>
        <Link
          href="/sign-up"
          className="rounded-8 border border-line-normal px-4 py-2 text-center text-sm font-medium"
        >
          회원가입
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `InterviewApp`에서 `mode` prop 제거**

`components/InterviewApp.tsx:31-33`의 타입 선언을 삭제한다:

```ts
// 삭제:
type InterviewAppProps = {
  mode: 'member' | 'guest';
};
```

`components/InterviewApp.tsx:45`를 다음으로 바꾼다:

```ts
export function InterviewApp() {
```

`components/InterviewApp.tsx:235-237`을 다음으로 바꾼다(게스트가 없으므로 항상 저장):

```ts
      await saveRecord(finalOpinions, data.report);
```

- [ ] **Step 3: `app/page.tsx`를 `isProfileComplete` 기준으로 교체**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { getViewer } from '@/lib/server/auth/authorize';
import { isProfileComplete } from '@/lib/server/auth/patientProfile';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { InterviewApp } from '@/components/InterviewApp';

export default async function Home() {
  const viewer = await getViewer();

  if (viewer.role === 'guest') {
    return <WelcomeScreen />;
  }

  // Login uses email, not phone (Clerk's phone identifier is a paid-plan feature — see
  // Global Constraints). Phone number, age band, gender, and occupation are collected
  // separately into unsafeMetadata right after signup, so every signed-in viewer must have
  // all four before reaching the app itself.
  const user = await currentUser();
  if (!isProfileComplete(user)) {
    redirect('/complete-profile');
  }

  if (viewer.role === 'manager') {
    redirect('/dashboard');
  }
  if (viewer.role === 'admin') {
    redirect('/admin');
  }

  return <InterviewApp />;
}
```

- [ ] **Step 4: 게스트 라우트 삭제**

```bash
rm app/guest/page.tsx
rmdir app/guest
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (특히 `InterviewApp` 호출부에 남은 `mode` prop이 없는지 확인)

- [ ] **Step 6: 전체 테스트 스위트 실행**

Run: `npx vitest run`
Expected: PASS (all test files) — 이 작업으로 새로 깨지는 테스트가 없어야 한다.

- [ ] **Step 7: 수동 확인 (개발 서버)**

```bash
npm run dev &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/guest
```

Expected: `404` (게스트 라우트가 사라졌는지 확인). 브라우저로 `http://localhost:3000`을 열어 "손님입장"
버튼이 `/sign-in`으로, "회원가입" 버튼이 `/sign-up`으로 이동하는지, 그리고 무계정으로 계속 진행할 수
있는 버튼이 더 이상 없는지 확인한다.

- [ ] **Step 8: Commit**

```bash
git add components/WelcomeScreen.tsx components/InterviewApp.tsx app/page.tsx
git rm app/guest/page.tsx
git commit -m "feat: remove anonymous guest mode, onboard via sign-in/sign-up only"
```

---

## Task 10: 회원가입 직후 연령대·성별·직업 수집 (`CompleteProfileForm`)

**Files:**
- Modify: `components/CompleteProfileForm.tsx` (전체 교체)

**Interfaces:**
- Consumes: `AGE_BANDS`, `GENDER_OPTIONS`, `OCCUPATIONS`, `Gender` from `@/lib/profile/constants` (Task 1)

Task 9와 같은 이유로 이 컴포넌트도 자동 테스트 대상이 아니다 — 타입 체크 + 수동 확인으로 검증한다.

- [ ] **Step 1: `CompleteProfileForm`을 4필드 폼으로 교체**

```tsx
// components/CompleteProfileForm.tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '@/lib/profile/constants';

export function CompleteProfileForm() {
  const { user } = useUser();
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, phoneNumber, ageBand, gender, occupation },
      });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">기본 정보 입력</h1>
      <p className="text-sm text-label-alternative">
        문진에 활용할 기본 정보를 입력해주세요. 로그인에는 사용되지 않습니다.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          전화번호
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="010-1234-5678"
            required
            className="rounded-8 border border-line-normal p-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          연령대
          <select
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value)}
            required
            className="rounded-8 border border-line-normal p-2 text-sm"
          >
            <option value="" disabled>
              선택해주세요
            </option>
            {AGE_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          성별
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            required
            className="rounded-8 border border-line-normal p-2 text-sm"
          >
            <option value="" disabled>
              선택해주세요
            </option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          직업
          <select
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            required
            className="rounded-8 border border-line-normal p-2 text-sm"
          >
            <option value="" disabled>
              선택해주세요
            </option>
            {OCCUPATIONS.map((job) => (
              <option key={job} value={job}>
                {job}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
        >
          저장
        </button>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 스위트 실행**

Run: `npx vitest run`
Expected: PASS (all test files)

- [ ] **Step 4: 수동 확인 (개발 서버)**

`npm run dev`로 서버를 띄우고 브라우저에서 회원가입 → `/complete-profile` 화면에 전화번호/연령대
드롭다운(18개)/성별 드롭다운(3개)/직업 드롭다운(7개)이 모두 보이는지, 네 필드를 모두 채워야 "저장"
후 `/`로 돌아가는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add components/CompleteProfileForm.tsx
git commit -m "feat: collect age band, gender, and occupation on the profile screen"
```

---

## Task 11: 앱 이름을 "홈 닥터"로 변경

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/manifest.ts`
- Modify: `components/InterviewApp.tsx:264`
- Modify: `README.md:1`
- Modify: `CLAUDE.md:5`

날짜가 박힌 `docs/superpowers/specs/2026-08-28-*`, `docs/superpowers/plans/2026-08-28-*`,
`docs/superpowers/plans/2026-09-11-*` 문서 본문은 그 시점의 기록이므로 수정하지 않는다(스펙 §2 참고).

- [ ] **Step 1: `app/layout.tsx`의 메타데이터 제목 변경**

`metadata.title`과 `appleWebApp.title`을 바꾼다:

```ts
export const metadata: Metadata = {
  title: "홈 닥터",
  description: "통화 녹음, 처방전 등 이미지·PDF 파일을 분석하고 여러 전문의 AI 에이전트가 문진해 종합 소견을 제공하는 개인용 프로토타입입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "홈 닥터",
  },
};
```

- [ ] **Step 2: `app/manifest.ts`의 PWA 이름 변경**

```ts
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '홈 닥터',
    short_name: '홈 닥터',
    description:
      '통화 녹음, 처방전 등 이미지·PDF 파일을 분석하고 여러 전문의 AI 에이전트가 문진해 종합 소견을 제공하는 개인용 프로토타입입니다.',
    lang: 'ko',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#0066FF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 3: `components/InterviewApp.tsx:264`의 화면 제목 변경**

```tsx
        <h1 className="text-2xl font-bold">홈 닥터</h1>
```

- [ ] **Step 4: `README.md:1`의 제목 변경**

```md
# 홈 닥터 (Home Doctor)
```

- [ ] **Step 5: `CLAUDE.md:5`의 프로젝트 개요에 이름 반영**

기존 문장 끝 "...이어지는 다중 전문의 AI 문진 앱이다."를 "...이어지는 다중 전문의 AI 문진 앱
'홈 닥터'다."로 바꾼다.

- [ ] **Step 6: 남은 참조 확인**

Run:
```bash
grep -rn "다중 전문의 AI 문진" app components README.md CLAUDE.md
```
Expected: 매치 없음 (설명 문구에 남아 있던 "다중 전문의 AI 문진 앱" 표현은 CLAUDE.md에서 이름을
덧붙이는 형태로만 남고, 실제 화면/메타데이터 타이틀 문자열은 모두 "홈 닥터"로 바뀌어 있어야 한다.
`docs/superpowers/specs/2026-08-28-*`, `docs/superpowers/plans/*` 등 날짜가 박힌 문서는 이 grep
대상에서 제외했으므로 결과에 나타나지 않는다.)

- [ ] **Step 7: 타입 체크 및 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 PASS

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx app/manifest.ts components/InterviewApp.tsx README.md CLAUDE.md
git commit -m "docs: rename the app to 홈 닥터"
```

---

## Task 12: 최종 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 테스트, 타입 체크, 린트, 빌드**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

Expected: 넷 모두 에러 없이 통과.

- [ ] **Step 2: 스펙 §10 수동 검증 시나리오 확인**

`npm run dev`로 서버를 띄운 뒤 브라우저에서:
1. `/` → "손님입장"/"회원가입" 2버튼만 보이는지 확인.
2. 새 계정으로 회원가입 → `/complete-profile`에서 전화번호/연령대/성별/직업을 모두 입력 → 저장 시
   `/`로 돌아가 문진 화면(`InterviewApp`)이 뜨는지 확인.
3. 아무 파일이나 업로드해 트리아지가 정상 동작하는지 확인(연령대/성별/직업이 반영되었는지는 서버
   로그나 네트워크 탭에서 `/api/triage`, `/api/specialists` 응답이 정상인지로 간접 확인 — 프롬프트
   내용 자체는 Task 4/5/6/7의 자동화 테스트로 이미 검증됨).
4. `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/triage`처럼 로그인 없이 API를
   직접 호출하면 리다이렉트/403류 응답이 오는지 확인(Clerk 미들웨어가 비로그인 호출을 막는지).

- [ ] **Step 3: Commit (필요한 경우)**

이 태스크는 검증 전용이라 보통 커밋할 변경 사항이 없다. Step 1~2에서 문제를 발견해 수정했다면 그
수정 건에 맞는 메시지로 별도 커밋한다.
