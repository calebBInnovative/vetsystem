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
export function calculateLicense(session: SessionLocal | null): LicenseInfo {
  if (!session) {
    return { mode: 'blocked', daysOffline: 0, daysUntilExpiry: null, session: null };
  }

  const now = Date.now();

  // ── Anti-tamper: clock set back ───────────────────────────────────────────
  if (now < session.cachedAt) {
    return { mode: 'blocked', daysOffline: -1, daysUntilExpiry: null, session };
  }

  // ── Subscription inactive (detected at last online sync) ─────────────────
  if (session.subscription === false) {
    return { mode: 'expired', daysOffline: 0, daysUntilExpiry: 0, session };
  }

  // ── Days since last successful sync ──────────────────────────────────────
  const daysOffline = Math.floor((now - session.lastSync) / 86_400_000);

  // ── Days until subscription expires ──────────────────────────────────────
  const todayStr      = new Date(now).toISOString().slice(0, 10);
  const daysUntilExpiry = Math.ceil(
    (new Date(session.expirationDate).getTime() - new Date(todayStr).getTime()) / 86_400_000,
  );

  // ── If subscription expired by date ──────────────────────────────────────
  if (daysUntilExpiry < 0) {
    return { mode: 'expired', daysOffline, daysUntilExpiry, session };
  }

  // ── Mode based on days offline ────────────────────────────────────────────
  let mode: LicenseMode = 'normal';
  if (daysOffline >= DIAS_BLOQUEADO)               mode = 'blocked';
  else if (daysOffline >= DIAS_SOLO_LECTURA)        mode = 'read_only';
  else if (daysOffline >= DIAS_ADVERTENCIA_FUERTE)  mode = 'hard_warning';
  else if (daysOffline >= DIAS_ADVERTENCIA_SUAVE)   mode = 'soft_warning';

  return { mode, daysOffline, daysUntilExpiry, session };
}

/** @deprecated Use calculateLicense instead */
export const calcularLicencia = calculateLicense;

/** True if the mode allows writing */
export function puedeEscribir(mode: LicenseMode): boolean {
  return mode === 'normal' || mode === 'soft_warning' || mode === 'hard_warning';
}

/** True if the mode completely blocks the app */
export function estaBloquada(mode: LicenseMode): boolean {
  return mode === 'blocked' || mode === 'expired';
}

// ─── UI messages ──────────────────────────────────────────────────────────────

export const LICENSE_MESSAGES: Record<LicenseMode, { titulo: string; desc: string; color: string }> = {
  normal: {
    titulo: '',
    desc:   '',
    color:  '',
  },
  soft_warning: {
    titulo: 'Trabajando sin conexión',
    desc:   'Reconéctate pronto para mantener tus datos sincronizados.',
    color:  'amber',
  },
  hard_warning: {
    titulo: 'Llevas más de 15 días sin conexión',
    desc:   'En 15 días el sistema pasará a modo solo lectura.',
    color:  'orange',
  },
  read_only: {
    titulo: 'Modo solo lectura',
    desc:   'Puedes ver tus datos pero no crear ni editar. Reconéctate para reactivar.',
    color:  'red',
  },
  blocked: {
    titulo: 'Sistema bloqueado',
    desc:   'Necesitas conexión a internet para continuar usando el sistema.',
    color:  'red',
  },
  expired: {
    titulo: 'Suscripción vencida',
    desc:   'Renueva tu suscripción para continuar usando VetSystem.',
    color:  'red',
  },
};

/** @deprecated Use LICENSE_MESSAGES instead */
export const MENSAJES_LICENCIA = LICENSE_MESSAGES;
