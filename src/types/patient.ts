// ─────────────────────────────────────────────────────────────────────────────
// BASE TYPES — Patients Module
// Used in both Dexie (local) and Firestore (cloud)
// ─────────────────────────────────────────────────────────────────────────────

/** Species supported by the system */
export type PetSpecies = 'dog' | 'cat' | 'bird' | 'rabbit' | 'reptile' | 'other';

/** Biological sex of the pet */
export type PetSex = 'male' | 'female';

/**
 * Sync state of a local record.
 * - `synced`   → matches Firestore
 * - `pending`  → has local changes not yet uploaded
 * - `conflict` → differences between local and cloud (requires resolution)
 */
export type SyncStatus = 'synced' | 'pending' | 'conflict';

// ─────────────────────────────────────────────────────────────────────────────
// SYNC META
// Fields carried by EVERY local entity to manage synchronization.
// Separated into its own interface for reuse across modules.
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncMeta {
  /** Current state against Firestore */
  syncStatus: SyncStatus;
  /** Local timestamp of the last modification (ms since epoch) */
  updatedAt: number;
  /** Timestamp of the last successful sync with Firestore */
  cloudUpdatedAt?: number;
  /**
   * Soft delete: if set, the record is logically deleted.
   * Never physically removed from Dexie so the deletion can be synced.
   */
  deletedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNER
// ─────────────────────────────────────────────────────────────────────────────

/** Pure owner data (without sync meta) — mirrors the Firestore schema */
export interface Owner {
  id: string;
  name: string;
  /** Primary contact number — also used for WhatsApp */
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  clinicId: string;
  createdAt: number;
}

/** Owner as stored in Dexie (includes sync fields) */
export interface OwnerLocal extends Owner, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT
// ─────────────────────────────────────────────────────────────────────────────

/** Pure patient data — mirrors the Firestore schema */
export interface Patient {
  id: string;
  name: string;
  species: PetSpecies;
  breed?: string;
  sex: PetSex;
  /** ISO 8601 date string: "YYYY-MM-DD" */
  birthDate?: string;
  /** Weight in kilograms */
  weight?: number;
  color?: string;
  /** Photo URL (Firebase Storage in production, base64 offline) */
  photoUrl?: string;
  /** Reference to the owner — FK to the `owners` table */
  ownerId: string;
  active: boolean;
  notes?: string;
  clinicId: string;
  createdAt: number;
}

/** Patient as stored in Dexie (includes sync fields) */
export interface PatientLocal extends Patient, SyncMeta {}

/**
 * Patient with its owner already joined (in-memory join).
 * Used for rendering in lists and cards without extra queries.
 */
export interface PatientWithOwner extends PatientLocal {
  owner?: OwnerLocal;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI CONSTANTS
// Centralises labels and emojis to avoid duplication in forms and cards.
// ─────────────────────────────────────────────────────────────────────────────

export const PET_SPECIES: Record<PetSpecies, { label: string; emoji: string }> = {
  dog:     { label: 'Perro',  emoji: '🐕' },
  cat:     { label: 'Gato',   emoji: '🐈' },
  bird:    { label: 'Ave',    emoji: '🐦' },
  rabbit:  { label: 'Conejo', emoji: '🐇' },
  reptile: { label: 'Reptil', emoji: '🦎' },
  other:   { label: 'Otro',   emoji: '🐾' },
};

export const PET_SEXES: Record<PetSex, { label: string; symbol: string }> = {
  male:   { label: 'Macho',  symbol: '♂' },
  female: { label: 'Hembra', symbol: '♀' },
};
