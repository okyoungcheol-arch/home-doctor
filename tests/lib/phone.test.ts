import { describe, it, expect } from 'vitest';
import { formatPhoneNumber, normalizePhoneNumber } from '@/lib/phone';

describe('formatPhoneNumber', () => {
  it('formats a full 11-digit number as ###-####-####', () => {
    expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
  });

  it('formats partial input progressively as the user types', () => {
    expect(formatPhoneNumber('010')).toBe('010');
    expect(formatPhoneNumber('0101')).toBe('010-1');
    expect(formatPhoneNumber('01012345')).toBe('010-1234-5');
  });

  it('strips non-digit characters before formatting', () => {
    expect(formatPhoneNumber('010-1234-5678')).toBe('010-1234-5678');
    expect(formatPhoneNumber('010 1234 5678')).toBe('010-1234-5678');
  });

  it('truncates input beyond 11 digits', () => {
    expect(formatPhoneNumber('010123456789999')).toBe('010-1234-5678');
  });

  it('returns an empty string for empty input', () => {
    expect(formatPhoneNumber('')).toBe('');
  });
});

describe('normalizePhoneNumber', () => {
  it('strips hyphens', () => {
    expect(normalizePhoneNumber('010-1234-5678')).toBe('01012345678');
  });

  it('strips all non-digit characters', () => {
    expect(normalizePhoneNumber('010 1234-5678')).toBe('01012345678');
  });

  it('is a no-op for already-normalized input', () => {
    expect(normalizePhoneNumber('01012345678')).toBe('01012345678');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizePhoneNumber('')).toBe('');
  });
});
