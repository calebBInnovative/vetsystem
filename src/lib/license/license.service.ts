import type { SessionLocal, LicenseMode, LicenseInfo } from '@/types/license';

// ─── Day thresholds ───────────────────────────────────────────────────────────

const DIAS_ADVERTENCIA_SUAVE  =  7;
const DIAS_ADVERTENCIA_FUERTE = 15;
const DIAS_SOLO_LECTURA       = 30;
const DIAS_BLOQUEADO          = 45;

// ─── Main logic ───────────────────────────────────────────────────────────────

/**
 * Calculates the license mode based on the locally cached session.
 * This function runs OFFLINE — makes no network calls.
 *
 * Clock anti-tamper:
 *   If Date.now() < session.cachedAt the clock was manually set back.
 *   We treat the delta as the worst-case offline days.
 */
export function calcularLicencia(session: SessionLocal | null): LicenseInfo {
  if (!session) {
    return { modo: 'bloqueado', diasOffline: 0, diasParaVencer: null, session: null };
  }

  const ahora = Date.now();

  // ── Anti-tamper: clock set back ───────────────────────────────────────────
  if (ahora < session.cachedAt) {
    return { modo: 'bloqueado', diasOffline: -1, diasParaVencer: null, session };
  }

  // ── Subscription inactive (detected at last online sync) ─────────────────
  if (session.subscription === false) {
    return { modo: 'vencida', diasOffline: 0, diasParaVencer: 0, session };
  }

  // ── Days since last successful sync ──────────────────────────────────────
  const diasOffline = Math.floor((ahora - session.lastSync) / 86_400_000);

  // ── Days until subscription expires ──────────────────────────────────────
  const hoyStr        = new Date(ahora).toISOString().slice(0, 10);
  const diasParaVencer = Math.ceil(
    (new Date(session.expirationDate).getTime() - new Date(hoyStr).getTime()) / 86_400_000,
  );

  // ── If subscription expired by date ──────────────────────────────────────
  if (diasParaVencer < 0) {
    return { modo: 'vencida', diasOffline, diasParaVencer, session };
  }

  // ── Mode based on days offline ────────────────────────────────────────────
  let modo: LicenseMode = 'normal';
  if (diasOffline >= DIAS_BLOQUEADO)               modo = 'bloqueado';
  else if (diasOffline >= DIAS_SOLO_LECTURA)        modo = 'solo_lectura';
  else if (diasOffline >= DIAS_ADVERTENCIA_FUERTE)  modo = 'advertencia_fuerte';
  else if (diasOffline >= DIAS_ADVERTENCIA_SUAVE)   modo = 'advertencia_suave';

  return { modo, diasOffline, diasParaVencer, session };
}

/** True if the mode allows writing */
export function puedeEscribir(modo: LicenseMode): boolean {
  return modo === 'normal' || modo === 'advertencia_suave' || modo === 'advertencia_fuerte';
}

/** True if the mode completely blocks the app */
export function estaBloquada(modo: LicenseMode): boolean {
  return modo === 'bloqueado' || modo === 'vencida';
}

// ─── UI messages ──────────────────────────────────────────────────────────────

export const LICENSE_MESSAGES: Record<LicenseMode, { titulo: string; desc: string; color: string }> = {
  normal: {
    titulo: '',
    desc:   '',
    color:  '',
  },
  advertencia_suave: {
    titulo: 'Trabajando sin conexión',
    desc:   'Reconéctate pronto para mantener tus datos sincronizados.',
    color:  'amber',
  },
  advertencia_fuerte: {
    titulo: 'Llevas más de 15 días sin conexión',
    desc:   'En 15 días el sistema pasará a modo solo lectura.',
    color:  'orange',
  },
  solo_lectura: {
    titulo: 'Modo solo lectura',
    desc:   'Puedes ver tus datos pero no crear ni editar. Reconéctate para reactivar.',
    color:  'red',
  },
  bloqueado: {
    titulo: 'Sistema bloqueado',
    desc:   'Necesitas conexión a internet para continuar usando el sistema.',
    color:  'red',
  },
  vencida: {
    titulo: 'Suscripción vencida',
    desc:   'Renueva tu suscripción para continuar usando VetSystem.',
    color:  'red',
  },
};

/** @deprecated Use LICENSE_MESSAGES instead */
export const MENSAJES_LICENCIA = LICENSE_MESSAGES;
