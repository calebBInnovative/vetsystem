'use client';

import Link from 'next/link';
import {
  FOOTER_LIMITS, SOCIAL_LABELS, SOCIAL_NETWORKS, validSocialUrl, type FooterContent, type SocialNetwork,
} from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';
import { INPUT, type Update } from './shared';

export function FooterEditor({ footer, onChange }: { footer: FooterContent; onChange: Update<FooterContent> }) {
  const set = (field: 'tagline' | 'email' | 'city', value: string) => onChange((f) => ({ ...f, [field]: value }));
  const setSocial = (network: SocialNetwork, value: string) =>
    onChange((f) => ({ ...f, socials: { ...f.socials, [network]: value } }));

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Pie de página</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Frase bajo el logo</span>
          <input value={footer.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={FOOTER_LIMITS.tagline}
            placeholder="Vacío: sin frase" className={INPUT} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium">Correo</span>
            <input type="email" value={footer.email} onChange={(e) => set('email', e.target.value)} maxLength={FOOTER_LIMITS.email}
              placeholder="Vacío: no se muestra" className={INPUT} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Ciudad</span>
            <input value={footer.city} onChange={(e) => set('city', e.target.value)} maxLength={FOOTER_LIMITS.city}
              placeholder="Vacío: no se muestra" className={INPUT} />
          </label>
        </div>
        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input type="checkbox" className="mt-1" checked={footer.showWhatsapp}
            onChange={(e) => onChange((f) => ({ ...f, showWhatsapp: e.target.checked }))} />
          <span className="text-sm">
            Mostrar el WhatsApp de ventas
            <span className="block text-xs text-muted-foreground">
              Es el mismo número del botón flotante; se cambia en{' '}
              <Link href="/admin/payments" className="text-primary hover:underline">Pagos de clínicas → Configuración</Link>.
            </span>
          </span>
        </label>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Redes sociales</h2>
          <p className="text-xs text-muted-foreground">Pega el enlace completo del perfil. Las que dejes vacías no aparecen.</p>
        </div>
        {SOCIAL_NETWORKS.map((n) => {
          const value = footer.socials[n];
          const invalid = !!value.trim() && !validSocialUrl(value.trim());
          return (
            <label key={n} className="block space-y-1">
              <span className="text-xs font-medium">{SOCIAL_LABELS[n]}</span>
              <input type="url" value={value} onChange={(e) => setSocial(n, e.target.value)} maxLength={FOOTER_LIMITS.social}
                placeholder={`https://www.${n}.com/…`} className={cn(INPUT, invalid && 'border-destructive')} />
              {invalid && <span className="block text-[11px] text-destructive">Debe empezar con https://</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
