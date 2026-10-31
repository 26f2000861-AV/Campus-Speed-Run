'use client';

import { usePathname } from 'next/navigation';
import ParticleField from '@/components/ParticleField';

/**
 * One persistent particle field for the whole site (no re-init between routes).
 * Brand surfaces (home, sign-in) get the full field; working screens get a dim
 * band behind the header that fades out before the content starts.
 */
export default function SiteBackdrop() {
  const pathname = usePathname();
  const hero = pathname === '/' || pathname === '/login';

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{
          opacity: hero ? 1 : 0.32,
          maskImage: hero ? undefined : 'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.5) 35%, transparent 70%)',
          WebkitMaskImage: hero ? undefined : 'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.5) 35%, transparent 70%)',
        }}
      >
        <ParticleField className="absolute inset-0" mode={hero ? 'hero' : 'ambient'} />
      </div>
      {/* Soft ambient light behind the field and an edge vignette for depth. */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgba(139,155,180,0.10),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(140%_100%_at_50%_0%,transparent_55%,rgba(8,9,11,0.6)_100%)]" />
    </div>
  );
}
