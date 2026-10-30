import type { BillingPeriod, PlanLimits } from '@/lib/billing/plans';

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
  | 'quotes'
  | 'inventory'
  | 'finances'
  | 'invoices'
  | 'services'
  | 'promotions'
  | 'import';

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
  /**
   * Payment notice set by the platform owner: from this ms timestamp the clinic
   * is asked to pay, regardless of expirationDate. Cleared by a confirmed payment.
   */
  billingNoticeAt?:       number;
  /** true = the app locks until payment; false = dismissible banner */
  billingNoticeBlocking?: boolean;
  /**
   * ms timestamp until which a reported manual payment (transfer / Kash) keeps the
   * clinic working while the platform owner confirms it. Server-written only.
   */
  graceUntil?:            number;
  /**
   * ms timestamp of the last confirmed subscription payment. Cached so the app
   * can show it offline; expirationDate stays the source of truth for access.
   */
  lastPaymentAt?:         number;
  /**
   * Limits of the clinic's plan (users, patients, modules), cached so they are
   * enforced offline. Read through sessionLimits(); absent on old sessions.
   */
  planLimits?:            PlanLimits;
  /** 'monthly' | 'annual' of the last paid period */
  planPeriod?:            BillingPeriod;
}

export interface LicenseInfo {
  mode:             LicenseMode;
  daysOffline:      number;
  daysUntilExpiry:  number | null; // null if already expired or not applicable
  /** true once the platform owner's billing notice time has been reached */
  billingDue:       boolean;
  /** true while a reported manual payment awaits confirmation (provisional access) */
  inGrace:          boolean;
  session:          SessionLocal | null;
}
