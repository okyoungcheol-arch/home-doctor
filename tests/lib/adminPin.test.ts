import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from '@/lib/server/admins/pin';

describe('admin PIN hashing', () => {
  it('verifies a correct PIN against its own hash', () => {
    const stored = hashPin('7007');
    expect(verifyPin('7007', stored)).toBe(true);
  });

  it('rejects an incorrect PIN', () => {
    const stored = hashPin('7007');
    expect(verifyPin('0000', stored)).toBe(false);
  });

  it('never stores the PIN in plaintext', () => {
    const stored = hashPin('7007');
    expect(stored).not.toContain('7007');
  });

  it('produces a different stored value each time (random salt)', () => {
    expect(hashPin('7007')).not.toEqual(hashPin('7007'));
  });

  it('treats a malformed stored value as a mismatch instead of throwing', () => {
    expect(verifyPin('7007', 'not-a-valid-hash')).toBe(false);
  });
});
