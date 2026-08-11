'use client';

import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share2, X } from 'lucide-react';

export function PWAInstallBanner() {
  const { install, dismiss, showBanner, isIOS, canDirectInstall } = usePWAInstall();

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 print:hidden sm:left-auto sm:right-4 sm:w-80">
      <div className="bg-card border border-border rounded-2xl shadow-xl p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
            📱
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Instalar VetSystem</p>

            {isIOS ? (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Toca{' '}
                <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                  <Share2 size={11} className="inline" /> Compartir
                </span>
                {' '}y luego{' '}
                <span className="font-medium text-foreground">&ldquo;Añadir a pantalla de inicio&rdquo;</span>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Instala la app en tu teléfono para acceder rápido, incluso sin internet.
              </p>
            )}

            {canDirectInstall && (
              <button
                onClick={install}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
              >
                <Download size={12} />
                Instalar ahora
              </button>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
