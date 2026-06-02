'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useConsulta, cancelarConsulta } from '@/hooks/useConsultas';
import { ConsultaForm } from '@/components/consultas/ConsultaForm';
import { FacturaModal } from '@/components/facturas/FacturaModal';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { TIPOS_CONSULTA, ESTADOS_CONSULTA } from '@/types/consulta';
import { cn } from '@/lib/utils';

export default function ConsultaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const { consulta, cargando } = useConsulta(id);
  const [mostrarFactura, setMostrarFactura] = useState(false);
  const [pendingFactura, setPendingFactura] = useState(false);

  // Abre el modal solo cuando la liveQuery ya devuelve el consulta actualizada
  useEffect(() => {
    if (!pendingFactura || consulta?.estado !== 'completada') return;
    setPendingFactura(false);
    if ((consulta.total ?? 0) > 0) {
      setMostrarFactura(true);
    } else {
      router.push('/consultas');
    }
  }, [pendingFactura, consulta?.estado, consulta?.total, router]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!consulta) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Consulta no encontrada</p>
        <Button variant="ghost" onClick={() => router.push('/consultas')} className="mt-3">
          <ArrowLeft size={14} className="mr-2" /> Volver
        </Button>
      </div>
    );
  }

  // Si ya está finalizada / cancelada → vista de solo lectura
  // (también puede llegar aquí mientras mostrarFactura=true, justo tras finalizar)
  if (consulta.estado !== 'en_proceso') {
    const tipoInfo   = TIPOS_CONSULTA[consulta.tipo];
    const estadoInfo = ESTADOS_CONSULTA[consulta.estado];

    function formatTs(ts: number) {
      return new Date(ts).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' });
    }
    function fmt(n: number) {
      return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
    }

    return (
      <>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/consultas')}>
              <ArrowLeft size={18} />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Consulta</h1>
              <p className="text-sm text-muted-foreground">{formatTs(consulta.fecha)}</p>
            </div>
          </div>
          {consulta.facturaId && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/facturas/${consulta.facturaId}`)}>
              Ver factura
            </Button>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <span className="text-3xl">{tipoInfo?.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{consulta.nombrePaciente}</p>
                <span className={cn('text-xs px-2 py-0.5 rounded-full border', estadoInfo?.color)}>
                  {estadoInfo?.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{tipoInfo?.label} · {consulta.nombreDueno}</p>
              <p className="text-sm mt-1">{consulta.motivo}</p>
            </div>
          </div>

          {/* Signos vitales */}
          {(consulta.peso || consulta.temperatura || consulta.frecuenciaCardiaca || consulta.frecuenciaRespiratoria) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border">
              {[
                { label: 'Peso',        value: consulta.peso,                 unit: 'kg'  },
                { label: 'Temperatura', value: consulta.temperatura,          unit: '°C'  },
                { label: 'F. Cardíaca', value: consulta.frecuenciaCardiaca,   unit: 'bpm' },
                { label: 'F. Respir.',  value: consulta.frecuenciaRespiratoria,unit: 'rpm'},
              ].filter((v) => v.value != null).map(({ label, value, unit }) => (
                <div key={label} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold text-sm">{value} <span className="font-normal text-xs text-muted-foreground">{unit}</span></p>
                </div>
              ))}
            </div>
          )}

          {/* Historia clínica */}
          {[
            { label: 'Anamnesis',    value: consulta.anamnesis    },
            { label: 'Examen físico',value: consulta.examenFisico },
            { label: 'Diagnóstico',  value: consulta.diagnostico  },
            { label: 'Tratamiento',  value: consulta.tratamiento  },
            { label: 'Observaciones',value: consulta.observaciones },
          ].filter((r) => r.value).map(({ label, value }) => (
            <div key={label} className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm whitespace-pre-wrap">{value}</p>
            </div>
          ))}

          {/* Items */}
          {(consulta.items?.length ?? 0) > 0 && (
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Productos y servicios</p>
              {consulta.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.descripcion} <span className="text-muted-foreground">×{item.cantidad}</span></span>
                  <span className="font-medium">{fmt(item.subtotal)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span>{fmt(consulta.total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {mostrarFactura && (
        <FacturaModal
          consulta={consulta}
          open={mostrarFactura}
          onGuardada={(facturaId) => router.push(`/facturas/${facturaId}`)}
        />
      )}
      </>
    );
  }

  // ── En proceso → formulario completo ────────────────────────────────────
  return (
    <>
      <div className="h-[calc(100vh-4rem)] -m-4 sm:-m-6 flex flex-col">
        <ConsultaForm
          consultaId={id}
          consulta={consulta}
          onFinalizada={() => {
            // Marcar como pendiente — el useEffect abre el modal cuando
            // el liveQuery ya tiene el consulta actualizado con items y totales
            setPendingFactura(true);
          }}
          onCancelada={async () => {
            await cancelarConsulta(id);
            router.push('/consultas');
          }}
        />
      </div>

      {mostrarFactura && consulta && (
        <FacturaModal
          consulta={consulta}
          open={mostrarFactura}
          onGuardada={(facturaId) => router.push(`/facturas/${facturaId}`)}
        />
      )}
    </>
  );
}
