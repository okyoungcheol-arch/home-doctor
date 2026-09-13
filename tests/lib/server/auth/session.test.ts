import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

import {
  encodeSessionToken,
  decodeSessionToken,
  createManagerSession,
  setActiveMember,
  clearActiveMember,
  readSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
} from '@/lib/server/auth/session';

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-only-for-vitest-do-not-use-elsewhere';
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
});

describe('encodeSessionToken / decodeSessionToken (pure JWT helpers)', () => {
  it('round-trips a payload without an active member', async () => {
    const payload: SessionPayload = {
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    };
    const token = await encodeSessionToken(payload);
    const decoded = await decodeSessionToken(token);
    expect(decoded).toEqual(payload);
  });

  it('round-trips a payload with an active member', async () => {
    const payload: SessionPayload = {
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
      activeMemberId: 'member-1',
    };
    const token = await encodeSessionToken(payload);
    const decoded = await decodeSessionToken(token);
    expect(decoded).toEqual(payload);
  });

  it('returns null for a malformed token', async () => {
    const decoded = await decodeSessionToken('not-a-jwt');
    expect(decoded).toBeNull();
  });

  it('returns null for an empty string', async () => {
    const decoded = await decodeSessionToken('');
    expect(decoded).toBeNull();
  });

  it('returns null for a tampered (re-signed with different secret) token', async () => {
    const payload: SessionPayload = {
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    };
    const token = await encodeSessionToken(payload);

    // Tamper with the payload segment so the signature no longer matches.
    const [headerB64, , signatureB64] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ role: 'manager', managerId: 'attacker', organizationId: 'org-1' })
    )
      .toString('base64url');
    const tampered = `${headerB64}.${tamperedPayload}.${signatureB64}`;

    const decoded = await decodeSessionToken(tampered);
    expect(decoded).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const payload: SessionPayload = {
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    };
    const token = await encodeSessionToken(payload);

    process.env.SESSION_SECRET = 'a-completely-different-secret-value-for-this-check';
    const decoded = await decodeSessionToken(token);
    expect(decoded).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const payload: SessionPayload = {
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    };
    const token = await encodeSessionToken(payload, { expiresAt: new Date(Date.now() - 1000) });
    const decoded = await decodeSessionToken(token);
    expect(decoded).toBeNull();
  });

  it('rejects a payload missing required fields', async () => {
    // Sign a JWT-shaped-but-invalid payload directly to simulate a token that isn't
    // a valid SessionPayload even though the signature checks out.
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const token = await new SignJWT({ role: 'manager', managerId: 'manager-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(new Date(Date.now() + 1000))
      .sign(secret);

    const decoded = await decodeSessionToken(token);
    expect(decoded).toBeNull();
  });
});

describe('createManagerSession', () => {
  it('sets a signed session cookie with the expected flags', async () => {
    await createManagerSession('manager-1', 'org-1');

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, token, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    const decoded = await decodeSessionToken(token);
    expect(decoded).toEqual({ role: 'manager', managerId: 'manager-1', organizationId: 'org-1' });
  });
});

describe('readSession', () => {
  it('returns null when there is no cookie', async () => {
    cookieStore.get.mockReturnValue(undefined);
    const session = await readSession();
    expect(session).toBeNull();
  });

  it('returns null when the cookie value fails to decode', async () => {
    cookieStore.get.mockReturnValue({ value: 'garbage' });
    const session = await readSession();
    expect(session).toBeNull();
  });

  it('returns the decoded payload for a valid cookie', async () => {
    const token = await encodeSessionToken({
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    });
    cookieStore.get.mockReturnValue({ value: token });

    const session = await readSession();
    expect(session).toEqual({ role: 'manager', managerId: 'manager-1', organizationId: 'org-1' });
  });
});

describe('setActiveMember', () => {
  it('throws when there is no existing manager session', async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(setActiveMember('member-1')).rejects.toThrow();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('re-encodes the session with the active member set', async () => {
    const token = await encodeSessionToken({
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    });
    cookieStore.get.mockReturnValue({ value: token });

    await setActiveMember('member-1');

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [, newToken] = cookieStore.set.mock.calls[0];
    const decoded = await decodeSessionToken(newToken);
    expect(decoded).toEqual({
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
      activeMemberId: 'member-1',
    });
  });
});

describe('clearActiveMember', () => {
  it('throws when there is no existing manager session', async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(clearActiveMember()).rejects.toThrow();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('re-encodes the session with the active member removed', async () => {
    const token = await encodeSessionToken({
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
      activeMemberId: 'member-1',
    });
    cookieStore.get.mockReturnValue({ value: token });

    await clearActiveMember();

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [, newToken] = cookieStore.set.mock.calls[0];
    const decoded = await decodeSessionToken(newToken);
    expect(decoded).toEqual({
      role: 'manager',
      managerId: 'manager-1',
      organizationId: 'org-1',
    });
  });
});
