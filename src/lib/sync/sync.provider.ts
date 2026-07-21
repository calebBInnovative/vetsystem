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
   */
  push(collection: string, id: string, data: object): Promise<void>;

  /**
   * Trae documentos de una colección modificados después de `desde` (timestamp ms).
   * Retorna array vacío si no hay cambios.
   */
  pull(collection: string, desde: number): Promise<RemoteDoc[]>;

  /**
   * Suscripción en tiempo real (opcional).
   * Retorna una función para cancelar la suscripción.
   */
  subscribe?(
    collection: string,
    clinicId: string,
    onChange: (docs: RemoteDoc[]) => void,
  ): () => void;

  /** Nombre del provider — útil para logs */
  readonly name: string;
}
