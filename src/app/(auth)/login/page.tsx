'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, loginConGoogle } from '@/lib/auth/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff, WifiOff, Wifi } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { firebaseUser, session, cargando: authCargando } = useAuth();
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [verPass,     setVerPass]     = useState(false);
  const [error,       setError]       = useState('');
  const [cargando,    setCargando]    = useState(false);
  const [cargandoG,   setCargandoG]   = useState(false);
  const [online,      setOnline]      = useState(true);

  // Redirect if already authenticated
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!online) { setError('El login requiere conexión a internet.'); return; }
    setCargando(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
        setError('Email o contraseña incorrectos.');
      } else if (msg.includes('too-many-requests')) {
        setError('Demasiados intentos. Intenta más tarde.');
      } else if (msg.includes('network')) {
        setError('Sin conexión. El login requiere internet.');
      } else {
        setError('Error al iniciar sesión. Intenta de nuevo.');
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
      if (msg.includes('popup-closed')) {
        // user closed popup — no error needed
      } else if (msg.includes('network')) {
        setError('Sin conexión a internet.');
      } else {
        setError('Error al iniciar sesión con Google.');
      }
    } finally {
      setCargandoG(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-8">

      {/* Logo */}
      <div className="text-center space-y-2">
        <div className="text-4xl">🐾</div>
        <h1 className="text-2xl font-bold">VetSystem</h1>
        <p className="text-sm text-muted-foreground">Nicaragua</p>
      </div>

      {/* Indicador de conexión */}
      <div className={`flex items-center justify-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 w-fit mx-auto ${
        online
          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
      }`}>
        {online ? <Wifi size={11} /> : <WifiOff size={11} />}
        {online ? 'Conectado' : 'Sin conexión — login no disponible'}
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

      {/* Formulario email/password */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Contraseña</label>
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
          Iniciar sesión
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <a href="/register" className="font-medium text-primary underline underline-offset-4">
          Regístrate gratis
        </a>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        ¿Problemas para acceder?{' '}
        <a href="mailto:soporte@vetsystem.app" className="underline">
          Contacta soporte
        </a>
      </p>
    </div>
  );
}
