import { describe, it, expect } from 'vitest';
import { PROTECTED_ROUTE_PATTERNS } from '@/proxy';

describe('PROTECTED_ROUTE_PATTERNS', () => {
  it('protects only admin routes', () => {
    expect(PROTECTED_ROUTE_PATTERNS).toEqual([
      '/admin(.*)',
      '/api/admin(.*)',
    ]);
  });

  it('does not protect dashboard, profile, records, or AI interview routes', () => {
    expect(PROTECTED_ROUTE_PATTERNS).not.toEqual(
      expect.arrayContaining([
        '/dashboard(.*)',
        '/complete-profile(.*)',
        '/api/records(.*)',
        '/api/dashboard(.*)',
        '/api/triage(.*)',
        '/api/specialists(.*)',
        '/api/interview(.*)',
        '/api/synthesize(.*)',
        '/api/transcribe(.*)',
      ]),
    );
  });
});
