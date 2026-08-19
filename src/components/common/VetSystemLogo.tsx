'use client';

import { cn } from '@/lib/utils';

// ── Paw + EKG icon ─────────────────────────────────────────────────────────────
// Geometric paw print with a heartbeat (P-QRS-T) line in the main pad.
// All EKG points validated inside the ellipse (cx=40,cy=56,rx=16,ry=11).

export function VetSystemIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-label="VetSystem"
    >
      <rect width="80" height="80" rx="18" fill="#0f7d6e" />
      {/* Toe pads — symmetric around cx=40 */}
      <ellipse cx="18" cy="40" rx="7"   ry="5.5" fill="white" />
      <ellipse cx="30" cy="27" rx="7.5" ry="5.5" fill="white" />
      <ellipse cx="50" cy="27" rx="7.5" ry="5.5" fill="white" />
      <ellipse cx="62" cy="40" rx="7"   ry="5.5" fill="white" />
      {/* Main metacarpal pad */}
      <ellipse cx="40" cy="56" rx="16"  ry="11"  fill="white" />
      {/* EKG heartbeat — P wave → QRS complex → T wave */}
      <polyline
        points="24,56 31,56 33,51 35,56 38,47 40,65 43,54 47,56 56,56"
        fill="none"
        stroke="#0f7d6e"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Wordmark (weight-contrast 800 / 200) ───────────────────────────────────────

export function VetSystemWordmark({
  size = 'base',
  className,
}: {
  size?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  className?: string;
}) {
  const sizeClass = {
    sm:  'text-sm',
    base:'text-base',
    lg:  'text-lg',
    xl:  'text-xl',
    '2xl':'text-2xl',
  }[size];

  return (
    <span className={cn('inline-flex items-baseline leading-none', sizeClass, className)}>
      <span className="font-extrabold text-primary   tracking-[0.01em]">Vet</span>
      <span className="font-extralight text-foreground tracking-[-0.01em]">System</span>
    </span>
  );
}

// ── Combination mark (icon + wordmark, horizontal) ────────────────────────────

export function VetSystemLogo({
  iconSize = 36,
  textSize = 'base',
  gap = 'gap-2.5',
  className,
}: {
  iconSize?: number;
  textSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  gap?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center', gap, className)}>
      <VetSystemIcon size={iconSize} />
      <VetSystemWordmark size={textSize} />
    </span>
  );
}

// ── Paw-print tiling backgrounds ───────────────────────────────────────────────
// Two offset paws per tile, simulating alternating footsteps.

// For use on teal/dark backgrounds (white paws)
export const PAW_BG_WHITE: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 76'%3E%3Cg fill='white' opacity='0.08'%3E%3Cellipse cx='15' cy='19' rx='2.8' ry='2.2'/%3E%3Cellipse cx='19' cy='14' rx='3' ry='2.2'/%3E%3Cellipse cx='25' cy='14' rx='3' ry='2.2'/%3E%3Cellipse cx='29' cy='19' rx='2.8' ry='2.2'/%3E%3Cellipse cx='22' cy='28' rx='6.5' ry='4.5'/%3E%3Cellipse cx='65' cy='57' rx='2.8' ry='2.2'/%3E%3Cellipse cx='69' cy='52' rx='3' ry='2.2'/%3E%3Cellipse cx='75' cy='52' rx='3' ry='2.2'/%3E%3Cellipse cx='79' cy='57' rx='2.8' ry='2.2'/%3E%3Cellipse cx='72' cy='66' rx='6.5' ry='4.5'/%3E%3C/g%3E%3C/svg%3E\")",
  backgroundSize: '100px 76px',
};

// For use on light/muted backgrounds (teal paws)
export const PAW_BG_TEAL: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 76'%3E%3Cg fill='%230f7d6e' opacity='0.07'%3E%3Cellipse cx='15' cy='19' rx='2.8' ry='2.2'/%3E%3Cellipse cx='19' cy='14' rx='3' ry='2.2'/%3E%3Cellipse cx='25' cy='14' rx='3' ry='2.2'/%3E%3Cellipse cx='29' cy='19' rx='2.8' ry='2.2'/%3E%3Cellipse cx='22' cy='28' rx='6.5' ry='4.5'/%3E%3Cellipse cx='65' cy='57' rx='2.8' ry='2.2'/%3E%3Cellipse cx='69' cy='52' rx='3' ry='2.2'/%3E%3Cellipse cx='75' cy='52' rx='3' ry='2.2'/%3E%3Cellipse cx='79' cy='57' rx='2.8' ry='2.2'/%3E%3Cellipse cx='72' cy='66' rx='6.5' ry='4.5'/%3E%3C/g%3E%3C/svg%3E\")",
  backgroundSize: '100px 76px',
};
