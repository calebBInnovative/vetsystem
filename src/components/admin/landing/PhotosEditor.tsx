'use client';

import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';
import {
  DEFAULT_PHOTOS, LANDING_PHOTOS, PHOTO_ACCEPT, PHOTO_ALT_MAX_LENGTH, isBundledPhoto, photoProblem, uploadSectionPhoto,
  type LandingPhotoKey, type SectionPhoto,
} from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';
import { Counter, INPUT, type Update } from './shared';

const LABELS: Record<LandingPhotoKey, { title: string; where: string }> = {
  hero: { title: 'Portada', where: 'Fondo del lado derecho de la portada; se desvanece hacia el título.' },
  closing: { title: 'Cierre', where: 'Fondo del lado derecho del bloque verde final ("Empieza hoy").' },
};

export function PhotosEditor({ photos, onChange, uploadingId, onUploading, onUploaded }: {
  photos: Record<LandingPhotoKey, SectionPhoto>;
  onChange: Update<Record<LandingPhotoKey, SectionPhoto>>;
  uploadingId: string | null;
  onUploading: (id: string | null) => void;
  /** Storage path of every upload, so one replaced before saving is deleted too. */
  onUploaded: (path: string) => void;
}) {
  const update = (key: LandingPhotoKey, patch: Partial<SectionPhoto>) =>
    onChange((all) => ({ ...all, [key]: { ...all[key], ...patch } }));

  async function choosePhoto(key: LandingPhotoKey, file: File | undefined) {
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) { toast.error(problem); return; }
    onUploading(key);
    try {
      const uploaded = await uploadSectionPhoto(file);
      onUploaded(uploaded.path);
      // The default alt describes the default picture, so a new photo starts without one.
      onChange((all) => ({
        ...all,
        [key]: { ...uploaded, alt: isBundledPhoto(all[key]) ? '' : all[key].alt },
      }));
    } catch (err) {
      console.error('[landing] photo upload failed:', err);
      toast.error('No se pudo subir la foto');
    } finally {
      onUploading(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Fotos de fondo de la página principal: cubren un lado de la sección y se desvanecen hacia el color de fondo. Usa fotos horizontales, con el motivo hacia la derecha y con permiso de uso; se reducen a 1600 px de ancho al subirlas.
      </p>

      {LANDING_PHOTOS.map((key) => {
        const photo = photos[key];
        const bundled = isBundledPhoto(photo);
        return (
          <section key={key} className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-sm">{LABELS[key].title}</h2>
              <p className="text-xs text-muted-foreground">{LABELS[key].where}</p>
            </div>

            <div className="grid sm:grid-cols-[220px_1fr] gap-4">
              <div className="relative aspect-[4/3] rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                {uploadingId === key
                  ? <Loader2 size={20} className="animate-spin text-muted-foreground" />
                  : <Image src={photo.url} alt={photo.alt} fill sizes="220px" className="object-cover" />}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className={cn('cursor-pointer text-sm font-medium text-primary hover:underline',
                    uploadingId && 'pointer-events-none opacity-50')}>
                    Cambiar foto
                    <input type="file" accept={PHOTO_ACCEPT} className="sr-only"
                      onChange={(e) => { void choosePhoto(key, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {!bundled && (
                    <button type="button" disabled={!!uploadingId}
                      onClick={() => onChange((all) => ({ ...all, [key]: DEFAULT_PHOTOS[key] }))}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                      <RotateCcw size={13} /> Restaurar predeterminada
                    </button>
                  )}
                  {bundled && <span className="text-xs text-muted-foreground">Predeterminada (Pexels)</span>}
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-medium">Texto alternativo</span>
                  <input value={photo.alt} onChange={(e) => update(key, { alt: e.target.value })} maxLength={PHOTO_ALT_MAX_LENGTH}
                    placeholder="Qué se ve en la foto, para lectores de pantalla y buscadores" className={INPUT} />
                  <Counter value={photo.alt} max={PHOTO_ALT_MAX_LENGTH} />
                </label>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
