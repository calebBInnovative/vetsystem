import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Real screenshots of the app (public/landing/screens/, captured from the demo
 * clinic) framed as a browser window or a phone. Regenerate them whenever the
 * screens change noticeably, so the landing never shows an outdated product.
 */

const SCREENS = '/landing/screens';

export function BrowserFrame({ src, darkSrc, alt, priority = false, className }: {
  /** File name in public/landing/screens/ (1600×1000) */
  src: string;
  /** Optional dark-theme variant, shown when the site is in dark mode */
  darkSrc?: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <span className="flex gap-1.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="mx-auto text-[11px] text-muted-foreground font-mono truncate">vetsystem.app</span>
      </div>
      <Image src={`${SCREENS}/${src}`} alt={alt} width={1600} height={1000} priority={priority}
        sizes="(min-width: 1024px) 720px, 100vw"
        className={cn('w-full h-auto', darkSrc && '[.dark_&]:hidden')} />
      {darkSrc && (
        <Image src={`${SCREENS}/${darkSrc}`} alt={alt} width={1600} height={1000}
          sizes="(min-width: 1024px) 720px, 100vw" className="w-full h-auto hidden [.dark_&]:block" />
      )}
    </div>
  );
}

export function PhoneFrame({ src, alt, priority = false, className }: {
  /** File name in public/landing/screens/ (780×1688) */
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[2.2rem] bg-slate-900 p-2 shadow-2xl shadow-primary/20 ring-1 ring-white/10', className)}>
      <div className="relative rounded-[1.7rem] overflow-hidden bg-background">
        <span className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full bg-slate-900 z-10" aria-hidden />
        <Image src={`${SCREENS}/${src}`} alt={alt} width={780} height={1688} priority={priority}
          sizes="240px" className="w-full h-auto" />
      </div>
    </div>
  );
}
