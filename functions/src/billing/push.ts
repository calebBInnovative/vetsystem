import type { Firestore, Query } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

/** Devices of the platform owner (doc id = FCM token). */
export const OWNER_TOKENS_COLLECTION = 'platformPushTokens';
/** Devices of clinic users (doc id = FCM token; fields clinicId, uid). */
export const CLINIC_TOKENS_COLLECTION = 'clinicPushTokens';

export interface PushMessage {
  title: string;
  body: string;
  /** Path opened when the notification is tapped */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking */
  tag: string;
}

export interface PushResult { sent: number; failed: number }

/** Sends a data-only web push (rendered by public/sw.js) to every token the query returns. */
export async function pushToTokens(tokensQuery: Query, message: PushMessage): Promise<PushResult> {
  const snapshot = await tokensQuery.get();
  const tokens = snapshot.docs.map((d) => d.id);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: { ...message },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });

  // Forget devices that uninstalled the app or revoked permission.
  const stale = response.responses.flatMap((r, i) =>
    !r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-argument']
      .includes(r.error?.code ?? '') ? [snapshot.docs[i].ref] : []);
  await Promise.all(stale.map((ref) => ref.delete()));
  for (const r of response.responses) {
    if (!r.success) logger.warn('[push] delivery to a device failed', { code: r.error?.code });
  }
  return { sent: response.successCount, failed: response.failureCount };
}

export function pushToOwner(db: Firestore, message: PushMessage): Promise<PushResult> {
  return pushToTokens(db.collection(OWNER_TOKENS_COLLECTION), message);
}

export function pushToClinic(db: Firestore, clinicId: string, message: PushMessage): Promise<PushResult> {
  return pushToTokens(db.collection(CLINIC_TOKENS_COLLECTION).where('clinicId', '==', clinicId), message);
}
