import { NextRequest, NextResponse } from 'next/server';

// Contract B: pages that require an authenticated session.
// /student/submit allows guest submissions (untracked); /dashboard requires an active session.
export function middleware(req: NextRequest) {
  if (!req.cookies.get('csr_access')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
