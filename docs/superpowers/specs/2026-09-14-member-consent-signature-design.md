# 회원 등록 개인정보 동의 서명 — 설계 문서

- 작성일: 2026-09-14
- 상태: 설계 확정 (구현 계획 작성 예정)
- 용도: 회원 등록 시 개인정보 수집·이용 동의를 본인이 직접 서명하게 하고, 그 서명 이미지를 저장

## 0. 이 문서가 바꾸는 것

CLAUDE.md의 다음 문장에 대해 **서명 이미지에 한해 명시적 예외**를 추가한다.

> 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한 텍스트만 저장한다.

이 원칙은 문진(상담) 파이프라인의 업로드 문서/녹음에 대한 것으로, 계속 유지된다. 서명 이미지는
AI가 처리하는 입력이 아니라 개인정보 동의의 법적 증빙이므로, 원본 이미지 자체를 저장해야
의미가 있다 — 텍스트로 추출할 수 있는 대상이 아니다. 따라서 이 문서는 "서명 이미지"라는 새
카테고리에 한해 원본 파일 저장을 허용하고, 그 저장소로 Vercel Blob을 도입한다.

## 1. 목적

1. 매니저가 회원을 등록할 때, 회원 본인(또는 필요 시 매니저가 보조)이 개인정보 수집·이용
   동의서를 화면에서 읽고 직접 서명하게 한다.
2. 그 서명을 이미지로 저장해 동의의 증빙으로 남긴다.
3. 기존에 서명 없이 등록된 회원(윤숙자, 서신자 — 상문1통 경로당, 2026-09-14 기준 실제 등록됨)이
   깨지지 않게 한다.

## 2. 범위 결정 사항

- **서명 시점**: 회원 정보(이름/전화번호/성별/연령대/직업) 입력을 마친 뒤, 등록의 마지막 단계로
  받는다. 같은 화면(`/dashboard/register`) 안에서 2단계로 진행한다.
- **서명 대상**: 신규로 등록하는 회원부터 필수. 기존 회원에게 소급 적용하지 않는다(재동의 요청
  UI는 이번 범위 밖).
- **조회 UI 없음**: 저장된 서명 이미지를 다시 보는 화면은 이번 범위에 포함하지 않는다. 저장만
  한다.
- **동의서 문구**: 일반적인 개인정보 수집·이용 동의 표준 문구를 사용한다(3절 참고). 법률 검토를
  거친 문구가 아니며, 개인/학습용 프로토타입 수준이다.
- **저장소**: Vercel Blob, `access: 'private'`(서명은 민감한 개인정보이므로 공개 URL로 노출하지
  않는다). 스토어 `home-doctor-signatures`를 신설해 이 프로젝트에 연결했다
  (`BLOB_READ_WRITE_TOKEN`이 `.env.local`과 Vercel 프로젝트 환경변수에 이미 프로비저닝됨).

## 3. 동의서 문구

```
개인정보 수집·이용 동의서

1. 수집 항목: 이름, 전화번호, 성별, 연령대, 직업, 서명 이미지
2. 수집 목적: AI 문진 서비스 제공 및 상담 기록 관리
3. 보유 및 이용 기간: 회원 탈퇴 또는 삭제 요청 시까지
4. 귀하는 개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 다만 위 항목은 서비스 제공을
   위한 필수 정보로, 동의하지 않으실 경우 회원 등록이 제한됩니다.

위 내용에 동의하시면 아래에 서명해 주세요.
```

## 4. 데이터 모델

`members` 테이블에 컬럼 추가:

```ts
consentSignatureUrl: text('consent_signature_url'), // nullable — 기존 회원은 서명 없음
```

`organizationId` FK처럼 필수로 만들지 않는 이유: 이미 존재하는 회원 2명이 이 컬럼 없이
등록되어 있어, `NOT NULL`로 추가하면 마이그레이션이 실패한다. "신규 등록엔 필수"라는 규칙은
DB 제약이 아니라 API/화면 검증으로 강제한다(5절).

## 5. 저장/등록 흐름

`POST /api/dashboard/members`의 요청 스키마에 `signatureImage`(base64 data URL, 예:
`data:image/png;base64,...`)를 필수 필드로 추가한다.

처리 순서 (실패 시 "동의 없이 회원만 존재"하는 상태를 만들지 않기 위해, 업로드를 먼저 하고
성공해야 회원 row를 만든다):

1. Zod로 `signatureImage`가 `data:image/png;base64,` 접두사를 가진 문자열인지 검증
2. base64를 디코드해 `Buffer`로 변환
3. `lib/server/blob.ts`의 `uploadSignature(organizationId, buffer)`가 Vercel Blob에
   `access: 'private'`로 업로드하고, 경로는 `signatures/{organizationId}/{crypto.randomUUID()}.png`
   (회원 id는 아직 없으므로 랜덤 UUID 사용 — Blob 자체 `addRandomSuffix`에 의존하지 않고 경로에
   조직 단위로 네임스페이스를 둬서 나중에 조직별 정리가 쉽도록 한다)
4. 업로드가 실패하면 회원 row를 만들지 않고 그대로 에러를 반환한다(500)
5. 업로드가 성공하면 반환된 URL을 담아 기존 `createMember(...)`를 호출해 회원 row 생성

## 6. 화면 흐름 (`components/MemberRegistrationScreen.tsx`)

현재 단일 폼을 2단계 위저드로 바꾼다(라우트는 그대로 `/dashboard/register` 하나, 클라이언트
상태로 단계만 전환):

- **1단계**: 기존 필드(이름/전화번호/성별/연령대/직업) — 그대로 유지. "다음" 버튼으로 2단계로
  진행(HTML5 required 검증 통과해야 진행).
- **2단계**: 동의서 문구(3절) 전문 표시 + 서명 캔버스(`components/SignaturePad.tsx`, 신규) +
  "지우기" 버튼 + "이전"(1단계로 돌아가기, 입력값 보존) + "등록"(최종 제출).
- "등록" 클릭 시 1단계에서 모은 필드 + 캔버스를 PNG data URL로 변환한 값을 함께
  `POST /api/dashboard/members`로 전송.
- 서명 없이 "등록"을 누르면 클라이언트에서 막는다(캔버스가 비어있으면 에러 메시지 표시,
  요청 자체를 보내지 않음).

`components/SignaturePad.tsx`(신규, `'use client'`): `<canvas>` 기반, `pointerdown`/
`pointermove`/`pointerup` 이벤트로 그리기(마우스와 터치 모두 `Pointer Events`로 통일 처리),
`isEmpty(): boolean`과 `toDataURL(): string`, `clear(): void`를 ref로 노출한다
(`useImperativeHandle`).

## 7. 저장소 계층 (`lib/server/blob.ts`, 신규)

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

`lib/server/**`에만 위치하므로 클라이언트 번들에 `@vercel/blob`이 섞이지 않는다(기존 경계 규칙과
동일).

## 8. 보안/개인정보

- 서명 이미지는 `access: 'private'`로 저장되어 URL을 안다고 공개 접근되지 않는다(Vercel Blob의
  private storage는 서명된 접근만 허용).
- 이번 범위에는 조회 UI가 없으므로, URL은 DB에만 남고 실제로 다시 읽어오는 코드 경로가 없다 —
  나중에 조회 기능을 추가할 때 `@vercel/blob`의 `get()`으로 서버 라우트를 통해서만 접근하게 한다
  (클라이언트에 raw Blob URL을 노출하지 않는다).
- 동의서 문구 자체는 법률 검토를 거치지 않은 일반 문구이며, 실제 운영 배포 시엔 법무 검토가
  필요하다(개인/학습용 프로토타입 전제로 지금은 생략).

## 9. 테스트

### 자동 테스트

- `lib/server/blob.ts`의 `uploadSignature`는 `@vercel/blob`의 `put`을 모킹해 경로/옵션
  (`access: 'private'`, `contentType: 'image/png'`)이 올바른지 검증.
- `POST /api/dashboard/members` 라우트 테스트에 케이스 추가: `signatureImage` 누락/잘못된 형식 시
  400, 업로드 실패 시 500이면서 `createMember` 미호출, 성공 시 업로드된 URL이 `createMember`에
  전달되는지 확인(기존 테스트 파일에 케이스 추가, `@vercel/blob`은 모킹).
- `SignaturePad`는 이 프로젝트에 컴포넌트 테스트 관례가 없으므로(React Testing Library 미설치)
  테스트 대상에서 제외 — 수동 확인으로 검증.

### 수동 검증

1. `/dashboard/register`에서 1단계 입력 → 2단계에서 서명 없이 "등록" 시도 → 클라이언트에서 막히는지 확인
2. 서명 후 "등록" → 실제로 회원이 생성되고, Vercel Blob 대시보드(또는 `vercel blob list`)에
   `signatures/{organizationId}/...png` 파일이 생겼는지 확인
3. "이전" 버튼으로 1단계로 돌아갔을 때 입력값이 유지되는지 확인
4. 기존 회원(윤숙자, 서신자) 조회/문진 선택이 이 변경 이후에도 정상 동작하는지 확인(회귀 없음)

## 10. 이번 스펙에 포함하지 않는 것

- 저장된 서명 이미지를 다시 보는 조회 UI
- 기존(서명 없는) 회원에 대한 소급 재동의 요청
- 동의서 문구의 법률 검토
- 서명 이미지 만료/삭제 정책(회원 삭제 시 연동된 Blob 삭제 등)
