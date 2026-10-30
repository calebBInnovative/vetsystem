import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';

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
  };
}

export function parseLanding(data: Record<string, unknown> | undefined): LandingContent {
  if (!data) return EMPTY_LANDING;
  const list = Array.isArray(data.testimonials) ? data.testimonials : [];
  return {
    testimonials: list.map(parseTestimonial).filter((t): t is Testimonial => t !== null).slice(0, MAX_TESTIMONIALS),
  };
}

export function newTestimonial(): Testimonial {
  return { id: crypto.randomUUID(), name: '', clinic: '', city: '', quote: '', rating: 5, visible: true };
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
