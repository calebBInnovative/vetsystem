'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Last-resort screen for an error the root layout could not render, which
 * Next.js otherwise shows as a bare "Application error". The SDK does not see
 * these on its own: React catches them, so they are reported here.
 *
 * A page left open across a deploy (an installed PWA resumed from background)
 * still runs the previous build and asks for chunks that no longer exist.
 * Loading the page again picks up the new build, so that case reloads once by
 * itself; the guard stops a loop if the reload fails the same way.
 */
const RELOAD_KEY = 'vetsys-chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;

function isChunkLoadError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
    || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i
      .test(error.message);
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isChunkLoadError(error)) {
      const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - lastReload > RELOAD_GUARD_MS) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    Sentry.captureException(error, { tags: { area: 'global-error' } });
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Algo salió mal</h1>
          <p style={{ color: '#555', marginBottom: 20 }}>
            Ocurrió un error al cargar VetSystem. Tus datos guardados en este dispositivo no se perdieron.
          </p>
          <button
            onClick={() => { reset(); window.location.reload(); }}
            style={{ background: '#0f7d6e', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 16 }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
