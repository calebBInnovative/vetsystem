import type { BillingPeriod, PlanId, PlanLimits } from '@/lib/billing/plans';

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

/** Per-module access flags. `master`, `admin` and `branch_manager` bypass this entirely. */
export type Permissions = Record<AppModule, boolean>;

/**
 * Sensitive actions a manager grants or withholds per staff member, on top of
 * the modules: the ones a multi-branch owner wants to control and audit.
 */
export type SensitiveAction = 'voidDocuments' | 'giveDiscounts' | 'viewCosts' | 'adjustStock';

/** Missing (profiles from before these existed) = every action allowed, as before. */
export type ActionPermissions = Partial<Record<SensitiveAction, boolean>>;

/** Roles in the system (ordered by privilege) */
export type UserRole = 'master' | 'admin' | 'branch_manager' | 'veterinarian' | 'reception';

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
  /** null = full access (master / admin / branch_manager). Defined = custom module restrictions. */
  permissions:    Permissions | null;
  /** Branches a staff member works in (users/{uid}.branchIds); managers reach every branch. */
  branchIds?:     string[];
  /** Staff only (users/{uid}.actions): sensitive actions; managers may do all of them. */
  actions?:       ActionPermissions;
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
  /**
   * A plan being tried out in the demo or previewed by the platform owner: its
   * limits replace the real ones in sessionLimits(). Device-local, never synced,
   * and ignored for anyone else (it never grants a clinic more than it paid for).
   */
  planPreview?:           { planId: PlanId; name: string; limits: PlanLimits };
  /** The plan the trial is of (license.trialPlan), chosen at sign-up; offered first when paying */
  trialPlan?:             PlanId;
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
