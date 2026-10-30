'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { fetchPublicContact, whatsappChatUrl } from '@/lib/marketing/contact';

const GREETING = 'Hola, quiero información sobre VetSystem para mi clínica.';

/**
 * Floating WhatsApp chat button for the landing page. The number comes from
 * platform/contact (edited in /admin/payments → Configuración); nothing renders
 * until one is configured or while Firestore is unreachable.
 */
export function WhatsAppButton() {
  const [phone, setPhone] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPublicContact()
      .then((c) => { if (!cancelled) setPhone(c.whatsapp); })
      .catch(() => { /* offline: no button beats a broken one */ });
    return () => { cancelled = true; };
  }, []);

  if (!phone) return null;

  return (
    <a
      href={whatsappChatUrl(phone, GREETING)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all pl-4 pr-5 h-14"
    >
      <MessageCircle size={24} />
      <span className="hidden sm:inline text-sm font-semibold">¿Tienes dudas? Escríbenos</span>
    </a>
  );
}
