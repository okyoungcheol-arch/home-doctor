# 회원 등록 개인정보 동의 서명 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원 등록 마지막 단계에서 개인정보 수집·이용 동의서에 본인이 직접 서명하게 하고, 그 서명 이미지를 Vercel Blob에 저장한다.

**Architecture:** `members` 테이블에 nullable `consentSignatureUrl` 컬럼을 추가하고, `POST /api/dashboard/members`가 base64 서명 이미지를 받아 Vercel Blob(`access: 'private'`)에 먼저 업로드한 뒤 성공해야만 회원 row를 생성한다(업로드 실패 시 회원을 만들지 않아 "동의 없이 회원만 존재"하는 상태를 방지). 화면(`MemberRegistrationScreen`)은 기존 단일 폼을 2단계(정보 입력 → 동의서+서명)로 나누고, 서명은 신규 `SignaturePad`(canvas 기반) 컴포넌트로 캡처한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM(Neon Postgres), Zod 4, Vitest, `@vercel/blob`(이미 설치됨, `^2.8.0`).

**Spec:** `docs/superpowers/specs/2026-09-14-member-consent-signature-design.md`

## Global Constraints

- 서명 이미지는 Vercel Blob에 `access: 'private'`로 저장한다 — 공개 URL로 노출하지 않는다.
- 업로드가 실패하면 회원 row를 생성하지 않는다(업로드 성공 → 회원 생성 순서를 반드시 지킨다).
- `members.consentSignatureUrl`은 **nullable**이다 — 이미 서명 없이 등록된 회원 2명(윤숙자, 서신자 — 상문1통 경로당)이 실제 DB에 존재하므로 `NOT NULL`로 추가하면 안 된다. "신규 등록엔 필수"는 DB 제약이 아니라 API(Zod)와 화면(클라이언트) 검증으로 강제한다.
- 동의서 문구는 스펙 3절의 텍스트를 그대로 사용한다(사용자 승인 완료, 임의로 수정하지 않는다).
- UI 문구와 에러 메시지는 모두 한국어(존댓말)로 작성한다.
- 저장소 접근(`@vercel/blob`)은 `lib/server/**`에만 위치한다 — 클라이언트 컴포넌트가 직접 import하지 않는다(기존 서버/클라이언트 경계 규칙과 동일).

---

### Task 1: `members` 스키마에 `consentSignatureUrl` 컬럼 추가

**Files:**
- Modify: `lib/server/db/schema.ts`
- Test: `tests/lib/server/db/schema.test.ts`

**Interfaces:**
- Produces: `members.consentSignatureUrl: string | null` (nullable text 컬럼). `Member`/`NewMember` 타입(`$inferSelect`/`$inferInsert`)이 자동으로 `consentSignatureUrl?: string | null`을 포함하게 된다.

- [ ] **Step 1: Write the failing test**

`tests/lib/server/db/schema.test.ts`의 `members schema` describe 블록을 다음으로 교체한다:

```ts
describe('members schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(members));
    expect(columns).toEqual([
      'id',
      'organizationId',
      'name',
      'phoneNumber',
      'gender',
      'ageBand',
      'occupation',
      'consentSignatureUrl',
      'createdAt',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/server/db/schema.test.ts`
Expected: FAIL — `consentSignatureUrl`이 아직 컬럼 목록에 없음.

- [ ] **Step 3: Implement the schema addition**

`lib/server/db/schema.ts`의 `members` 테이블 정의에서 `occupation` 줄과 `createdAt` 줄 사이에 추가한다:

```ts
export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  gender: text('gender').notNull(), // GENDER_OPTIONS와 동일한 값 재사용
  ageBand: text('age_band').notNull(), // AGE_BANDS와 동일한 값 재사용 (이미 5세 구간)
  occupation: text('occupation').notNull(),
  consentSignatureUrl: text('consent_signature_url'), // nullable — 기존 회원은 서명 없음, 신규 등록만 API/화면에서 필수로 강제
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

(`.notNull()`을 붙이지 않는다 — 기존 회원 2명이 이 컬럼 없이 이미 존재하기 때문에 `NOT NULL`로 추가하면 `npm run db:push`가 실패한다.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/server/db/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/db/schema.ts tests/lib/server/db/schema.test.ts
git commit -m "feat: add nullable consentSignatureUrl column to members"
```

---

### Task 2: Blob 업로드 유틸 (`lib/server/blob.ts`)

**Files:**
- Create: `lib/server/blob.ts`
- Test: `tests/lib/server/blob.test.ts`

**Interfaces:**
- Consumes: `put` (`@vercel/blob`, 이미 `package.json`에 설치됨)
- Produces: `uploadSignature(organizationId: string, image: Buffer): Promise<string>` — 업로드 성공 시 Blob URL 반환

- [ ] **Step 1: Write the failing test**

`tests/lib/server/blob.test.ts` 신규 작성:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const putMock = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (path: string, data: Buffer, options: unknown) => putMock(path, data, options),
}));

import { uploadSignature } from '@/lib/server/blob';

describe('uploadSignature', () => {
  beforeEach(() => {
    putMock.mockReset();
  });

  it('uploads the image under a signatures/{organizationId}/ path with private access', async () => {
    putMock.mockResolvedValue({ url: 'https://blob.example.com/signatures/org_1/abc.png' });
    const buffer = Buffer.from('fake-png-bytes');

    const url = await uploadSignature('org_1', buffer);

    expect(url).toBe('https://blob.example.com/signatures/org_1/abc.png');
    expect(putMock).toHaveBeenCalledTimes(1);
    const [path, data, options] = putMock.mock.calls[0];
    expect(path).toMatch(/^signatures\/org_1\/[0-9a-f-]+\.png$/);
    expect(data).toBe(buffer);
    expect(options).toEqual({ access: 'private', contentType: 'image/png' });
  });

  it('generates a different path on each call', async () => {
    putMock.mockResolvedValue({ url: 'https://blob.example.com/x.png' });
    const buffer = Buffer.from('fake-png-bytes');

    await uploadSignature('org_1', buffer);
    await uploadSignature('org_1', buffer);

    const [firstPath] = putMock.mock.calls[0];
    const [secondPath] = putMock.mock.calls[1];
    expect(firstPath).not.toBe(secondPath);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/server/blob.test.ts`
Expected: FAIL — `@/lib/server/blob`가 아직 존재하지 않음.

- [ ] **Step 3: Implement**

`lib/server/blob.ts` 신규 작성:

```ts
import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

export async function uploadSignature(organizationId: string, image: Buffer): Promise<string> {
  const blob = await put(`signatures/${organizationId}/${randomUUID()}.png`, image, {
    access: 'private',
    contentType: 'image/png',
  });
  return blob.url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/server/blob.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/blob.ts tests/lib/server/blob.test.ts
git commit -m "feat: add Vercel Blob upload helper for consent signatures"
```

---

### Task 3: `POST /api/dashboard/members`에 서명 업로드 통합

**Files:**
- Modify: `app/api/dashboard/members/route.ts`
- Modify: `tests/api/dashboard-members.test.ts`

**Interfaces:**
- Consumes: `uploadSignature(organizationId, image)` (Task 2, `@/lib/server/blob`), `createMember(input: NewMember)` (기존, 이제 `input`에 `consentSignatureUrl?: string`를 담아 호출)
- Produces: `POST` 핸들러 — 성공 200, 잘못된 요청(서명 누락/형식 오류 포함) 400, 업로드 실패 500 `{error: '서명 저장에 실패했습니다.'}`, 권한 없음 403 (기존과 동일)

- [ ] **Step 1: Write the failing test (전체 파일 교체)**

`tests/api/dashboard-members.test.ts`를 다음으로 교체한다 (`GET` 관련 describe 블록은 변경 없음, `POST` describe 블록과 상단 mock만 바뀐다):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const createMemberMock = vi.fn();
const listMembersForOrganizationMock = vi.fn();
const uploadSignatureMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  createMember: (input: unknown) => createMemberMock(input),
  listMembersForOrganization: (organizationId: string) => listMembersForOrganizationMock(organizationId),
}));

vi.mock('@/lib/server/blob', () => ({
  uploadSignature: (organizationId: string, image: Buffer) => uploadSignatureMock(organizationId, image),
}));

import { POST, GET } from '@/app/api/dashboard/members/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/dashboard/members', body);
}

const validSignatureImage = 'data:image/png;base64,aGVsbG8=';

describe('POST /api/dashboard/members', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    createMemberMock.mockReset();
    uploadSignatureMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: validSignatureImage,
      }),
    );
    expect(response.status).toBe(403);
    expect(createMemberMock).not.toHaveBeenCalled();
    expect(uploadSignatureMock).not.toHaveBeenCalled();
  });

  it('uploads the signature and creates a member scoped to the manager organization', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    uploadSignatureMock.mockResolvedValue('https://blob.example.com/signatures/org_1/abc.png');
    createMemberMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
      consentSignatureUrl: 'https://blob.example.com/signatures/org_1/abc.png',
      createdAt: new Date(),
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: validSignatureImage,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(uploadSignatureMock).toHaveBeenCalledWith('org_1', expect.any(Buffer));
    expect(createMemberMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
      consentSignatureUrl: 'https://blob.example.com/signatures/org_1/abc.png',
    });
    expect(data.member.consentSignatureUrl).toBe('https://blob.example.com/signatures/org_1/abc.png');
  });

  it('rejects malformed bodies', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(jsonRequest({ name: '홍길동' }));
    expect(response.status).toBe(400);
    expect(createMemberMock).not.toHaveBeenCalled();
    expect(uploadSignatureMock).not.toHaveBeenCalled();
  });

  it('rejects invalid enum values', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'not-a-gender',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: validSignatureImage,
      }),
    );
    expect(response.status).toBe(400);
    expect(createMemberMock).not.toHaveBeenCalled();
    expect(uploadSignatureMock).not.toHaveBeenCalled();
  });

  it('rejects a missing signatureImage', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
      }),
    );
    expect(response.status).toBe(400);
    expect(uploadSignatureMock).not.toHaveBeenCalled();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed signatureImage that is not a PNG data URL', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: 'not-a-data-url',
      }),
    );
    expect(response.status).toBe(400);
    expect(uploadSignatureMock).not.toHaveBeenCalled();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('returns 500 and does not create a member when the signature upload fails', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    uploadSignatureMock.mockRejectedValue(new Error('blob upload failed'));

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: validSignatureImage,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: '서명 저장에 실패했습니다.' });
    expect(createMemberMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/dashboard/members', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    listMembersForOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(listMembersForOrganizationMock).not.toHaveBeenCalled();
  });

  it("scopes results to the manager's own organization", async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    listMembersForOrganizationMock.mockResolvedValue([{ id: 'member_1', organizationId: 'org_1', name: '홍길동' }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toEqual([{ id: 'member_1', organizationId: 'org_1', name: '홍길동' }]);
    expect(listMembersForOrganizationMock).toHaveBeenCalledWith('org_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/dashboard-members.test.ts`
Expected: FAIL — 라우트가 아직 `signatureImage`를 처리하지 않고, `@/lib/server/blob` mock의 `uploadSignature`가 호출되지 않음(라우트에서 아직 참조하지 않으므로 vi.mock 자체는 통과하지만 관련 assertion들이 실패).

- [ ] **Step 3: Implement**

`app/api/dashboard/members/route.ts` 전체를 다음으로 교체한다:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManager } from '@/lib/server/auth/authorize';
import { createMember, listMembersForOrganization } from '@/lib/server/organizations/repository';
import { uploadSignature } from '@/lib/server/blob';
import { AGE_BANDS, GENDER_VALUES, OCCUPATIONS } from '@/lib/profile/constants';
import { guard, parseJsonBody } from '@/lib/server/http';

const createMemberSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  gender: z.enum(GENDER_VALUES),
  ageBand: z.enum(AGE_BANDS),
  occupation: z.enum(OCCUPATIONS),
  signatureImage: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
});

export async function POST(request: Request) {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createMemberSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const signatureBuffer = Buffer.from(
    parsed.data.signatureImage.replace(/^data:image\/png;base64,/, ''),
    'base64',
  );

  let signatureUrl: string;
  try {
    signatureUrl = await uploadSignature(guarded.value.organizationId!, signatureBuffer);
  } catch {
    return NextResponse.json({ error: '서명 저장에 실패했습니다.' }, { status: 500 });
  }

  const member = await createMember({
    organizationId: guarded.value.organizationId!,
    name: parsed.data.name,
    phoneNumber: parsed.data.phoneNumber,
    gender: parsed.data.gender,
    ageBand: parsed.data.ageBand,
    occupation: parsed.data.occupation,
    consentSignatureUrl: signatureUrl,
  });

  return NextResponse.json({ member });
}

export async function GET() {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const members = await listMembersForOrganization(guarded.value.organizationId!);
  return NextResponse.json({ members });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/dashboard-members.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/members/route.ts tests/api/dashboard-members.test.ts
git commit -m "feat: upload consent signature to Blob before creating a member"
```

---

### Task 4: `SignaturePad` 컴포넌트 (신규)

**Files:**
- Create: `components/SignaturePad.tsx`

이 프로젝트에는 React 컴포넌트 테스트 관례가 없다(React Testing Library 미설치, 기존 폼 컴포넌트들도 무테스트). 이 태스크의 검증은 타입체크 + Task 6의 수동 확인으로 한다.

**Interfaces:**
- Produces: `SignaturePad` (forwardRef 컴포넌트, props 없음), `SignaturePadHandle = { isEmpty(): boolean; toDataURL(): string; clear(): void }` — Task 5가 `useRef<SignaturePadHandle>`로 사용

- [ ] **Step 1: 파일 작성**

`components/SignaturePad.tsx` 신규 작성:

```tsx
'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  function getContext(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  // 캔버스는 CSS로 늘어나지만(w-full) 내부 해상도는 고정(400x160)이므로, 화면 좌표를 캔버스
  // 내부 좌표로 정확히 변환해야 선이 커서/손가락 위치와 어긋나지 않는다.
  function getPosition(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext();
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getPosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPosition(event);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawnRef.current = true;
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasDrawnRef.current,
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    clear: () => {
      const ctx = getContext();
      const canvas = canvasRef.current;
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      hasDrawnRef.current = false;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={160}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="w-full touch-none rounded-8 border border-line-normal bg-static-white"
    />
  );
});
```

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add components/SignaturePad.tsx
git commit -m "feat: add canvas-based signature pad component"
```

---

### Task 5: `MemberRegistrationScreen`을 2단계 위저드로 개편

**Files:**
- Modify: `components/MemberRegistrationScreen.tsx`

이 태스크도 컴포넌트 테스트 관례가 없어 타입체크 + Task 6의 수동 확인으로 검증한다.

**Interfaces:**
- Consumes: `SignaturePad`, `SignaturePadHandle` (Task 4, `@/components/SignaturePad`)
- Produces: `MemberRegistrationScreen` (props 없음, 기존과 동일하게 사용) — 내부적으로 2단계(`step: 1 | 2`) 위저드로 바뀌지만 외부 사용법(`app/dashboard/register/page.tsx`에서 `<MemberRegistrationScreen />`으로 렌더)은 변경 없음

- [ ] **Step 1: 파일 전체 교체**

`components/MemberRegistrationScreen.tsx` 전체를 다음으로 교체한다:

```tsx
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '@/lib/profile/constants';
import { formatPhoneNumber } from '@/lib/phone';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';

const CONSENT_TEXT = `개인정보 수집·이용 동의서

1. 수집 항목: 이름, 전화번호, 성별, 연령대, 직업, 서명 이미지
2. 수집 목적: AI 문진 서비스 제공 및 상담 기록 관리
3. 보유 및 이용 기간: 회원 탈퇴 또는 삭제 요청 시까지
4. 귀하는 개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 다만 위 항목은 서비스 제공을
   위한 필수 정보로, 동의하지 않으실 경우 회원 등록이 제한됩니다.

위 내용에 동의하시면 아래에 서명해 주세요.`;

export function MemberRegistrationScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [ageBand, setAgeBand] = useState('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const signaturePadRef = useRef<SignaturePadHandle>(null);

  function handleNext(event: FormEvent) {
    event.preventDefault();
    setStep(2);
  }

  function handleBack() {
    setStep(1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      setError('서명을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setSuccess(false);
    try {
      const signatureImage = signaturePadRef.current.toDataURL();
      const response = await fetch('/api/dashboard/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phoneNumber, gender, ageBand, occupation, signatureImage }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? '등록에 실패했습니다.');
      }
      setName('');
      setPhoneNumber('');
      setGender('');
      setAgeBand('');
      setOccupation('');
      signaturePadRef.current.clear();
      setStep(1);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 1) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-bold">회원 등록</h1>
        <form
          onSubmit={handleNext}
          className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm">
            이름
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-8 border border-line-normal p-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            전화번호
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
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
            className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white"
          >
            다음
          </button>
          {success && (
            <p className="text-sm text-status-positive">등록되었습니다. 이어서 다른 회원을 등록할 수 있습니다.</p>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">개인정보 동의 및 서명</h1>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <pre className="whitespace-pre-wrap rounded-8 border border-line-normal bg-background-normal p-3 text-sm">
          {CONSENT_TEXT}
        </pre>
        <SignaturePad ref={signaturePadRef} />
        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={() => signaturePadRef.current?.clear()}
            className="rounded-8 border border-line-normal px-4 py-2 text-sm font-medium"
          >
            지우기
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-8 border border-line-normal px-4 py-2 text-sm font-medium"
            >
              이전
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
            >
              등록
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 스위트로 회귀 확인**

Run: `npm run test`
Expected: PASS (전체)

- [ ] **Step 4: Commit**

```bash
git add components/MemberRegistrationScreen.tsx
git commit -m "feat: split member registration into info + consent/signature steps"
```

---

### Task 6: 최종 검증 (실제 DB + Blob 대상 수동 확인)

**Files:** 없음 (검증 전용 태스크)

Vercel Blob 스토어(`home-doctor-signatures`)는 이미 프로비저닝되어 `BLOB_READ_WRITE_TOKEN`이
`.env.local`에 들어있다. `npm run db:push`로 `consentSignatureUrl` 컬럼을 실제 DB에 반영해야
한다.

- [ ] **Step 1: DB 마이그레이션 적용**

Run: `npm run db:push`
Expected: `consentSignatureUrl` 컬럼 추가 계획이 표시되고 적용됨. 기존 컬럼/데이터에는 영향 없는
추가(additive) 변경이어야 한다(적용 전 diff 확인).

- [ ] **Step 2: 개발 서버로 수동 확인**

Run: `npm run dev`

1. 매니저로 로그인 → `/dashboard/register` 접속
2. 1단계에서 이름/전화번호/연령대/성별/직업 입력 → "다음" 클릭 → 2단계(동의서+서명)로 전환되는지 확인
3. 서명 없이 "등록" 클릭 → "서명을 입력해 주세요." 에러가 뜨고 요청이 전송되지 않는지 확인(네트워크 탭에서 `/api/dashboard/members` 호출이 없어야 함)
4. 캔버스에 마우스로 서명 → "등록" 클릭 → 성공 메시지와 함께 1단계로 돌아가는지 확인
5. `npx vercel blob list` (또는 Vercel 대시보드 Storage → home-doctor-signatures)에서 `signatures/{organizationId}/*.png` 파일이 생겼는지 확인
6. 2단계에서 "이전" 클릭 → 1단계로 돌아가되 입력했던 값이 유지되는지 확인
7. 기존 회원(윤숙자, 서신자)이 회원 선택 목록(`/dashboard`)에 여전히 정상적으로 표시되고 선택 가능한지 확인(회귀 없음)
8. 수동으로 만든 테스트 회원 row는 확인 후 삭제한다(Task 2/Task 1 방식처럼 임시 스크립트로 `members` 테이블에서 해당 row 삭제 — 스크립트는 확인 후 제거).

- [ ] **Step 3: 최종 전체 테스트 재실행**

Run: `npm run test && npx tsc --noEmit`
Expected: 전체 PASS, 타입 에러 없음

이 태스크는 커밋을 만들지 않는다(검증 전용). 확인이 모두 끝나면 GitHub에 push해 Vercel 프로덕션에
배포한다(사용자 확인 후).
