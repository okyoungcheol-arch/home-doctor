import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const listRecordsForOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/records/repository', () => ({
  listRecordsForOrganization: (id: string) => listRecordsForOrganizationMock(id),
}));

import { GET } from '@/app/api/dashboard/records/route';

describe('GET /api/dashboard/records', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    listRecordsForOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(listRecordsForOrganizationMock).not.toHaveBeenCalled();
  });

  it("scopes results to the manager's own organization", async () => {
    requireManagerMock.mockResolvedValue({ role: 'manager', userId: 'user_2', organizationId: 'org_1' });
    listRecordsForOrganizationMock.mockResolvedValue([{ id: 'rec_1', organizationId: 'org_1' }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([{ id: 'rec_1', organizationId: 'org_1' }]);
    expect(listRecordsForOrganizationMock).toHaveBeenCalledWith('org_1');
  });
});
