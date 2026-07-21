'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { Collaborator, CollaboratorType, CollaboratorPaymentFrequency } from '@/types/collaborator';
import { COLLABORATOR_TYPES, COLLABORATOR_PAYMENT_FREQUENCIES } from '@/types/collaborator';
import { createCollaborator, updateCollaborator } from '@/hooks/useCollaborators';

const selectClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

interface Props {
  open:          boolean;
  onClose:       () => void;
  colaborador?:  Collaborator;
}

const TIPO_KEYS      = Object.keys(COLLABORATOR_TYPES)      as CollaboratorType[];
const FRECUENCIA_KEYS = Object.keys(COLLABORATOR_PAYMENT_FREQUENCIES) as CollaboratorPaymentFrequency[];

export function ColaboradorForm({ open, onClose, colaborador }: Props) {
  const editando = !!colaborador;

  const [nombre,         setNombre]         = useState('');
  const [rol,            setRol]            = useState('');
  const [tipo,           setTipo]           = useState<CollaboratorType>('employee');
  const [salario,        setSalario]        = useState('');
  const [frecuenciaPago, setFrecuenciaPago] = useState<CollaboratorPaymentFrequency>('monthly');
  const [telefono,       setTelefono]       = useState('');
  const [notas,          setNotas]          = useState('');
  const [guardando,      setGuardando]      = useState(false);
  const [error,          setError]          = useState('');

  useEffect(() => {
    if (open) {
      setNombre(colaborador?.name             ?? '');
      setRol(colaborador?.role               ?? '');
      setTipo(colaborador?.type              ?? 'employee');
      setSalario(colaborador?.salary != null ? String(colaborador.salary) : '');
      setFrecuenciaPago(colaborador?.paymentFrequency ?? 'monthly');
      setTelefono(colaborador?.phone         ?? '');
      setNotas(colaborador?.notes            ?? '');
      setError('');
    }
  }, [open, colaborador]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const salarioNum = parseFloat(salario);

    if (!nombre.trim()) { setError('El nombre es requerido.'); return; }
    if (isNaN(salarioNum) || salarioNum <= 0) { setError('Ingresa un salario válido.'); return; }

    setGuardando(true);
    try {
      if (editando && colaborador) {
        await updateCollaborator(colaborador.id, {
          name:             nombre.trim(),
          role:             rol.trim(),
          type:             tipo,
          salary:           salarioNum,
          paymentFrequency: frecuenciaPago,
          phone:            telefono.trim() || undefined,
          notes:            notas.trim()    || undefined,
        });
      } else {
        await createCollaborator({
          name:             nombre.trim(),
          role:             rol.trim(),
          type:             tipo,
          salary:           salarioNum,
          paymentFrequency: frecuenciaPago,
          phone:            telefono.trim() || undefined,
          notes:            notas.trim()    || undefined,
        });
      }
      onClose();
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar colaborador' : 'Nuevo colaborador'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="colab-nombre">Nombre</Label>
            <Input
              id="colab-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
              required
            />
          </div>

          {/* Rol */}
          <div className="space-y-1.5">
            <Label htmlFor="colab-rol">Rol</Label>
            <Input
              id="colab-rol"
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              placeholder="Veterinario, Recepcionista..."
            />
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select
              className={selectClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as CollaboratorType)}
            >
              {TIPO_KEYS.map((k) => (
                <option key={k} value={k}>{COLLABORATOR_TYPES[k]}</option>
              ))}
            </select>
          </div>

          {/* Salario */}
          <div className="space-y-1.5">
            <Label htmlFor="colab-salario">Salario</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                C$
              </span>
              <Input
                id="colab-salario"
                type="number"
                min="0.01"
                step="0.01"
                value={salario}
                onChange={(e) => setSalario(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                required
              />
            </div>
          </div>

          {/* Frecuencia de pago */}
          <div className="space-y-1.5">
            <Label>Frecuencia de pago</Label>
            <select
              className={selectClass}
              value={frecuenciaPago}
              onChange={(e) => setFrecuenciaPago(e.target.value as CollaboratorPaymentFrequency)}
            >
              {FRECUENCIA_KEYS.map((k) => (
                <option key={k} value={k}>{COLLABORATOR_PAYMENT_FREQUENCIES[k]}</option>
              ))}
            </select>
          </div>

          {/* Teléfono */}
          <div className="space-y-1.5">
            <Label htmlFor="colab-telefono">
              Teléfono <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="colab-telefono"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="8163-0097"
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="colab-notas">
              Notas <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <textarea
              id="colab-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Información adicional..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className="gap-2">
              {guardando && <Loader2 size={13} className="animate-spin" />}
              {editando ? 'Guardar cambios' : 'Agregar colaborador'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
