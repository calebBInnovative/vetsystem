import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Floating action button for the installed phone app: the screen's main action,
 * above the bottom tab bar. Hidden everywhere else (the page keeps its own button).
 */
export function Fab({ href, onClick, icon: Icon, label, className }: {
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  label: string;
  className?: string;
}) {
  const classes = cn(
    'hidden app:flex fixed right-4 z-30 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]',
    'h-14 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-primary-foreground font-semibold shadow-lg shadow-primary/30',
    'active:scale-95 transition-transform print:hidden',
    className,
  );
  const content = (<><Icon size={22} /> {label}</>);
  return (
    <>
      {/* Room at the end of the page, so the last card can scroll above the button */}
      <div aria-hidden className="hidden app:block h-16" />
      {href
        ? <Link href={href} className={classes}>{content}</Link>
        : <button type="button" onClick={onClick} className={classes}>{content}</button>}
    </>
  );
}
