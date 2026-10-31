import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirestoreDb, getStorageBucket } from '@/lib/firebase/firebase.config';

/**
 * Landing page content the platform owner edits at /admin/landing, stored in
 * platform/landing. Public in firestore.rules: it holds only what the landing
 * already shows to every visitor.
 */

export interface Testimonial {
  id: string;
  /** Person quoted, e.g. "Dra. Sofía Martínez" */
  name: string;
  clinic: string;
  city: string;
  quote: string;
  /** 1–5 stars */
  rating: number;
  /** Hidden testimonials stay saved but are not shown on the landing. */
  visible: boolean;
  /** Public download URL of the photo in Storage, '' for the initial-letter avatar. */
  photoUrl: string;
  /** Storage path of the photo (landing/<id>.jpg), kept to delete it when replaced. */
  photoPath: string;
}

export interface HeroContent {
  /** Small pill above the title */
  badge: string;
  title: string;
  /** Part of the title drawn in the brand color; ignored when the title does not contain it. */
  highlight: string;
  subtitle: string;
  /** Sign-up button text */
  primaryCta: string;
  /** Live demo button text */
  secondaryCta: string;
  /** Short reassurances under the buttons (max HERO_MAX_TRUST_POINTS) */
  trustPoints: string[];
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  visible: boolean;
}

/** One moment of the "a day without internet" timeline. */
export interface OfflineStep {
  id: string;
  /** Free text, e.g. "7:30 a. m." */
  time: string;
  title: string;
  text: string;
}

export interface OfflineDayContent {
  visible: boolean;
  title: string;
  subtitle: string;
  /** The last step is drawn as the moment the connection returns. */
  steps: OfflineStep[];
}

export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
};

export interface FooterContent {
  tagline: string;
  /** '' hides the e-mail line */
  email: string;
  city: string;
  /** Shows the sales WhatsApp from platform/contact (set in /admin/payments → Configuración). */
  showWhatsapp: boolean;
  /** https:// profile URLs; '' hides that network */
  socials: Record<SocialNetwork, string>;
}

export interface LandingContent {
  hero: HeroContent;
  offlineDay: OfflineDayContent;
  faqs: Faq[];
  testimonials: Testimonial[];
  footer: FooterContent;
}

export const MAX_TESTIMONIALS = 12;
export const QUOTE_MAX_LENGTH = 400;
export const MAX_FAQS = 15;
export const ANSWER_MAX_LENGTH = 600;
export const HERO_MAX_TRUST_POINTS = 3;
export const HERO_LIMITS = { badge: 60, title: 120, highlight: 40, subtitle: 240, primaryCta: 30, secondaryCta: 30, trustPoint: 40 } as const;

/** What the landing shows until the owner saves something else. */
export const DEFAULT_HERO: HeroContent = {
  badge: 'Hecho para clínicas en Nicaragua',
  title: 'El sistema veterinario todo en uno que Nicaragua estaba esperando',
  highlight: 'Nicaragua',
  subtitle: 'Gestiona pacientes, citas, inventario y cobros — aunque no tengas internet. Simple, rápido y diseñado para la realidad de nuestras clínicas.',
  primaryCta: 'Comenzar gratis',
  secondaryCta: 'Probar demo',
  trustPoints: ['7 días de prueba gratis', 'Cancela cuando quieras'],
};

const faq = (id: string, question: string, answer: string): Faq => ({ id, question, answer, visible: true });

export const DEFAULT_FAQS: Faq[] = [
  faq('card', '¿Necesito tarjeta para probarlo?',
    'No. Tienes 7 días gratis con todo incluido y sin tarjeta. Al terminar eliges el plan que mejor le quede a tu clínica.'),
  faq('demo', '¿Puedo verlo antes de crear una cuenta?',
    'Sí. El demo abre el sistema completo con datos de ejemplo, sin registrarte.'),
  faq('offline', '¿Qué pasa si se va el internet?',
    'Sigues atendiendo, registrando consultas y cobrando. Todo se guarda en tu equipo y se sincroniza cuando vuelve la conexión. Si pasas más de 30 días sin conectarte, el sistema queda en solo lectura hasta que vuelvas a sincronizar.'),
  faq('install', '¿Tengo que instalar algo?',
    'No. Funciona desde el navegador en computadora, tablet o celular. Si quieres, puedes agregarlo como app a tu pantalla de inicio.'),
  faq('payment', '¿Cómo pago la suscripción?',
    'Por transferencia bancaria o Kash. Reportas el pago desde el sistema y tu plan se activa en cuanto lo confirmamos.'),
  faq('excel', '¿Puedo pasar mis datos desde Excel?',
    'Sí, puedes importar tu catálogo de productos y servicios desde un archivo de Excel en lugar de escribirlo a mano.'),
  faq('team', '¿Puede usarlo todo mi equipo?',
    'Sí. Cada persona entra con su propio usuario y rol (administración, veterinario o recepción), con permisos por módulo. La cantidad de usuarios depende del plan.'),
  faq('security', '¿Mis datos están seguros?',
    'Se respaldan en la nube de Google (Firebase) y cada clínica solo puede ver su propia información.'),
  faq('contract', '¿Hay contrato o permanencia?',
    'No. Pagas mes a mes o por año y puedes dejar de usarlo cuando quieras.'),
];

export const MAX_OFFLINE_STEPS = 6;
export const OFFLINE_LIMITS = { title: 80, subtitle: 200, time: 16, stepTitle: 50, stepText: 200 } as const;

const step = (id: string, time: string, title: string, text: string): OfflineStep => ({ id, time, title, text });

export const DEFAULT_OFFLINE_DAY: OfflineDayContent = {
  visible: true,
  title: 'Un día sin internet en tu clínica',
  subtitle: 'Se cae la conexión del barrio a primera hora. Así se ve tu día con VetSystem.',
  steps: [
    step('open', '7:30 a. m.', 'Abres la clínica', 'No hay internet. Abres VetSystem igual y la agenda del día ya está ahí.'),
    step('consult', '9:00 a. m.', 'Consulta de Luna', 'Registras peso, diagnóstico y receta. Queda guardado en tu equipo al instante.'),
    step('sale', '11:30 a. m.', 'Cobras y vendes', 'Cobras la consulta y una bolsa de concentrado. El inventario se descuenta solo.'),
    step('stock', '2:00 p. m.', 'Aviso de stock bajo', 'El sistema te avisa que se están acabando las vacunas, sin depender de la nube.'),
    step('sync', '4:45 p. m.', 'Vuelve la conexión', 'Todo lo del día se sincroniza solo con la nube. No tienes que hacer nada.'),
  ],
};

export const FOOTER_LIMITS = { tagline: 160, email: 80, city: 60, social: 200 } as const;

export const DEFAULT_FOOTER: FooterContent = {
  tagline: 'El sistema de gestión veterinaria diseñado para emprendedores de Nicaragua.',
  email: 'hola@vetsystem.app',
  city: 'Managua, Nicaragua',
  showWhatsapp: true,
  socials: { facebook: '', instagram: '', tiktok: '', youtube: '' },
};

export const DEFAULT_LANDING: LandingContent = {
  hero: DEFAULT_HERO, offlineDay: DEFAULT_OFFLINE_DAY, faqs: DEFAULT_FAQS, testimonials: [], footer: DEFAULT_FOOTER,
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Photos live in the public landing/ folder (storage.rules); anything else is ignored. */
const PHOTO_PATH = /^landing\/[a-f0-9]{32}\.jpg$/;
const PHOTO_URL = /^(https:\/\/firebasestorage\.googleapis\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\//;

function parseTestimonial(value: unknown): Testimonial | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const name = text(r.name, 80);
  const quote = text(r.quote, QUOTE_MAX_LENGTH);
  if (!name || !quote) return null;
  const rating = typeof r.rating === 'number' ? Math.min(5, Math.max(1, Math.round(r.rating))) : 5;
  return {
    id: text(r.id, 40) || crypto.randomUUID(),
    name,
    clinic: text(r.clinic, 80),
    city: text(r.city, 40),
    quote,
    rating,
    visible: r.visible !== false,
    ...parsePhoto(r),
  };
}

function parsePhoto(r: Record<string, unknown>): Pick<Testimonial, 'photoUrl' | 'photoPath'> {
  const photoUrl = typeof r.photoUrl === 'string' ? r.photoUrl : '';
  const photoPath = typeof r.photoPath === 'string' ? r.photoPath : '';
  return PHOTO_PATH.test(photoPath) && PHOTO_URL.test(photoUrl) ? { photoUrl, photoPath } : { photoUrl: '', photoPath: '' };
}

/** Every hero field falls back to its default when missing or blank, so the hero is never empty. */
function parseHero(value: unknown): HeroContent {
  if (!value || typeof value !== 'object') return DEFAULT_HERO;
  const r = value as Record<string, unknown>;
  const field = (key: Exclude<keyof HeroContent, 'trustPoints' | 'highlight'>) =>
    text(r[key], HERO_LIMITS[key]) || DEFAULT_HERO[key];
  return {
    badge: field('badge'),
    title: field('title'),
    // A blank highlight is a choice (no colored words), not a missing field.
    highlight: typeof r.highlight === 'string' ? text(r.highlight, HERO_LIMITS.highlight) : DEFAULT_HERO.highlight,
    subtitle: field('subtitle'),
    primaryCta: field('primaryCta'),
    secondaryCta: field('secondaryCta'),
    trustPoints: Array.isArray(r.trustPoints)
      ? r.trustPoints.map((t) => text(t, HERO_LIMITS.trustPoint)).filter(Boolean).slice(0, HERO_MAX_TRUST_POINTS)
      : DEFAULT_HERO.trustPoints,
  };
}

function parseFaq(value: unknown): Faq | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const question = text(r.question, 160);
  const answer = text(r.answer, ANSWER_MAX_LENGTH);
  if (!question || !answer) return null;
  return { id: text(r.id, 40) || crypto.randomUUID(), question, answer, visible: r.visible !== false };
}

function parseStep(value: unknown): OfflineStep | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const title = text(r.title, OFFLINE_LIMITS.stepTitle);
  const body = text(r.text, OFFLINE_LIMITS.stepText);
  if (!title || !body) return null;
  return { id: text(r.id, 40) || crypto.randomUUID(), time: text(r.time, OFFLINE_LIMITS.time), title, text: body };
}

function parseOfflineDay(value: unknown): OfflineDayContent {
  if (!value || typeof value !== 'object') return DEFAULT_OFFLINE_DAY;
  const r = value as Record<string, unknown>;
  return {
    visible: r.visible !== false,
    title: text(r.title, OFFLINE_LIMITS.title) || DEFAULT_OFFLINE_DAY.title,
    subtitle: typeof r.subtitle === 'string' ? text(r.subtitle, OFFLINE_LIMITS.subtitle) : DEFAULT_OFFLINE_DAY.subtitle,
    steps: Array.isArray(r.steps) ? parseList(r.steps, parseStep, MAX_OFFLINE_STEPS) : DEFAULT_OFFLINE_DAY.steps,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string): boolean {
  return EMAIL.test(value);
}

/** Only https links are published, so a typo cannot turn into a javascript: or http link. */
export function validSocialUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parseFooter(value: unknown): FooterContent {
  if (!value || typeof value !== 'object') return DEFAULT_FOOTER;
  const r = value as Record<string, unknown>;
  const rawSocials = (r.socials && typeof r.socials === 'object' ? r.socials : {}) as Record<string, unknown>;
  const email = text(r.email, FOOTER_LIMITS.email);
  return {
    tagline: typeof r.tagline === 'string' ? text(r.tagline, FOOTER_LIMITS.tagline) : DEFAULT_FOOTER.tagline,
    email: EMAIL.test(email) ? email : '',
    city: typeof r.city === 'string' ? text(r.city, FOOTER_LIMITS.city) : DEFAULT_FOOTER.city,
    showWhatsapp: r.showWhatsapp !== false,
    socials: Object.fromEntries(SOCIAL_NETWORKS.map((n) => {
      const url = text(rawSocials[n], FOOTER_LIMITS.social);
      return [n, validSocialUrl(url) ? url : ''];
    })) as Record<SocialNetwork, string>,
  };
}

function parseList<T>(value: unknown, parse: (v: unknown) => T | null, max: number): T[] {
  return (Array.isArray(value) ? value : []).map(parse).filter((t): t is T => t !== null).slice(0, max);
}

/** Missing sections take their defaults; a saved empty list stays empty. */
export function parseLanding(data: Record<string, unknown> | undefined): LandingContent {
  if (!data) return DEFAULT_LANDING;
  return {
    hero: parseHero(data.hero),
    offlineDay: parseOfflineDay(data.offlineDay),
    faqs: Array.isArray(data.faqs) ? parseList(data.faqs, parseFaq, MAX_FAQS) : DEFAULT_FAQS,
    testimonials: parseList(data.testimonials, parseTestimonial, MAX_TESTIMONIALS),
    footer: parseFooter(data.footer),
  };
}

/** Splits the title around the highlighted words (case-sensitive, first match). */
export function splitHeroTitle(hero: Pick<HeroContent, 'title' | 'highlight'>): [string, string, string] {
  const at = hero.highlight ? hero.title.indexOf(hero.highlight) : -1;
  if (at < 0) return [hero.title, '', ''];
  return [hero.title.slice(0, at), hero.highlight, hero.title.slice(at + hero.highlight.length)];
}

export function newOfflineStep(): OfflineStep {
  return { id: crypto.randomUUID(), time: '', title: '', text: '' };
}

export function newFaq(): Faq {
  return { id: crypto.randomUUID(), question: '', answer: '', visible: true };
}

export function newTestimonial(): Testimonial {
  return { id: crypto.randomUUID(), name: '', clinic: '', city: '', quote: '', rating: 5, visible: true, photoUrl: '', photoPath: '' };
}

let landingRead: Promise<LandingContent> | null = null;

/** One read per page load, shared by every landing section; a failed read is retried next call. */
export function fetchLandingContent(): Promise<LandingContent> {
  landingRead ??= getDoc(doc(getFirestoreDb(), 'platform', 'landing'))
    .then((snap) => parseLanding(snap.data()))
    .catch((err) => { landingRead = null; throw err; });
  return landingRead;
}

/** Platform owner's live view (/admin/landing). */
export function subscribeLandingContent(
  onChange: (content: LandingContent) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirestoreDb(), 'platform', 'landing'),
    (snap) => onChange(parseLanding(snap.data())),
    (err) => { console.warn('[landing] content listener failed:', err); onError?.(err); },
  );
}

/** Platform owner only (firestore.rules). Saved through the same parsing the landing reads with. */
export async function saveLandingContent(content: LandingContent): Promise<void> {
  const clean = parseLanding({ ...content });
  await setDoc(doc(getFirestoreDb(), 'platform', 'landing'), { ...clean, updatedAt: serverTimestamp() });
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
const PHOTO_SIZE = 320;
const PHOTO_SOURCE_MAX_BYTES = 15 * 1024 * 1024;

/** Problem with a chosen photo, in Spanish for the toast, or null when it can be used. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_ACCEPT.split(',').includes(file.type)) return 'Usa una foto JPG, PNG o WebP';
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return 'La foto pesa demasiado (máximo 15 MB)';
  return null;
}

/** Center-crops to a square and scales to PHOTO_SIZE, so the landing never loads a phone-camera original. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo encoding failed'))), 'image/jpeg', 0.85));
}

/** Platform owner only (storage.rules). Returns the fields to store on the testimonial. */
export async function uploadTestimonialPhoto(file: File): Promise<Pick<Testimonial, 'photoUrl' | 'photoPath'>> {
  const blob = await squareJpeg(file);
  const photoPath = `landing/${crypto.randomUUID().replace(/-/g, '')}.jpg`;
  const photoRef = ref(getStorageBucket(), photoPath);
  await uploadBytes(photoRef, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' });
  return { photoPath, photoUrl: await getDownloadURL(photoRef) };
}

/** Best effort: a leftover file only costs storage, so a failure is logged, not thrown. */
export async function deleteTestimonialPhotos(paths: string[]): Promise<void> {
  await Promise.all(paths.filter((p) => PHOTO_PATH.test(p)).map((p) =>
    deleteObject(ref(getStorageBucket(), p)).catch((err) => console.warn('[landing] photo delete failed:', p, err))));
}
