'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle } from 'lucide-react';
import { VetSystemIcon, VetSystemWordmark, PAW_BG_TEAL } from '@/components/common/VetSystemLogo';
import { useLandingContent } from '@/hooks/useLandingContent';
import { fetchPublicContact, formatWhatsapp, whatsappChatUrl } from '@/lib/marketing/contact';
import { DEFAULT_FOOTER, SOCIAL_LABELS, SOCIAL_NETWORKS } from '@/lib/marketing/landing';

/** Landing footer; contact details and social links are edited at /admin/landing. */
export function SiteFooter() {
  const footer = useLandingContent()?.footer ?? DEFAULT_FOOTER;
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPublicContact()
      .then((c) => { if (!cancelled) setWhatsapp(c.whatsapp); })
      .catch(() => { /* offline: no WhatsApp line */ });
    return () => { cancelled = true; };
  }, []);

  const socials = SOCIAL_NETWORKS.filter((n) => footer.socials[n]);
  const showWhatsapp = footer.showWhatsapp && !!whatsapp;

  return (
    <footer id="contacto" className="bg-muted/30 border-t border-border py-12" style={PAW_BG_TEAL}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid sm:grid-cols-3 gap-8 mb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <VetSystemIcon size={28} />
              <VetSystemWordmark size="base" />
            </div>
            {footer.tagline && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{footer.tagline}</p>
            )}
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {socials.map((n) => (
                  <a key={n} href={footer.socials[n]} target="_blank" rel="noopener noreferrer"
                    className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
                    {SOCIAL_LABELS[n]}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Acceso</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <Link href="/login" className="block hover:text-foreground transition-colors">Iniciar sesión</Link>
              <Link href="/register" className="block hover:text-foreground transition-colors">Crear cuenta</Link>
              <Link href="/demo" className="block hover:text-foreground transition-colors">Probar el demo</Link>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Contacto</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              {showWhatsapp && (
                <a href={whatsappChatUrl(whatsapp, 'Hola, quiero información sobre VetSystem.')} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <MessageCircle size={14} /> {formatWhatsapp(whatsapp)}
                </a>
              )}
              {footer.email && (
                <a href={`mailto:${footer.email}`} className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <Mail size={14} /> {footer.email}
                </a>
              )}
              {footer.city && <p className="flex items-center gap-2"><MapPin size={14} /> {footer.city}</p>}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} VetSystem. Todos los derechos reservados.</p>
          <p>Hecho con ❤️ en Nicaragua</p>
        </div>
      </div>
    </footer>
  );
}
