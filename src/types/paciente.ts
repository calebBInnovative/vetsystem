// ─────────────────────────────────────────────────────────────────────────────
// TIPOS BASE — Módulo Pacientes
// Usados tanto en Dexie (local) como en Firestore (cloud)
// ─────────────────────────────────────────────────────────────────────────────

/** Especies soportadas por el sistema */
export type Especie = 'perro' | 'gato' | 'ave' | 'conejo' | 'reptil' | 'otro';

/** Sexo biológico de la mascota */
export type Sexo = 'macho' | 'hembra';

/**
 * Estado de sincronización de un registro local.
 * - `synced`   → está igual en Firestore
 * - `pending`  → tiene cambios locales sin subir
 * - `conflict` → hay diferencias entre local y cloud (requiere resolución)
 */
export type SyncStatus = 'synced' | 'pending' | 'conflict';

// ─────────────────────────────────────────────────────────────────────────────
// SYNC META
// Campos que lleva CADA entidad local para gestionar la sincronización.
// Se separan en su propia interface para reutilizarlos en otros módulos.
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncMeta {
  /** Estado actual frente a Firestore */
  syncStatus: SyncStatus;
  /** Timestamp local de la última modificación (ms desde epoch) */
  updatedAt: number;
  /** Timestamp de la última vez que se sincronizó con Firestore */
  cloudUpdatedAt?: number;
  /**
   * Soft delete: si tiene valor, el registro está borrado lógicamente.
   * Nunca se borra físico de Dexie para poder sincronizar la eliminación.
   */
  deletedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DUEÑO
// ─────────────────────────────────────────────────────────────────────────────

/** Datos puros del dueño (sin meta de sync) — espejo del schema de Firestore */
export interface Dueno {
  id: string;
  nombre: string;
  /** Número principal de contacto — también se usa para WhatsApp */
  telefono: string;
  email?: string;
  direccion?: string;
  notas?: string;
  clinicaId: string;
  creadoEn: number;
}

/** Dueño tal como se almacena en Dexie (incluye campos de sync) */
export interface DuenoLocal extends Dueno, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// PACIENTE
// ─────────────────────────────────────────────────────────────────────────────

/** Datos puros del paciente — espejo del schema de Firestore */
export interface Paciente {
  id: string;
  nombre: string;
  especie: Especie;
  raza?: string;
  sexo: Sexo;
  /** ISO 8601 date string: "YYYY-MM-DD" */
  fechaNacimiento?: string;
  /** Peso en kilogramos */
  peso?: number;
  color?: string;
  /** URL de foto (Firebase Storage en producción, base64 en offline) */
  fotoUrl?: string;
  /** Referencia al dueño — FK hacia la tabla `duenos` */
  duenoId: string;
  activo: boolean;
  notas?: string;
  clinicaId: string;
  creadoEn: number;
}

/** Paciente tal como se almacena en Dexie (incluye campos de sync) */
export interface PacienteLocal extends Paciente, SyncMeta {}

/**
 * Paciente con su dueño ya unido (join en memoria).
 * Usado para renderizado en listas y fichas sin queries adicionales.
 */
export interface PacienteConDueno extends PacienteLocal {
  dueno?: DuenoLocal;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE UI
// Centraliza labels y emojis para no duplicarlos en formularios y cards.
// ─────────────────────────────────────────────────────────────────────────────

export const ESPECIES: Record<Especie, { label: string; emoji: string }> = {
  perro:  { label: 'Perro',  emoji: '🐕' },
  gato:   { label: 'Gato',   emoji: '🐈' },
  ave:    { label: 'Ave',    emoji: '🐦' },
  conejo: { label: 'Conejo', emoji: '🐇' },
  reptil: { label: 'Reptil', emoji: '🦎' },
  otro:   { label: 'Otro',   emoji: '🐾' },
};

export const SEXOS: Record<Sexo, { label: string; simbolo: string }> = {
  macho:  { label: 'Macho',  simbolo: '♂' },
  hembra: { label: 'Hembra', simbolo: '♀' },
};
