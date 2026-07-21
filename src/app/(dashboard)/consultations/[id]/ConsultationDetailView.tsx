'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useConsultation, cancelConsultation } from '@/hooks/useConsultations';
import { ConsultaForm } from '@/components/consultations/ConsultationForm';
import { FacturaModal } from '@/components/invoices/InvoiceModal';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CONSULTATION_TYPES, CONSULTATION_STATUSES } from '@/types/consultation';
import { cn } from '@/lib/utils';

export function ConsultationDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const { consulta, loading } = useConsultation(id);
  const [mostrarFactura, setMostrarFactura] = useState(false);
  const [pendingFactura, setPendingFactura] = useState(false);

  useEffect(() => {
    if (!pendingFactura || consulta?.status !== 'completed') return;
    setPendingFactura(false);
    if ((consulta.total ?? 0) > 0) {
      setMostrarFactura(true);
    } else {
      router.push('/consultations');
    }
  }, [pendingFactura, consulta?.status, consulta?.total, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!consulta) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Consultation no encontrada</p>
        <Button variant="ghost" onClick={() => router.push('/consultations')} className="mt-3">
          <ArrowLeft size={14} className="mr-2" /> Volver
        </Button>
      </div>
    );
  }

  if (consulta.status !== 'in_progress') {
    const tipoInfo   = CONSULTATION_TYPES[consulta.type];
    const estadoInfo = CONSULTATION_STATUSES[consulta.status];

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
            <Button variant="ghost" size="icon" onClick={() => router.push('/consultations')}>
              <ArrowLeft size={18} />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Consultation</h1>
              <p className="text-sm text-muted-foreground">{formatTs(consulta.date)}</p>
            </div>
          </div>
          {consulta.invoiceId && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/invoices/${consulta.invoiceId}`)}>
              Ver factura
            </Button>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl">{tipoInfo?.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{consulta.patientName}</p>
                <span className={cn('text-xs px-2 py-0.5 rounded-full border', estadoInfo?.color)}>
                  {estadoInfo?.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{tipoInfo?.label} · {consulta.ownerName}</p>
              <p className="text-sm mt-1">{consulta.reason}</p>
            </div>
          </div>

          {(consulta.weight || consulta.temperature || consulta.heartRate || consulta.respiratoryRate) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border">
              {[
                { label: 'Peso',        value: consulta.weight,            unit: 'kg'  },
                { label: 'Temperatura', value: consulta.temperature,       unit: '°C'  },
                { label: 'F. Cardíaca', value: consulta.heartRate,         unit: 'bpm' },
                { label: 'F. Respir.',  value: consulta.respiratoryRate,   unit: 'rpm' },
              ].filter((v) => v.value != null).map(({ label, value, unit }) => (
                <div key={label} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold text-sm">{value} <span className="font-normal text-xs text-muted-foreground">{unit}</span></p>
                </div>
              ))}
            </div>
          )}

          {[
            { label: 'Anamnesis',     value: consulta.anamnesis    },
            { label: 'Examen físico', value: consulta.physicalExam },
            { label: 'Diagnóstico',   value: consulta.diagnosis    },
            { label: 'Tratamiento',   value: consulta.treatment    },
            { label: 'Observaciones', value: consulta.observations },
          ].filter((r) => r.value).map(({ label, value }) => (
            <div key={label} className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm whitespace-pre-wrap">{value}</p>
            </div>
          ))}

          {(consulta.items?.length ?? 0) > 0 && (
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Productos y services</p>
              {consulta.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.description} <span className="text-muted-foreground">×{item.quantity}</span></span>
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
          consultation={consulta}
          open={mostrarFactura}
          onGuardada={(facturaId) => router.push(`/invoices/${facturaId}`)}
        />
      )}
      </>
    );
  }

  return (
    <>
      <div className="h-[calc(100vh-4rem)] -m-4 sm:-m-6 flex flex-col">
        <ConsultaForm
          consultaId={id}
          consultation={consulta}
          onFinalizada={() => { setPendingFactura(true); }}
          onCancelada={async () => {
            await cancelConsultation(id);
            router.push('/consultations');
          }}
        />
      </div>

      {mostrarFactura && consulta && (
        <FacturaModal
          consultation={consulta}
          open={mostrarFactura}
          onGuardada={(facturaId) => router.push(`/invoices/${facturaId}`)}
        />
      )}
    </>
  );
}
