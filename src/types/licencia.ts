// ─── License and local session types ─────────────────────────────────────────

export type LicenseMode =
  | 'normal'             // 0–6 days offline, active subscription
  | 'advertencia_suave'  // 7–14 days offline
  | 'advertencia_fuerte' // 15–29 days offline
  | 'solo_lectura'       // 30–44 days offline
  | 'bloqueado'          // 45+ days offline / clock tampered
  | 'vencida';           // expirationDate passed (detected online)

export type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'trial';

/** All app modules that can be individually gated per user */
export type ModuloApp =
  | 'pacientes'
  | 'agenda'
  | 'consultas'
  | 'ventas'
  | 'inventario'
  | 'finanzas'
  | 'facturas'
  | 'servicios';

/** Per-module access flags. `master` and `admin` bypass this entirely. */
export type PermisosModulos = Record<ModuloApp, boolean>;

/** Roles in the system (ordered by privilege) */
export type RolUsuario = 'master' | 'admin' | 'veterinario' | 'recepcion';

/**
 * Single record in Dexie (id = 'singleton').
 * Created on login and refreshed whenever there is a connection.
 */
export interface SessionLocal {
  id: 'singleton';
  uid:            string;
  email:          string;
  clinicId:       string;
  clinicName:     string;
  clinicLogoUrl?: string;
  clinicTel?:     string;
  userTel?:       string;
  userName:       string;
  role:           RolUsuario;
  /** null = full access (master / admin). Defined = custom module restrictions. */
  permisos:       PermisosModulos | null;
  plan:           string;
  expirationDate: string; // YYYY-MM-DD
  /** true = active/trial, false = expired/suspended */
  subscription:   boolean;
  /** Timestamp (ms) of the last time we validated with Firebase (online) */
  lastSync:       number;
  /** Timestamp (ms) of when this record was saved locally */
  cachedAt:       number;
  /** true = demo mode — no Firebase, data isolated under clinicId 'demo' */
  isDemo?:        boolean;
}

export interface LicenseInfo {
  modo:           LicenseMode;
  diasOffline:    number;
  diasParaVencer: number | null; // null if already expired or not applicable
  session:        SessionLocal | null;
}
