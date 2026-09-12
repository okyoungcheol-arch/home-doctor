import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentUserMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: () => currentUserMock(),
}));

import { getPatientProfile, isProfileComplete } from '@/lib/server/auth/patientProfile';

describe('getPatientProfile', () => {
  beforeEach(() => {
    currentUserMock.mockReset();
  });

  it('returns null when there is no signed-in user', async () => {
    currentUserMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
  });

  it('reads ageBand/gender/occupation from unsafeMetadata', async () => {
    currentUserMock.mockResolvedValue({
      unsafeMetadata: { ageBand: '60~64세', gender: 'male', occupation: '농업' },
    });
    expect(await getPatientProfile()).toEqual({ ageBand: '60~64세', gender: 'male', occupation: '농업' });
  });

  it('falls back to empty values when a field is missing or an invalid gender', async () => {
    currentUserMock.mockResolvedValue({ unsafeMetadata: { gender: 'not-a-real-gender' } });
    expect(await getPatientProfile()).toEqual({ ageBand: '', gender: '', occupation: '' });
  });
});

describe('isProfileComplete', () => {
  it('is false for a null user', () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it('is false when any required field is missing', () => {
    expect(
      isProfileComplete({ unsafeMetadata: { phoneNumber: '010-1234-5678', ageBand: '30~34세', gender: 'male' } }),
    ).toBe(false);
  });

  it('is true when phoneNumber/ageBand/occupation are non-empty and gender is a valid choice', () => {
    expect(
      isProfileComplete({
        unsafeMetadata: {
          phoneNumber: '010-1234-5678',
          ageBand: '30~34세',
          gender: 'unspecified',
          occupation: '회사원/직장인',
        },
      }),
    ).toBe(true);
  });
});
