import { readSession } from '@/lib/server/auth/session';

export type Viewer = {
  role: 'guest' | 'admin' | 'manager';
  // 매니저는 고정 소속 단체, 관리자는 매니저 권한으로 행동하려고 선택한 단체(미선택이면 null).
  organizationId: string | null;
  adminId?: string;
  managerId?: string;
  activeMemberId?: string;
};

export class AuthorizationError extends Error {}

export async function getViewer(): Promise<Viewer> {
  const session = await readSession();
  if (!session) {
    return { role: 'guest', organizationId: null };
  }

  const viewer: Viewer =
    session.role === 'admin'
      ? { role: 'admin', organizationId: session.organizationId ?? null, adminId: session.adminId }
      : { role: 'manager', organizationId: session.organizationId, managerId: session.managerId };
  if (session.activeMemberId !== undefined) {
    viewer.activeMemberId = session.activeMemberId;
  }
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    throw new AuthorizationError('admin 권한이 필요합니다.');
  }
  return viewer;
}

/**
 * 매니저 권한 — 매니저 본인이거나, 행동할 단체를 선택한 관리자. 관리자는 모든 단체에 대해 매니저
 * 권한을 갖지만, 회원 조회/등록은 항상 단체 하나에 한정되므로 단체를 먼저 골라야 통과한다.
 */
export async function requireManager(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role === 'guest' || !viewer.organizationId) {
    throw new AuthorizationError('매니저 권한이 필요합니다.');
  }
  return viewer;
}

export async function requireMember(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role === 'guest' || !viewer.organizationId || !viewer.activeMemberId) {
    throw new AuthorizationError('선택된 회원이 없습니다.');
  }
  return viewer;
}
