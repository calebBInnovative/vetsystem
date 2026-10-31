import { AlertTriangle } from 'lucide-react';

/** Shown instead of an endless spinner when an owner screen cannot read its Firestore document. */
export function LoadError({ error, what }: { error: Error; what: string }) {
  const denied = (error as { code?: string }).code === 'permission-denied';
  return (
    <div className="bg-card rounded-2xl border border-destructive/40 p-5 flex gap-3 text-sm">
      <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="font-semibold">No se pudo cargar {what}</p>
        <p className="text-muted-foreground">
          {denied
            ? 'Firestore negó el acceso. Lo más probable es que las reglas de seguridad más recientes aún no estén desplegadas (se publican al hacer push a master).'
            : 'Revisa la conexión e intenta de nuevo.'}
        </p>
      </div>
    </div>
  );
}
