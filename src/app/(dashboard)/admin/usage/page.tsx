'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Activity, RefreshCw, Database, Download, TrendingUp, ArrowLeft, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  collectUsageSnapshot, getUsageHistory, estimateStorageCost, estimateFullPullCost,
  growthBetween, isPlatformOwner, collectAllUsageSnapshots, getLatestUsagePerClinic,
  listAllClinics, type UsageSnapshot, type ClinicRef,
} from '@/lib/usage/usage.service';
import { cn } from '@/lib/utils';

const usd = (n: number) =>
  n < 0.01 && n > 0 ? '< $0.01' : `$${n.toFixed(2)}`;

const num = (n: number) => new Intl.NumberFormat('es-NI').format(n);

export default function UsagePage() {
  const router = useRouter();
  const { session } = useAuth();
  const clinicId = session?.clinicId;

  const [history, setHistory] = useState<UsageSnapshot[] | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Platform-wide view: only the person running the SaaS. Firestore rules are
  // what enforces it; this just decides what the screen offers.
  const platformOwner = isPlatformOwner(session?.email);
  const [clinics, setClinics] = useState<ClinicRef[] | null>(null);
  const [allUsage, setAllUsage] = useState<(UsageSnapshot | null)[] | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      setHistory(await getUsageHistory(clinicId, 30));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [clinicId]);

  const loadPlatform = useCallback(async () => {
    if (!platformOwner) return;
    try {
      const [list, usage] = await Promise.all([listAllClinics(), getLatestUsagePerClinic()]);
      setClinics(list);
      setAllUsage(usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [platformOwner]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadPlatform(); }, [loadPlatform]);

  async function measureAll() {
    if (scanning) return;
    setScanning('Iniciando…');
    try {
      const { snapshots, failures } = await collectAllUsageSnapshots((done, total, clinic) =>
        setScanning(`${done}/${total} — ${clinic.name ?? clinic.id}`),
      );
      const totalDocs = snapshots.reduce((s, snap) => s + snap.totalDocs, 0);
      toast.success(`${snapshots.length} clínica(s) medidas — ${num(totalDocs)} documentos`);
      if (failures.length > 0) {
        toast.error(`${failures.length} clínica(s) no se pudieron medir`);
        console.warn('[usage] fallos por clínica:', failures);
      }
      await Promise.all([load(), loadPlatform()]);
    } catch (err) {
      toast.error('No se pudo completar la medición global');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(null);
    }
  }

  async function measure() {
    if (!clinicId || measuring) return;
    setMeasuring(true);
    try {
      const snap = await collectUsageSnapshot(clinicId);
      toast.success(`Medición lista — ${num(snap.totalDocs)} documentos`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error('No se pudo medir. Revisa las reglas de Firestore.');
    } finally {
      setMeasuring(false);
    }
  }

  const latest = history?.[0];
  const growth = history ? growthBetween(history) : null;

  // Only master and admin have any business looking at infrastructure cost
  if (session && session.role !== 'master' && session.role !== 'admin') {
    return (
      <div className="bg-card rounded-2xl border border-border p-10 text-center">
        <p className="font-semibold">Sin acceso</p>
        <p className="text-sm text-muted-foreground mt-1">Esta sección es solo para administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button
            onClick={() => router.push('/admin')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
          >
            <ArrowLeft size={12} /> Volver a administración
          </button>
          <h1 className="text-2xl font-bold">Uso y costos</h1>
          <p className="text-sm text-muted-foreground">
            Cuántos documentos tiene esta clínica y qué implican en infraestructura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {platformOwner && (
            <Button onClick={measureAll} disabled={!!scanning} variant="outline" className="gap-2">
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}
              {scanning ?? 'Medir todas'}
            </Button>
          )}
          <Button onClick={measure} disabled={measuring} className="gap-2">
            {measuring ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Medir esta clínica
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">No se pudo leer o escribir la medición</p>
          <p className="text-muted-foreground mt-1 break-words">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Requiere la regla de <code>admin/usage/{'{clinicId}'}</code> desplegada en Firestore.
          </p>
        </div>
      )}

      {platformOwner && clinics && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Globe size={14} className="text-primary" /> Todas las clínicas ({clinics.length})
            </p>
            <p className="text-xs text-muted-foreground">
              {num(
                (allUsage ?? []).reduce((sum, u) => sum + (u?.totalDocs ?? 0), 0),
              )} documentos en la plataforma
            </p>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {clinics.map((c, i) => {
              const u = allUsage?.[i] ?? null;
              return (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {c.name ?? c.id}
                    <span className="text-muted-foreground text-xs"> · {c.id}</span>
                  </span>
                  <span className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-muted-foreground">{u?.date ?? 'sin medir'}</span>
                    <span className="tabular-nums w-20 text-right">{u ? num(u.totalDocs) : '—'}</span>
                    <span className="tabular-nums w-16 text-right text-xs text-muted-foreground">
                      {u ? usd(estimateFullPullCost(u.totalDocs)) : '—'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="px-4 py-2.5 text-[11px] text-muted-foreground border-t border-border">
            La última columna es lo que cuesta que un dispositivo nuevo descargue esa clínica completa.
          </p>
        </div>
      )}

      {!latest ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
            <Activity size={24} className="text-muted-foreground" />
          </div>
          <p className="font-semibold">Todavía no hay mediciones</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Una medición cuenta los documentos de cada colección. Cuesta aproximadamente
            una lectura por cada 1000 documentos, así que es barata incluso con millones.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card
              icon={Database} color="text-primary" bg="bg-primary/10"
              value={num(latest.totalDocs)} label="Documentos totales"
              hint={`Medido el ${latest.date}`}
            />
            <Card
              icon={TrendingUp} color="text-blue-600" bg="bg-blue-500/10"
              value={growth ? `${growth.docs >= 0 ? '+' : ''}${num(growth.docs)}` : '—'}
              label="Crecimiento"
              hint={growth ? `en ${growth.days} día${growth.days !== 1 ? 's' : ''}` : 'Necesita 2 mediciones'}
            />
            <Card
              icon={Database} color="text-green-600" bg="bg-green-500/10"
              value={usd(estimateStorageCost(latest.totalDocs))} label="Almacenamiento / mes"
              hint="Estimado, 1KB por documento"
            />
            <Card
              icon={Download} color="text-amber-600" bg="bg-amber-500/10"
              value={usd(estimateFullPullCost(latest.totalDocs))} label="Descarga completa"
              hint="Por cada dispositivo nuevo"
            />
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
            La descarga completa es el número que hay que vigilar: se paga cada vez que alguien
            entra desde un navegador nuevo o borra sus datos. Por eso la primera descarga de
            historial transaccional está limitada a 12 meses, y la historia completa solo se
            baja cuando alguien la pide con <strong>Forzar descarga</strong>.
            Las lecturas y escrituras del día a día no se estiman acá porque dependen de cuántos
            dispositivos sincronizan, no de cuántos documentos hay.
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">Documentos por colección</p>
              <p className="text-xs text-muted-foreground">
                la medición costó ~{num(latest.measurementReads)} lecturas
              </p>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(latest.counts)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => {
                  const pct = latest.totalDocs > 0 ? (count / latest.totalDocs) * 100 : 0;
                  return (
                    <div key={name} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 truncate">{name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right tabular-nums">{num(count)}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {history && history.length > 1 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <p className="px-4 py-3 text-sm font-semibold border-b border-border">Historial</p>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {history.map((h, i) => {
                  const prev = history[i + 1];
                  const delta = prev ? h.totalDocs - prev.totalDocs : null;
                  return (
                    <div key={h.date} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{h.date}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">{num(h.totalDocs)}</span>
                        {delta !== null && (
                          <span className={cn(
                            'text-xs tabular-nums w-16 text-right',
                            delta > 0 ? 'text-green-600' : 'text-muted-foreground',
                          )}>
                            {delta >= 0 ? '+' : ''}{num(delta)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ icon: Icon, color, bg, value, label, hint }: {
  icon: React.FC<{ size?: number; className?: string }>;
  color: string; bg: string; value: string; label: string; hint: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center mb-3', bg)}>
        <Icon size={16} className={color} />
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>
    </div>
  );
}
