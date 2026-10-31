'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';

export default function SiteFooter() {
  const pathname = usePathname();
  // The sign-in screen stays focused on the form.
  if (pathname === '/login') return null;

  return (
    <footer className="relative z-10 border-t border-line bg-ink-950/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 space-y-3">
          <Logo size="sm" />
          <p className="max-w-xs text-fg-muted leading-relaxed">
            Anonymous campus issue reporting with a 72&#8209;hour, three-tier escalation chain.
          </p>
        </div>
        <nav aria-label="Footer" className="space-y-2.5">
          <h2 className="cs-label text-fg">Product</h2>
          <ul className="space-y-2 text-fg-muted">
            <li>
              <Link href="/student/submit" className="hover:text-fg transition-colors">
                Report an issue
              </Link>
            </li>
            <li>
              <Link href="/track" className="hover:text-fg transition-colors">
                Track a complaint
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-fg transition-colors">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
        <div className="space-y-2.5">
          <h2 className="cs-label text-fg">Guarantees</h2>
          <ul className="space-y-2 text-fg-muted">
            <li>Anonymous to all staff</li>
            <li>72&#8209;hour response window</li>
            <li>Teacher → Faculty → Admin</li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 border-t border-line text-xs text-fg-muted">
        &copy; {new Date().getFullYear()} Campluse
      </div>
    </footer>
  );
}
