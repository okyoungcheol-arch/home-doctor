import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

export const PROTECTED_ROUTE_PATTERNS = [
  '/admin(.*)',
  '/api/admin(.*)',
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
