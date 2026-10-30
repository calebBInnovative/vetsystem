import type { Metadata } from 'next';

// The landing page is a client component, so its metadata lives here.
const title = 'VetSystem | Software veterinario que funciona sin internet';
const description =
  'Pacientes, agenda, inventario, ventas y cobros para clínicas veterinarias en Nicaragua. ' +
  'Funciona aunque se caiga el internet. Prueba 7 días gratis, sin tarjeta.';

export const metadata: Metadata = {
  // Resolves the relative OG/Twitter image URLs; update when a custom domain goes live.
  metadataBase: new URL('https://vetsystem-b7675.web.app'),
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    locale: 'es_NI',
    siteName: 'VetSystem',
    images: [{ url: '/logo.jpeg', alt: 'VetSystem' }],
  },
  twitter: {
    card: 'summary',
    title,
    description,
    images: ['/logo.jpeg'],
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
