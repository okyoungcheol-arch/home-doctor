import { auth, clerkClient } from '@clerk/nextjs/server';

export type ViewerRole = 'guest' | 'admin' | 'manager' | 'member';

export type Viewer = {
  role: ViewerRole;
  userId: string | null;
  organizationId: string | null;
};

export class AuthorizationError extends Error {}

export async function getViewer(): Promise<Viewer> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return { role: 'guest', userId: null, organizationId: null };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = (user.publicMetadata as { role?: string } | null | undefined)?.role === 'admin';

  if (isAdmin) {
    return { role: 'admin', userId, organizationId: orgId ?? null };
  }
  if (orgRole === 'org:admin') {
    return { role: 'manager', userId, organizationId: orgId ?? null };
  }
  return { role: 'member', userId, organizationId: orgId ?? null };
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
  if (!viewer.userId) {
    throw new AuthorizationError('로그인이 필요합니다.');
  }
  return viewer;
}
