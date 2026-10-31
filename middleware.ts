import { NextRequest, NextResponse } from 'next/server';

// Contract B: pages that require a session. This is a presence check only;
// every API route still verifies the token server-side via lib/server-auth.
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
  matcher: ['/student/submit/:path*', '/dashboard/:path*'],
};
