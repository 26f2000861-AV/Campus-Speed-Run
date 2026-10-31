// Campus Pulse+ wordmark. The plus sits raised after "Pulse" like a superscript;
// it breathes slowly at rest and turns a quarter on hover (see .logo-plus in globals.css).

const SIZES = {
  sm: { text: 'text-[15px]', plus: 9, gap: 'ml-[2px] -mt-2' },
  md: { text: 'text-lg', plus: 11, gap: 'ml-[3px] -mt-2.5' },
  xl: { text: 'text-5xl sm:text-7xl', plus: 26, gap: 'ml-1 -mt-3 sm:-mt-4' },
} as const;

export function PlusGlyph({ size = 12, idle = true, className = '' }: { size?: number; idle?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} aria-hidden="true">
      <g className={`logo-plus ${idle ? 'logo-plus-idle' : ''}`}>
        <rect x="5" y="0" width="2" height="12" rx="1" fill="currentColor" />
        <rect x="0" y="5" width="12" height="2" rx="1" fill="currentColor" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 'md', className = '' }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-start font-semibold tracking-[-0.045em] text-fg leading-none ${s.text} ${className}`}>
      <span>Campus Pulse</span>
      <PlusGlyph size={s.plus} className={`shrink-0 ${s.gap}`} />
      <span className="sr-only">+</span>
    </span>
  );
}

/** Square app mark: used where the wordmark does not fit (collapsed sidebar, favicon). */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-fg text-ink-950 ${className}`}
      aria-hidden="true"
    >
      <PlusGlyph size={12} idle={false} />
    </span>
  );
}
