import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';

/**
 * Public sales contact shown on the landing page (platform/contact). It mirrors
 * platform/billing.ownerWhatsapp — written by saveBillingConfig() — because the
 * billing document holds account numbers and is readable only when signed in.
 */
export interface PublicContact {
  /** International format without "+" (e.g. 50588880000); '' when not configured. */
  whatsapp: string;
}

export async function fetchPublicContact(): Promise<PublicContact> {
  const data = (await getDoc(doc(getFirestoreDb(), 'platform', 'contact'))).data();
  return { whatsapp: typeof data?.whatsapp === 'string' ? data.whatsapp.replace(/\D/g, '') : '' };
}

export function whatsappChatUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
