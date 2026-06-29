'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registrarse, loginConGoogle } from '@/lib/auth/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff, WifiOff, Wifi, Phone } from 'lucide-react';

// ── Validación de teléfono nicaragüense ───────────────────────────────────────
// Acepta 8 dígitos locales (ej. 8163-0097) o con prefijo +505
function validarTelefono(tel: string): boolean {
  const digits = tel.replace(/[\s\-\+]/g, '');
  // Con prefijo 505 → 11 dígitos; sin prefijo → 8 dígitos
  if (digits.startsWith('505')) return /^505\d{8}$/.test(digits);
  return /^\d{8}$/.test(digits);
}

// Auto-formato: XXXX-XXXX mientras el usuario escribe
function formatearTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const { firebaseUser, session, cargando: authCargando } = useAuth();

  const [nombre,     setNombre]     = useState('');
  const [clinicName, setClinicName] = useState('');
  const [telefono,   setTelefono]   = useState('');
  const [telError,   setTelError]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirmar,  setConfirmar]  = useState('');
  const [verPass,    setVerPass]    = useState(false);
  const [error,      setError]      = useState('');
  const [cargando,   setCargando]   = useState(false);
  const [cargandoG,  setCargandoG]  = useState(false);
  const [online,     setOnline]     = useState(true);

  useEffect(() => {
    if (!authCargando && (firebaseUser || session?.isDemo)) {
      router.replace('/dashboard');
    }
  }, [authCargando, firebaseUser, session, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (authCargando) return null;

  function handleTelefonoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Permite escribir con +505 sin formatear; si es solo dígitos, auto-formatea
    if (raw.startsWith('+')) {
      setTelefono(raw);
    } else {
      setTelefono(formatearTelefono(raw));
    }
    setTelError('');
  }

  function validarCamposTelefono(): boolean {
    if (!telefono.trim()) {
      setTelError('El teléfono es requerido.');
      return false;
    }
    if (!validarTelefono(telefono)) {
      setTelError('Ingresa un número válido (ej. 8163-0097 o +50581630097).');
      return false;
    }
    return true;
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!online)                  { setError('Requiere conexión a internet.'); return; }
    if (!clinicName.trim())       { setError('El nombre de la clínica es requerido.'); return; }
    if (!validarCamposTelefono()) return;
    if (password !== confirmar)   { setError('Las contraseñas no coinciden.'); return; }
    if (password.length < 6)      { setError('La contraseña debe tener al menos 6 caracteres.'); return; }

    setCargando(true);
    try {
      await registrarse({
        email:      email.trim(),
        password,
        name:       nombre.trim(),
        clinicName: clinicName.trim(),
        telefono:   telefono.trim(),
      });
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[register] error:', msg);
      if (msg.includes('email-already-in-use')) {
        setError('Ya existe una cuenta con ese email.');
      } else if (msg.includes('weak-password')) {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else if (msg.includes('invalid-email')) {
        setError('El email no es válido.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Sin conexión a internet. Intenta de nuevo.');
      } else if (msg.includes('permission') || msg.includes('PERMISSION')) {
        setError('Error de permisos al guardar los datos. Contacta al administrador.');
      } else {
        setError(`Error al crear la cuenta: ${msg}`);
      }
    } finally {
      setCargando(false);
    }
  }

  async function handleGoogle() {
    setError('');
    if (!online) { setError('Requiere conexión a internet.'); return; }
    setCargandoG(true);
    try {
      await loginConGoogle();
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed')) {
        setError('Error al registrarse con Google.');
      }
    } finally {
      setCargandoG(false);
    }
  }

  const inputClass = 'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
  const inputErrorClass = 'w-full rounded-xl border border-destructive bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/40';

  return (
    <div className="w-full max-w-sm space-y-6">

      {/* Logo */}
      <div className="text-center space-y-1">
        <div className="text-4xl">🐾</div>
        <h1 className="text-2xl font-bold">Crear clínica</h1>
        <p className="text-sm text-muted-foreground">VetSystem · Nicaragua</p>
      </div>

      {/* Conexión */}
      <div className={`flex items-center justify-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 w-fit mx-auto ${
        online
          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
      }`}>
        {online ? <Wifi size={11} /> : <WifiOff size={11} />}
        {online ? 'Conectado' : 'Sin conexión — registro no disponible'}
      </div>

      {/* Google */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-11 gap-3"
        disabled={cargandoG || !online}
        onClick={handleGoogle}
      >
        {cargandoG
          ? <Loader2 size={16} className="animate-spin" />
          : (
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )
        }
        Continuar con Google
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o con email</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Formulario */}
      <form onSubmit={handleRegistro} className="space-y-4">

        {/* Nombre de la clínica */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nombre de la clínica</label>
          <input
            type="text"
            required
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            placeholder="Ej: House of Pets"
            className={inputClass}
          />
        </div>

        {/* Teléfono de la clínica */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Teléfono de la clínica</label>
          <div className="relative">
            <Phone
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="tel"
              required
              value={telefono}
              onChange={handleTelefonoChange}
              onBlur={validarCamposTelefono}
              placeholder="8163-0097"
              inputMode="tel"
              className={`${telError ? inputErrorClass : inputClass} pl-8`}
            />
          </div>
          {telError ? (
            <p className="text-xs text-destructive">{telError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Formato: 8163-0097 o +50581630097
            </p>
          )}
        </div>

        {/* Nombre del admin */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tu nombre</label>
          <input
            type="text"
            autoComplete="name"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
            className={inputClass}
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className={inputClass}
          />
        </div>

        {/* Contraseña */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Contraseña</label>
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setVerPass(!verPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {verPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Confirmar contraseña */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Confirmar contraseña</label>
          <input
            type={verPass ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            placeholder="Repite la contraseña"
            className={inputClass}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full h-11"
          disabled={cargando || !online}
        >
          {cargando && <Loader2 size={14} className="mr-2 animate-spin" />}
          Crear clínica
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
