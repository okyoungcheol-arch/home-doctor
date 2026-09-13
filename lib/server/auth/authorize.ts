import { auth, clerkClient } from '@clerk/nextjs/server';
import { readSession } from '@/lib/server/auth/session';

export type ViewerRole = 'guest' | 'admin' | 'manager';

export type Viewer = {
  role: ViewerRole;
  userId: string | null;
  organizationId: string | null;
  managerId?: string;
  activeMemberId?: string;
};

export class AuthorizationError extends Error {}

export async function getViewer(): Promise<Viewer> {
  const { userId } = await auth();

  if (userId) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const isAdmin = (user.publicMetadata as { role?: string } | null | undefined)?.role === 'admin';
    if (isAdmin) {
      return { role: 'admin', userId, organizationId: null };
    }
  }

  const session = await readSession();
  if (session) {
    const viewer: Viewer = {
      role: 'manager',
      userId: null,
      organizationId: session.organizationId,
      managerId: session.managerId,
    };
    if (session.activeMemberId !== undefined) {
      viewer.activeMemberId = session.activeMemberId;
    }
    return viewer;
  }

  return { role: 'guest', userId: null, organizationId: null };
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
    throw new AuthorizationError('매니져 권한이 필요합니다.');
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
