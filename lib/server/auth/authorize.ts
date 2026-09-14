import { readSession } from '@/lib/server/auth/session';

export type ViewerRole = 'guest' | 'admin' | 'manager';

export type Viewer = {
  role: ViewerRole;
  organizationId: string | null;
  adminId?: string;
  managerId?: string;
  activeMemberId?: string;
};

export class AuthorizationError extends Error {}

export async function getViewer(): Promise<Viewer> {
  const session = await readSession();

  if (session?.role === 'admin') {
    return { role: 'admin', organizationId: null, adminId: session.adminId };
  }

  if (session?.role === 'manager') {
    const viewer: Viewer = {
      role: 'manager',
      organizationId: session.organizationId,
      managerId: session.managerId,
    };
    if (session.activeMemberId !== undefined) {
      viewer.activeMemberId = session.activeMemberId;
    }
    return viewer;
  }

  return { role: 'guest', organizationId: null };
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    throw new AuthorizationError('admin 권한이 필요합니다.');
  }
  return viewer;
}

export async function requireManager(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'manager' || !viewer.organizationId) {
    throw new AuthorizationError('매니저 권한이 필요합니다.');
  }
  return viewer;
}

export async function requireMember(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'manager' || !viewer.activeMemberId) {
    throw new AuthorizationError('선택된 회원이 없습니다.');
  }
  return viewer;
}
