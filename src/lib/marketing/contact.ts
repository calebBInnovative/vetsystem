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

let contactRead: Promise<PublicContact> | null = null;

/** One read per page load (floating button and footer); a failed read is retried next call. */
export function fetchPublicContact(): Promise<PublicContact> {
  contactRead ??= getDoc(doc(getFirestoreDb(), 'platform', 'contact'))
    .then((snap) => {
      const data = snap.data();
      return { whatsapp: typeof data?.whatsapp === 'string' ? data.whatsapp.replace(/\D/g, '') : '' };
    })
    .catch((err) => { contactRead = null; throw err; });
  return contactRead;
}

/** 50588880000 → +505 8888 0000 (Nicaraguan numbers); other numbers just get the "+". */
export function formatWhatsapp(phone: string): string {
  const m = /^505(\d{4})(\d{4})$/.exec(phone);
  return m ? `+505 ${m[1]} ${m[2]}` : `+${phone}`;
}

export function whatsappChatUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
