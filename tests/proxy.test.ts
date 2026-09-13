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
    // Asserted individually rather than via a single `not.toEqual(arrayContaining([...]))` —
    // that form only fails when ALL listed patterns are present simultaneously, so it would
    // silently pass even if 8 of these 9 routes were accidentally re-protected.
    const unprotectedPatterns = [
      '/dashboard(.*)',
      '/complete-profile(.*)',
      '/api/records(.*)',
      '/api/dashboard(.*)',
      '/api/triage(.*)',
      '/api/specialists(.*)',
      '/api/interview(.*)',
      '/api/synthesize(.*)',
      '/api/transcribe(.*)',
    ];
    for (const pattern of unprotectedPatterns) {
      expect(PROTECTED_ROUTE_PATTERNS).not.toContain(pattern);
    }
  });
});
