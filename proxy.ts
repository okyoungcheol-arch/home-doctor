import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

export const PROTECTED_ROUTE_PATTERNS = [
  '/dashboard(.*)',
  '/admin(.*)',
  '/complete-profile(.*)',
  '/api/records(.*)',
  '/api/dashboard(.*)',
  '/api/admin(.*)',
  // Guest mode no longer exists (see docs/superpowers/specs/2026-09-12-onboarding-profile-design.md
  // §2) — these AI interview routes used to allow anonymous calls on purpose; now every caller
  // must be signed in.
  '/api/triage(.*)',
  '/api/specialists(.*)',
  '/api/interview(.*)',
  '/api/synthesize(.*)',
  '/api/transcribe(.*)',
];

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTE_PATTERNS);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
