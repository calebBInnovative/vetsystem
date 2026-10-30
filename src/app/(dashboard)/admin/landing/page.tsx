'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import {
  deleteTestimonialPhotos, saveLandingContent, subscribeLandingContent, validEmail, validSocialUrl, SOCIAL_NETWORKS,
  type LandingContent,
} from '@/lib/marketing/landing';
import { HeroEditor } from '@/components/admin/landing/HeroEditor';
import { OfflineDayEditor } from '@/components/admin/landing/OfflineDayEditor';
import { FooterEditor } from '@/components/admin/landing/FooterEditor';
import { FaqEditor } from '@/components/admin/landing/FaqEditor';
import { TestimonialsEditor } from '@/components/admin/landing/TestimonialsEditor';
import { cn } from '@/lib/utils';

type Tab = 'hero' | 'offlineDay' | 'faqs' | 'testimonials' | 'footer';

const TABS: { id: Tab; label: string }[] = [
  { id: 'hero', label: 'Portada' },
  { id: 'offlineDay', label: 'Sin internet' },
  { id: 'faqs', label: 'Preguntas' },
  { id: 'testimonials', label: 'Testimonios' },
  { id: 'footer', label: 'Contacto' },
];

export default function LandingAdminPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  // The screen is a convenience; firestore.rules is what restricts the write.
  const platformOwner = isPlatformOwner(session?.email);

  const [content, setContent] = useState<LandingContent | null>(null);
  const [tab, setTab] = useState<Tab>('hero');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Photos referenced by the saved document: the ones gone after a save are deleted from Storage.
  const savedPhotos = useRef<string[]>([]);

  useEffect(() => {
    if (!loading && !platformOwner) router.replace('/admin');
  }, [loading, platformOwner, router]);

  // Live until the first edit, so unsaved changes are never overwritten.
  useEffect(() => {
    if (!platformOwner || dirty) return;
    return subscribeLandingContent((c) => {
      savedPhotos.current = c.testimonials.map((t) => t.photoPath).filter(Boolean);
      setContent(c);
    });
  }, [platformOwner, dirty]);

  /** Updater for one section, for the editors. */
  function section<K extends keyof LandingContent>(key: K) {
    return (updater: (prev: LandingContent[K]) => LandingContent[K]) => {
      setDirty(true);
      setContent((c) => c && { ...c, [key]: updater(c[key]) });
    };
  }

  async function save() {
    if (!content) return;
    if (content.offlineDay.steps.some((s) => !s.title.trim() || !s.text.trim())) {
      setTab('offlineDay');
      toast.error('Cada momento necesita qué pasa y detalle (o bórralo)');
      return;
    }
    if (SOCIAL_NETWORKS.some((n) => content.footer.socials[n].trim() && !validSocialUrl(content.footer.socials[n].trim()))) {
      setTab('footer');
      toast.error('Los enlaces de redes sociales deben empezar con https://');
      return;
    }
    if (content.footer.email.trim() && !validEmail(content.footer.email.trim())) {
      setTab('footer');
      toast.error('El correo no es válido');
      return;
    }
    if (content.faqs.some((f) => !f.question.trim() || !f.answer.trim())) {
      setTab('faqs');
      toast.error('Cada pregunta necesita pregunta y respuesta (o bórrala)');
      return;
    }
    if (content.testimonials.some((t) => !t.name.trim() || !t.quote.trim())) {
      setTab('testimonials');
      toast.error('Cada testimonio necesita nombre y texto (o bórralo)');
      return;
    }
    setSaving(true);
    try {
      await saveLandingContent(content);
      const kept = new Set(content.testimonials.map((t) => t.photoPath));
      void deleteTestimonialPhotos(savedPhotos.current.filter((p) => !kept.has(p)));
      savedPhotos.current = [...kept].filter(Boolean);
      setDirty(false);
      toast.success('Guardado. Ya se ve en la página principal.');
    } catch (err) {
      console.error('[landing] save failed:', err);
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  if (!platformOwner) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.push('/admin')}
          className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Página web</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Contenido de la página principal.{' '}
            <a href="/landing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Ver página <ExternalLink size={12} />
            </a>
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || saving || !!uploadingId || !content} className="gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
        </Button>
      </div>

      <div className="flex max-w-full overflow-x-auto bg-muted rounded-xl p-1 gap-1 w-fit" role="tablist">
        {TABS.map(({ id, label }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {!content ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : tab === 'hero' ? (
        <HeroEditor hero={content.hero} onChange={section('hero')} />
      ) : tab === 'offlineDay' ? (
        <OfflineDayEditor day={content.offlineDay} onChange={section('offlineDay')} />
      ) : tab === 'footer' ? (
        <FooterEditor footer={content.footer} onChange={section('footer')} />
      ) : tab === 'faqs' ? (
        <FaqEditor faqs={content.faqs} onChange={section('faqs')} />
      ) : (
        <TestimonialsEditor testimonials={content.testimonials} onChange={section('testimonials')}
          uploadingId={uploadingId} onUploading={setUploadingId} />
      )}
    </div>
  );
}
