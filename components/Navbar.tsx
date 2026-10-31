'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, homePathForRole } from '@/lib/auth-context';
import { LogOut, LayoutDashboard, UserCheck } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    router.push('/');
    router.refresh();
  };

  const linkCls = (href: string) =>
    `px-2 py-1 rounded-md transition-colors hover:text-white ${
      pathname === href ? 'text-white' : 'text-slate-400'
    }`;

  const isStudent = user?.role === 'STUDENT';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0" aria-label="Campus Speedrun home">
          <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-950 flex items-center justify-center" aria-hidden="true">
            <span className="font-serif italic font-bold text-sm">C</span>
          </span>
          <span className="hidden sm:inline font-serif text-lg tracking-tight text-slate-100 group-hover:text-white">
            Campus Speedrun
          </span>
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2 sm:gap-x-4 text-xs uppercase tracking-wider font-semibold">
          {(!user || isStudent) && (
            <Link href="/student/submit" className={linkCls('/student/submit')}>
              File Report
            </Link>
          )}
          <Link href="/track" className={linkCls('/track')}>
            Track
          </Link>

          {loading ? (
            <div className="h-8 w-20 rounded-full bg-slate-800 animate-pulse ml-1" aria-hidden="true" />
          ) : user ? (
            <div className="flex items-center gap-2 ml-1">
              <Link
                href={isStudent ? '/dashboard' : homePathForRole(user.role)}
                aria-current={pathname === '/dashboard' ? 'page' : undefined}
                aria-label={isStudent ? 'My Reports' : 'Dashboard'}
                className="px-3 sm:px-3.5 py-1.5 min-h-[32px] rounded-full bg-slate-100 text-slate-950 hover:bg-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{isStudent ? 'My Reports' : 'Dashboard'}</span>
              </Link>
              <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs">
                <UserCheck className="w-3 h-3" aria-hidden="true" />
                <span>{user.role}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 rounded-full border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="btn-secondary ml-1 px-4 py-1.5 min-h-[32px]"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
