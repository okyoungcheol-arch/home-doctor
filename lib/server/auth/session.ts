import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export type SessionPayload = {
  role: 'manager';
  managerId: string;
  organizationId: string;
  activeMemberId?: string;
};

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
  if (candidate.role !== 'manager') {
    return false;
  }
  if (typeof candidate.managerId !== 'string' || typeof candidate.organizationId !== 'string') {
    return false;
  }
  if (candidate.activeMemberId !== undefined && typeof candidate.activeMemberId !== 'string') {
    return false;
  }
  return true;
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
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] });
    if (!isSessionPayload(payload)) {
      return null;
    }
    const result: SessionPayload = {
      role: payload.role,
      managerId: payload.managerId,
      organizationId: payload.organizationId,
    };
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
  const token = await encodeSessionToken({ role: 'manager', managerId, organizationId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
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
 * 매니저가 특정 회원을 선택했을 때 세션에 활성 회원을 기록한다. 유효한 매니저 세션이
 * 없으면 예외를 던진다(호출 전에 라우트 핸들러가 매니저 인증을 확인했어야 한다).
 */
export async function setActiveMember(memberId: string): Promise<void> {
  const session = await readSession();
  if (!session) {
    throw new Error('활성 매니저 세션이 없습니다.');
  }
  const token = await encodeSessionToken({ ...session, activeMemberId: memberId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * 세션에서 활성 회원 선택을 해제한다. 유효한 매니저 세션이 없으면 예외를 던진다.
 */
export async function clearActiveMember(): Promise<void> {
  const session = await readSession();
  if (!session) {
    throw new Error('활성 매니저 세션이 없습니다.');
  }
  const { activeMemberId: _activeMemberId, ...rest } = session;
  const token = await encodeSessionToken(rest);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}
