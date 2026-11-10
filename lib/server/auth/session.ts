import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// 관리자는 특정 단체에 속하지 않는 전역 역할이지만, 매니저 권한(회원 등록/선택/문진 저장)도 함께
// 가진다 — 이때 "어느 단체의 매니저처럼 행동할지"를 `organizationId`로 세션에 기록한다(매니저의
// 고정 소속과 달리 관리자가 언제든 바꿀 수 있는 선택값). `activeMemberId`는 그 단체 안에서 고른
// 회원이므로 `organizationId` 없이 단독으로 존재할 수 없다.
export type SessionPayload =
  | { role: 'manager'; managerId: string; organizationId: string; activeMemberId?: string }
  | { role: 'admin'; adminId: string; organizationId?: string; activeMemberId?: string };

export const SESSION_COOKIE_NAME = 'hd_session';

// 30일 — 시설에 비치된 태블릿/키오스크형 기기에서 로그인 상태를 유지하는 용도이므로
// 방문 세션이 아니라 긴 만료 기간을 사용한다.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET 환경 변수가 설정되지 않았습니다.');
  }
  return new TextEncoder().encode(secret);
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (candidate.activeMemberId !== undefined && typeof candidate.activeMemberId !== 'string') {
    return false;
  }

  if (candidate.role === 'admin') {
    if (typeof candidate.adminId !== 'string') {
      return false;
    }
    if (candidate.organizationId !== undefined && typeof candidate.organizationId !== 'string') {
      return false;
    }
    // 단체를 고르지 않은 채 회원만 선택된 세션은 만들어질 수 없는 상태다.
    return candidate.activeMemberId === undefined || candidate.organizationId !== undefined;
  }

  if (candidate.role === 'manager') {
    return typeof candidate.managerId === 'string' && typeof candidate.organizationId === 'string';
  }

  return false;
}

/**
 * 세션 페이로드를 서명된 JWT 문자열로 인코딩한다. Next.js 요청 컨텍스트 없이 순수하게
 * 동작하므로 유닛 테스트에서 직접 호출할 수 있다.
 *
 * @param options.expiresAt 만료 시각을 직접 지정한다(테스트에서 만료된 토큰을 만들 때 사용).
 *   생략하면 발급 시점으로부터 `SESSION_MAX_AGE_SECONDS` 뒤로 설정된다.
 */
export async function encodeSessionToken(
  payload: SessionPayload,
  options?: { expiresAt?: Date }
): Promise<string> {
  const expiresAt = options?.expiresAt ?? new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());
}

/**
 * 서명된 JWT 문자열을 검증하고 세션 페이로드로 디코딩한다. 서명 위조, 형식 오류, 만료 등
 * 어떤 사유로든 검증에 실패하면 예외를 던지지 않고 `null`을 반환한다.
 */
export async function decodeSessionToken(token: string): Promise<SessionPayload | null> {
  // getSecretKey()는 try 밖에서 호출한다 — SESSION_SECRET 미설정은 "세션 없음/무효"가
  // 아니라 배포 설정 오류이므로, 아래 catch에 흡수되어 null로 뭉개지면 안 된다.
  const secretKey = getSecretKey();
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    if (!isSessionPayload(payload)) {
      return null;
    }
    // JWT 표준 클레임(iat/exp)이 섞이지 않도록 세션 필드만 골라 새 객체로 만든다.
    let result: SessionPayload;
    if (payload.role === 'admin') {
      result = { role: 'admin', adminId: payload.adminId };
      if (payload.organizationId !== undefined) {
        result.organizationId = payload.organizationId;
      }
    } else {
      result = {
        role: 'manager',
        managerId: payload.managerId,
        organizationId: payload.organizationId,
      };
    }
    if (payload.activeMemberId !== undefined) {
      result.activeMemberId = payload.activeMemberId;
    }
    return result;
  } catch {
    return null;
  }
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    // 이 앱은 Vercel(HTTPS)에만 배포되므로 환경과 무관하게 항상 secure 쿠키를 사용한다.
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * 매니저 로그인 성공 시 서명된 세션 쿠키를 발급한다.
 */
export async function createManagerSession(managerId: string, organizationId: string): Promise<void> {
  await writeSession({ role: 'manager', managerId, organizationId });
}

/**
 * 관리자 로그인 성공 시 서명된 세션 쿠키를 발급한다.
 */
export async function createAdminSession(adminId: string): Promise<void> {
  await writeSession({ role: 'admin', adminId });
}

/**
 * 현재 요청의 세션 쿠키를 검증해 페이로드를 반환한다. 쿠키가 없거나 검증에 실패하면
 * `null`을 반환한다(로그인하지 않은 정상적인 상태이므로 예외를 던지지 않는다).
 */
export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return decodeSessionToken(token);
}

/**
 * 세션 쿠키 자체를 삭제한다("다른 계정으로 로그인"처럼 현재 로그인을 완전히 종료할 때 사용).
 * `clearActiveMember`와 달리 매니저/관리자 신원까지 전부 지운다.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function writeSession(payload: SessionPayload): Promise<void> {
  const token = await encodeSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * 매니저 권한으로 행동 중인 세션(매니저, 또는 단체를 선택한 관리자)을 읽는다. 해당하지 않으면
 * 예외를 던진다(호출 전에 라우트 핸들러가 `requireManager`로 인증을 확인했어야 한다).
 */
async function readManagingSession(): Promise<SessionPayload & { organizationId: string }> {
  const session = await readSession();
  if (!session || session.organizationId === undefined) {
    throw new Error('활성 매니저 세션이 없습니다.');
  }
  return { ...session, organizationId: session.organizationId };
}

/**
 * 특정 회원을 선택했을 때 세션에 활성 회원을 기록한다. 매니저 세션이거나 단체를 선택한 관리자
 * 세션이어야 하며, 아니면 예외를 던진다.
 */
export async function setActiveMember(memberId: string): Promise<void> {
  const session = await readManagingSession();
  await writeSession({ ...session, activeMemberId: memberId });
}

/**
 * 세션에서 활성 회원 선택을 해제한다(로그인 신원과 단체 선택은 유지). 매니저 권한으로 행동 중인
 * 세션이 없으면 예외를 던진다.
 */
export async function clearActiveMember(): Promise<void> {
  const session = await readManagingSession();
  const next = { ...session };
  delete next.activeMemberId;
  await writeSession(next);
}

/**
 * 관리자가 매니저 권한으로 행동할 단체를 선택(또는 변경)한다. 활성 회원은 이전 단체 소속이므로
 * 함께 해제한다. 관리자 세션이 아니면 예외를 던진다 — 매니저의 소속 단체는 바꿀 수 없다.
 */
export async function setActingOrganization(organizationId: string): Promise<void> {
  const session = await readSession();
  if (!session || session.role !== 'admin') {
    throw new Error('관리자 세션이 없습니다.');
  }
  await writeSession({ role: 'admin', adminId: session.adminId, organizationId });
}
