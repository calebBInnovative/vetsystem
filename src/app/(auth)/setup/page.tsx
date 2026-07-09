'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { crearClinicaDesdeSetup } from '@/lib/auth/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Phone, Building2, CheckCircle2 } from 'lucide-react';

function validarTelefono(tel: string): boolean {
  const digits = tel.replace(/[\s\-\+]/g, '');
  if (digits.startsWith('505')) return /^505\d{8}$/.test(digits);
  return /^\d{8}$/.test(digits);
}

function formatearTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export default function SetupPage() {
  const router = useRouter();
  const { firebaseUser, session, loading, refreshFromDexie } = useAuth();

  const [clinicName, setClinicName] = useState('');
  const [telefono,   setTelefono]   = useState('');
  const [telError,   setTelError]   = useState('');
  const [nameError,  setNameError]  = useState('');
  const [error,      setError]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace('/login');
      return;
    }
    // Only redirect when session exists AND is fully set up.
    // session === null means new Google user who must fill in this form.
    if (!loading && session && session.setupComplete !== false) {
      router.replace('/dashboard');
    }
  }, [loading, firebaseUser, session, router]);

  if (loading || !firebaseUser) return null;

  function handleTelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw.startsWith('+')) {
      setTelefono(raw);
    } else {
      setTelefono(formatearTelefono(raw));
    }
    setTelError('');
  }

  function validate(): boolean {
    let ok = true;

    if (!clinicName.trim()) {
      setNameError('El nombre de la clínica es requerido.');
      ok = false;
    } else if (clinicName.trim().length < 2) {
      setNameError('Debe tener al menos 2 caracteres.');
      ok = false;
    } else {
      setNameError('');
    }

    if (!telefono.trim()) {
      setTelError('El teléfono es requerido.');
      ok = false;
    } else if (!validarTelefono(telefono)) {
      setTelError('Ingresa un número válido (ej. 8163-0097 o +50581630097).');
      ok = false;
    } else {
      setTelError('');
    }

    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSaving(true);
    try {
      // Creates clinic + license + user docs atomically, then writes Dexie session
      await crearClinicaDesdeSetup({
        clinicName: clinicName.trim(),
        telefono:   telefono.trim(),
      });
      setDone(true);
      setTimeout(async () => {
        await refreshFromDexie();
        router.replace('/dashboard');
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('network') || msg.includes('fetch')) {
        setError('Sin conexión a internet. Verifica tu red e intenta de nuevo.');
      } else {
        setError('No se pudo crear la clínica. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
  const inputErrorClass =
    'w-full rounded-xl border border-destructive bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/40';

  if (done) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center">
        <CheckCircle2 size={52} className="text-green-500" />
        <p className="text-xl font-bold">¡Clínica creada!</p>
        <p className="text-sm text-muted-foreground">Redirigiendo a tu clínica…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="text-4xl">🐾</div>
        <h1 className="text-2xl font-bold">Crear tu clínica</h1>
        <p className="text-sm text-muted-foreground">
          Hola, <span className="font-medium text-foreground">{firebaseUser.displayName ?? firebaseUser.email}</span>.
          Completa los datos para activar tu cuenta.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Clinic name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Nombre de la clínica <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Building2
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              required
              autoFocus
              value={clinicName}
              onChange={(e) => { setClinicName(e.target.value); setNameError(''); }}
              onBlur={() => { if (!clinicName.trim()) setNameError('El nombre de la clínica es requerido.'); }}
              placeholder="Ej: House of Pets"
              className={`${nameError ? inputErrorClass : inputClass} pl-8`}
            />
          </div>
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Teléfono de la clínica <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Phone
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="tel"
              required
              value={telefono}
              onChange={handleTelChange}
              onBlur={() => { if (telefono && !validarTelefono(telefono)) setTelError('Ingresa un número válido (ej. 8163-0097 o +50581630097).'); }}
              placeholder="8163-0097"
              inputMode="tel"
              className={`${telError ? inputErrorClass : inputClass} pl-8`}
            />
          </div>
          {telError ? (
            <p className="text-xs text-destructive">{telError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Formato: 8163-0097 o +50581630097</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-11" disabled={saving}>
          {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
          Crear clínica
        </Button>

      </form>

    </div>
  );
}
