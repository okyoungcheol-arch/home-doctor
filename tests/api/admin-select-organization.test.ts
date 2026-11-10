import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const findOrganizationByIdMock = vi.fn();
const setActingOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findOrganizationById: (id: string) => findOrganizationByIdMock(id),
}));

vi.mock('@/lib/server/auth/session', () => ({
  setActingOrganization: (organizationId: string) => setActingOrganizationMock(organizationId),
}));

import { POST } from '@/app/api/admin/select-organization/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

const ORG_ID = '4f6a9317-c99f-4f51-afeb-dca3e340e6ea';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/admin/select-organization', body);
}

describe('POST /api/admin/select-organization', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    findOrganizationByIdMock.mockReset();
    setActingOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await POST(jsonRequest({ organizationId: ORG_ID }));
    expect(response.status).toBe(403);
    expect(setActingOrganizationMock).not.toHaveBeenCalled();
  });

  it('records the selected organization for admins', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1', organizationId: null });
    findOrganizationByIdMock.mockResolvedValue({ id: ORG_ID, name: '테스트 경로당' });

    const response = await POST(jsonRequest({ organizationId: ORG_ID }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(setActingOrganizationMock).toHaveBeenCalledWith(ORG_ID);
  });

  it('returns 404 for an organization that does not exist', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1', organizationId: null });
    findOrganizationByIdMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ organizationId: ORG_ID }));

    expect(response.status).toBe(404);
    expect(setActingOrganizationMock).not.toHaveBeenCalled();
  });

  it.each([{}, { organizationId: 'not-a-uuid' }])('rejects malformed body %j', async (body) => {
    requireAdminMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1', organizationId: null });

    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(findOrganizationByIdMock).not.toHaveBeenCalled();
    expect(setActingOrganizationMock).not.toHaveBeenCalled();
  });
});
