import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig } from './lib/config';

export async function middleware(request: NextRequest) {
  // Skip middleware for setup page, API routes, and static files
  if (
    request.nextUrl.pathname.startsWith('/setup') ||
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }

  try {
    // Check if configuration exists
    const config = await readConfig();
    
    if (!config.webhookUrl || !config.departmentName) {
      // Redirect to setup page if not configured
      return NextResponse.redirect(new URL('/setup', request.url));
    }
  } catch (error) {
    console.error('Middleware error:', error);
    // In case of error, redirect to setup
    return NextResponse.redirect(new URL('/setup', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - setup (setup page)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|setup).*)',
  ],
};