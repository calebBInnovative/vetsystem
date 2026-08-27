/**
 * Contrato que debe implementar cualquier backend de sincronización.
 *
 * Para agregar un nuevo backend (Supabase, PocketBase, etc.):
 *   1. Crear src/lib/sync/providers/[name].provider.ts implementando esta interfaz
 *   2. Cambiar la exportación en sync.config.ts
 *   No se modifica nada más en la app.
 */
export interface RemoteDoc {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  [key: string]: unknown;
}

export interface SyncProvider {
  /**
   * Escribe o actualiza un documento en el backend.
   * Si el documento ya existe, se hace merge (no sobreescribe campos no incluidos).
   * clinicId must come from the authenticated session — never from a build-time env var.
   */
  push(collection: string, id: string, data: object, clinicId: string): Promise<void>;

  /**
   * Trae documentos de una colección modificados después de `desde` (timestamp ms).
   * Retorna array vacío si no hay cambios.
   * clinicId must come from the authenticated session — never from a build-time env var.
   */
  pull(collection: string, desde: number, clinicId: string): Promise<RemoteDoc[]>;

  /**
   * Real-time subscription. Firestore calls onChange with ONLY the docs that
   * changed since `since` (a ms timestamp — set it to the cursor returned by
   * the last pullAll so the listener picks up exactly where the catch-up left off).
   * Returns an unsubscribe function; call it when the session ends.
   */
  subscribe(
    collection: string,
    since: number,
    clinicId: string,
    onChange: (docs: RemoteDoc[]) => void,
  ): () => void;

  /** Nombre del provider — útil para logs */
  readonly name: string;
}
