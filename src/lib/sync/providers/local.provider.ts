import type { SyncProvider, RemoteDoc } from '@/lib/sync/sync.provider';

/**
 * Provider no-op: no sincroniza a ningún backend.
 * Útil en desarrollo sin conexión a Firebase o en tests.
 */
export class LocalSyncProvider implements SyncProvider {
  readonly name = 'local';

  async push(_collection: string, _id: string, _data: object, _clinicId: string): Promise<void> {}

  async pull(_collection: string, _desde: number, _clinicId: string): Promise<RemoteDoc[]> {
    return [];
  }

  subscribe(
    _collection: string,
    _since: number,
    _clinicId: string,
    _onChange: (docs: RemoteDoc[]) => void,
  ): () => void {
    return () => {};
  }
}
