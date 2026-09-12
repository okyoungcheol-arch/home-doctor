import { describe, it, expect } from 'vitest';
import { PROTECTED_ROUTE_PATTERNS } from '@/proxy';

describe('PROTECTED_ROUTE_PATTERNS', () => {
  it('keeps protecting the existing member/manager/admin routes', () => {
    expect(PROTECTED_ROUTE_PATTERNS).toEqual(
      expect.arrayContaining([
        '/dashboard(.*)',
        '/admin(.*)',
        '/complete-profile(.*)',
        '/api/records(.*)',
        '/api/dashboard(.*)',
        '/api/admin(.*)',
      ]),
    );
  });

  it('now protects the AI interview API routes that used to allow anonymous guests', () => {
    expect(PROTECTED_ROUTE_PATTERNS).toEqual(
      expect.arrayContaining([
        '/api/triage(.*)',
        '/api/specialists(.*)',
        '/api/interview(.*)',
        '/api/synthesize(.*)',
        '/api/transcribe(.*)',
      ]),
    );
  });
});
