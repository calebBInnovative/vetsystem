// ─── License and local session types ─────────────────────────────────────────

export type LicenseMode =
  | 'normal'          // 0–6 days offline, active subscription
  | 'soft_warning'    // 7–14 days offline
  | 'hard_warning'    // 15–29 days offline
  | 'read_only'       // 30–44 days offline
  | 'blocked'         // 45+ days offline / clock tampered
  | 'expired';        // expirationDate passed (detected online)

export type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'trial';

/** All app modules that can be individually gated per user */
export type AppModule =
  | 'patients'
  | 'schedule'
  | 'consultations'
  | 'sales'
  | 'inventory'
  | 'finances'
  | 'invoices'
  | 'services'
  | 'promotions';

/** Per-module access flags. `master` and `admin` bypass this entirely. */
export type Permissions = Record<AppModule, boolean>;

/** Roles in the system (ordered by privilege) */
export type UserRole = 'master' | 'admin' | 'veterinarian' | 'reception';

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
  role:           UserRole;
  /** null = full access (master / admin). Defined = custom module restrictions. */
  permissions:    Permissions | null;
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
  /**
   * false = Google-signup user who hasn't completed the clinic setup form yet.
   * undefined / true = setup done (including all email/password users).
   */
  setupComplete?: boolean;
}

export interface LicenseInfo {
  mode:             LicenseMode;
  daysOffline:      number;
  daysUntilExpiry:  number | null; // null if already expired or not applicable
  session:          SessionLocal | null;
}
