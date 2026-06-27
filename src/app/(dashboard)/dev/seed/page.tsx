'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sembrarDatos, limpiarDatos } from '@/lib/dev/seed';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Sprout, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

type Estado = 'idle' | 'cargando' | 'ok' | 'error';

export default function SeedPage() {
  const { session, cargando } = useAuth();
  const router = useRouter();
  const esMaster = session?.role === 'master';

  const [estado, setEstado]   = useState<Estado>('idle');
  const [mensaje, setMensaje] = useState('');
  const [conteos, setConteos] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!cargando && !esMaster) router.replace('/dashboard');
  }, [cargando, esMaster, router]);

  if (cargando || !esMaster) return null;

  async function handleSembrar() {
    setEstado('cargando');
    setConteos(null);
    try {
      const result = await sembrarDatos();
      setMensaje(result.mensaje);
      setConteos(result.conteos);
      setEstado('ok');
    } catch (e) {
      setMensaje((e as Error).message ?? 'Error desconocido');
      setEstado('error');
    }
  }

  async function handleLimpiar() {
    if (!confirm('¿Limpiar TODOS los datos locales? Esta acción no se puede deshacer.')) return;
    setEstado('cargando');
    setConteos(null);
    try {
      await limpiarDatos();
      setMensaje('Base de datos local limpiada.');
      setEstado('ok');
    } catch (e) {
      setMensaje((e as Error).message ?? 'Error desconocido');
      setEstado('error');
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Datos de prueba</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Genera datos realistas en la base de datos local (IndexedDB) para probar la app.
        </p>
      </div>

      {/* Advertencia */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
        <strong>Solo desarrollo.</strong> Esta página llena la base de datos local con datos ficticios.
        No afecta ningún servidor — solo IndexedDB en este navegador.
      </div>

      {/* Acciones */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">Sembrar datos de prueba</p>
          <p className="text-xs text-muted-foreground">
            Crea 8 dueños, 12 pacientes, consultas, citas (hoy + esta semana), 18 productos y 30 pagos del mes.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSembrar}
            disabled={estado === 'cargando'}
            className="gap-2 flex-1"
          >
            {estado === 'cargando' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sprout size={14} />
            )}
            Sembrar datos
          </Button>

          <Button
            onClick={handleLimpiar}
            variant="outline"
            disabled={estado === 'cargando'}
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <Trash2 size={14} />
            Limpiar todo
          </Button>
        </div>
      </div>

      {/* Resultado */}
      {estado === 'ok' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 size={16} />
            <span className="font-medium text-sm">{mensaje}</span>
          </div>
          {conteos && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(conteos).map(([key, val]) => (
                <div key={key} className="flex justify-between rounded-lg bg-white/60 dark:bg-white/5 px-3 py-2">
                  <span className="text-xs text-muted-foreground capitalize">{key}</span>
                  <span className="text-xs font-semibold">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {estado === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex items-center gap-2 text-red-700 dark:text-red-400">
          <AlertCircle size={16} className="shrink-0" />
          <p className="text-sm">{mensaje}</p>
        </div>
      )}
    </div>
  );
}
