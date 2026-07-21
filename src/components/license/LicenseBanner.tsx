'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LICENSE_MESSAGES, estaBloquada } from '@/lib/license/license.service';
import { WifiOff, AlertTriangle, Lock, CreditCard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LicenseMode } from '@/types/license';

const ICONS: Partial<Record<LicenseMode, React.FC<{ size?: number; className?: string }> | null>> = {
  soft_warning: WifiOff,
  hard_warning: AlertTriangle,
  read_only:    Lock,
  blocked:      Lock,
  expired:      CreditCard,
  normal:       null,
};

export function LicenseBanner() {
  const { license } = useAuth();
  const [closed, setClosed] = useState(false);

  const { mode, daysOffline } = license;

  if (mode === 'normal') return null;
  if (closed && (mode === 'soft_warning' || mode === 'hard_warning')) return null;

  const info   = LICENSE_MESSAGES[mode];
  const Icon   = ICONS[mode] ?? null;
  const blocked = estaBloquada(mode);

  const colors: Record<string, string> = {
    amber:  'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300',
    orange: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/40 dark:border-orange-700 dark:text-orange-300',
    red:    'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300',
  };

  // Blocking banner — covers the entire screen
  if (blocked) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="max-w-sm mx-4 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            {Icon && <Icon size={28} className="text-destructive" />}
          </div>
          <h2 className="text-xl font-bold">{info.titulo}</h2>
          <p className="text-muted-foreground text-sm">{info.desc}</p>
          {daysOffline === -1 && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
              Se detectó una modificación en la fecha del sistema.
            </p>
          )}
          {mode === 'expired' && (
            <a
              href="mailto:soporte@vetsystem.app"
              className="inline-block mt-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium"
            >
              Renovar suscripción
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            Conéctate a internet para continuar.
          </p>
        </div>
      </div>
    );
  }

  // Warning banner — top strip
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2.5 border-b text-sm',
      colors[info.color],
    )}>
      {Icon && <Icon size={14} className="shrink-0" />}
      <div className="flex-1 min-w-0">
        <span className="font-medium">{info.titulo}</span>
        {' — '}
        <span className="opacity-80">{info.desc}</span>
        {daysOffline > 0 && (
          <span className="ml-2 text-xs opacity-60">({daysOffline} días offline)</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setClosed(true)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Wrapper that disables interactions when mode is read_only.
 * Use around forms or action buttons.
 */
export function ReadOnlyGuard({ children }: { children: React.ReactNode }) {
  const { license } = useAuth();

  if (license.mode !== 'read_only') return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-50">{children}</div>
      <div className="absolute inset-0 cursor-not-allowed" title="Modo solo lectura activo" />
    </div>
  );
}
