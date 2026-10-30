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

export interface LandingContent {
  testimonials: Testimonial[];
}

export const MAX_TESTIMONIALS = 12;
export const QUOTE_MAX_LENGTH = 400;

const EMPTY_LANDING: LandingContent = { testimonials: [] };

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

export function parseLanding(data: Record<string, unknown> | undefined): LandingContent {
  if (!data) return EMPTY_LANDING;
  const list = Array.isArray(data.testimonials) ? data.testimonials : [];
  return {
    testimonials: list.map(parseTestimonial).filter((t): t is Testimonial => t !== null).slice(0, MAX_TESTIMONIALS),
  };
}

export function newTestimonial(): Testimonial {
  return { id: crypto.randomUUID(), name: '', clinic: '', city: '', quote: '', rating: 5, visible: true, photoUrl: '', photoPath: '' };
}

/** One-off read for the public landing page. */
export async function fetchLandingContent(): Promise<LandingContent> {
  return parseLanding((await getDoc(doc(getFirestoreDb(), 'platform', 'landing'))).data());
}

/** Platform owner's live view (/admin/landing). */
export function subscribeLandingContent(onChange: (content: LandingContent) => void): Unsubscribe {
  return onSnapshot(
    doc(getFirestoreDb(), 'platform', 'landing'),
    (snap) => onChange(parseLanding(snap.data())),
    (err) => console.warn('[landing] content listener failed:', err),
  );
}

/** Platform owner only (firestore.rules). Incomplete testimonials (no name or quote) are dropped. */
export async function saveLandingContent(content: LandingContent): Promise<void> {
  const testimonials = content.testimonials
    .map(parseTestimonial)
    .filter((t): t is Testimonial => t !== null)
    .slice(0, MAX_TESTIMONIALS);
  await setDoc(doc(getFirestoreDb(), 'platform', 'landing'), { testimonials, updatedAt: serverTimestamp() });
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
