'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Home, LayoutGrid, ShoppingBag, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ThemeSwitcher } from '@/components/themes/ThemeSwitcher';
import { cn } from '@/lib/utils';

export interface MobileNavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

/** The four screens a clinic opens all day; everything else lives under "Más". */
const TABS: MobileNavItem[] = [
  { icon: Home,        label: 'Inicio',    href: '/dashboard' },
  { icon: Calendar,    label: 'Agenda',    href: '/schedule' },
  { icon: ShoppingBag, label: 'Vender',    href: '/sales' },
  { icon: Users,       label: 'Pacientes', href: '/patients' },
];

/**
 * App-mode bottom navigation (installed PWA on a phone). `items` are the menu
 * entries this user may open; tabs the user has no access to are left out.
 */
export function MobileTabBar({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const allowed = new Set(items.map((i) => i.href));
  const tabs = TABS.filter((t) => t.href === '/dashboard' || allowed.has(t.href));
  const tabHrefs = new Set(tabs.map((t) => t.href));
  const more = items.filter((i) => !tabHrefs.has(i.href));
  const isActive = (href: string) => pathname.startsWith(href);
  const moreActive = more.some((i) => isActive(i.href));

  const tabClass = (active: boolean) => cn(
    'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-medium transition-colors',
    active ? 'text-primary' : 'text-muted-foreground active:text-foreground',
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] print:hidden"
        aria-label="Navegación principal"
      >
        <div className="flex">
          {tabs.map(({ icon: Icon, label, href }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary/12')}>
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            );
          })}
          {more.length > 0 && (
            <button type="button" onClick={() => setMoreOpen(true)} className={tabClass(moreActive)}>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-primary/12')}>
                <LayoutGrid size={20} strokeWidth={moreActive ? 2.4 : 2} />
              </span>
              Más
            </button>
          )}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-0 flex-row items-center justify-between pr-12">
            <SheetTitle>Más módulos</SheetTitle>
            <ThemeSwitcher />
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {more.map(({ icon: Icon, label, href }) => (
              <Link key={href} href={href} onClick={() => setMoreOpen(false)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 min-h-20 text-xs font-medium text-center',
                  isActive(href) ? 'border-primary bg-primary/10 text-primary' : 'border-border active:bg-muted',
                )}>
                <Icon size={22} />
                {label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
