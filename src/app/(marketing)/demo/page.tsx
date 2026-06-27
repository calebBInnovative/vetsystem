'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setupDemo } from '@/lib/demo/demo.service';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function DemoPage() {
  const router = useRouter();
  const { refreshFromDexie } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    setupDemo()
      .then(() => refreshFromDexie())
      .then(() => router.replace('/dashboard'))
      .catch(err => setError(String(err)));
  }, [router, refreshFromDexie]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-destructive font-medium">No se pudo iniciar el demo</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <a href="/landing" className="underline text-sm">Volver al inicio</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-primary" size={32} />
      <p className="text-muted-foreground text-sm">Preparando el demo…</p>
    </div>
  );
}
