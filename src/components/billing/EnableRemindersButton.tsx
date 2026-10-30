'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  PUSH_SETUP_MESSAGES, PUSH_SUPPORTED_KEY, enableClinicPush, needsHomeScreenInstall,
} from '@/lib/billing/manual-payments';
import { cn } from '@/lib/utils';

/**
 * Lets a clinic user receive expiry reminders on this device. Hidden in demo
 * mode and when push is not configured; refreshes the token silently once
 * permission was granted, because FCM tokens rotate.
 */
export function EnableRemindersButton({ variant = 'button' }: { variant?: 'button' | 'strip' }) {
  const { session } = useAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'on'>('idle');
  const clinicId = session?.isDemo ? null : session?.clinicId;
  const uid = session?.uid;

  useEffect(() => {
    if (!clinicId || !uid || !PUSH_SUPPORTED_KEY) return;
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      enableClinicPush(clinicId, uid).then((r) => { if (r === 'enabled') setState('on'); }).catch(() => {});
    } catch { /* ignore */ }
  }, [clinicId, uid]);

  if (!clinicId || !uid || !PUSH_SUPPORTED_KEY) return null;

  async function enable() {
    if (needsHomeScreenInstall()) {
      toast.info('En iPhone: toca Compartir → "Añadir a pantalla de inicio", abre VetSystem desde el ícono y activa los avisos ahí.', { duration: 12_000 });
      return;
    }
    setState('busy');
    try {
      const result = await enableClinicPush(clinicId!, uid!);
      (result === 'enabled' ? toast.success : toast.error)(
        result === 'enabled' ? 'Listo: te avisaremos aquí antes de que venza tu suscripción.' : PUSH_SETUP_MESSAGES[result],
      );
      setState(result === 'enabled' ? 'on' : 'idle');
    } catch (err) {
      console.error('[reminders] push setup failed:', err);
      toast.error('No se pudieron activar los avisos');
      setState('idle');
    }
  }

  if (variant === 'strip') {
    if (state === 'on') return null;
    return (
      <button type="button" onClick={enable} disabled={state === 'busy'}
        className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-lg bg-current/10 hover:bg-current/20 font-medium text-xs transition-colors disabled:opacity-60">
        {state === 'busy' ? <Loader2 size={11} className="animate-spin" /> : <Bell size={11} />} Avisarme
      </button>
    );
  }

  return (
    <button type="button" onClick={enable} disabled={state === 'busy' || state === 'on'}
      className={cn('w-full inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-80',
        state === 'on' ? 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400' : 'border-border hover:bg-muted')}>
      {state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : state === 'on' ? <BellRing size={14} /> : <Bell size={14} />}
      {state === 'on' ? 'Avisos activos en este dispositivo' : 'Activar avisos en este dispositivo'}
    </button>
  );
}
