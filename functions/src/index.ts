import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { Webhook } from 'svix';

initializeApp();

setGlobalOptions({ region: 'us-central1' });

const RECURRENTE_API = 'https://app.recurrente.com/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecurrenteCheckoutResponse {
  id: string;
  checkout_url: string;
  status: string;
}

interface RecurrenteWebhookEvent {
  event_type: string;
  id: string;
  status: string;
  metadata?: Record<string, string>;
  customer?: { id: string; email?: string };
  subscription?: {
    id: string;
    status: string;
    current_period_end?: string;
  };
  product?: { id: string; name?: string };
}

// ─── createCheckout ───────────────────────────────────────────────────────────
// Callable from the app: creates a Recurrente hosted checkout session.
// Returns { checkoutUrl } for the client to redirect to.

export const createCheckout = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { clinicId, successUrl, cancelUrl } = request.data as {
      clinicId: string;
      successUrl: string;
      cancelUrl: string;
    };

    if (!clinicId || !successUrl || !cancelUrl) {
      throw new HttpsError('invalid-argument', 'clinicId, successUrl and cancelUrl are required.');
    }

    // Verify the caller owns this clinic
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.clinicId !== clinicId) {
      throw new HttpsError('permission-denied', 'You do not belong to this clinic.');
    }

    const secretKey    = process.env.RECURRENTE_SECRET_KEY;
    const planName     = process.env.RECURRENTE_PLAN_NAME     ?? 'VetSystem Pro - Plan Mensual';
    const planAmount   = parseInt(process.env.RECURRENTE_PLAN_AMOUNT ?? '3000', 10);
    const planCurrency = process.env.RECURRENTE_PLAN_CURRENCY ?? 'USD';

    if (!secretKey) {
      throw new HttpsError('internal', 'Payment configuration missing.');
    }

    const body = {
      items: [{
        name:            planName,
        amount_in_cents: planAmount,
        currency:        planCurrency,
        quantity:        1,
      }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      // Pass clinicId in metadata so the webhook can identify the clinic
      metadata: { clinicId, uid: request.auth.uid },
    };

    const response = await fetch(`${RECURRENTE_API}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SECRET-KEY': secretKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[createCheckout] Recurrente error:', error);
      throw new HttpsError('internal', 'Failed to create payment session.');
    }

    const data = (await response.json()) as RecurrenteCheckoutResponse;
    return { checkoutUrl: data.checkout_url };
  },
);

// ─── recurrenteWebhook ────────────────────────────────────────────────────────
// Public HTTPS endpoint for Recurrente webhook events.
// Verifies Svix signature, then updates subscription state in Firestore.

export const recurrenteWebhook = onRequest(
  { cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const webhookSecret = process.env.RECURRENTE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[webhook] RECURRENTE_WEBHOOK_SECRET not set');
      res.status(500).send('Server configuration error');
      return;
    }

    // Verify Svix signature
    const wh = new Webhook(webhookSecret);
    let event: RecurrenteWebhookEvent;
    try {
      const payload = req.rawBody?.toString() ?? JSON.stringify(req.body);
      event = wh.verify(payload, {
        'svix-id':        req.headers['svix-id'] as string,
        'svix-timestamp': req.headers['svix-timestamp'] as string,
        'svix-signature': req.headers['svix-signature'] as string,
      }) as RecurrenteWebhookEvent;
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err);
      res.status(400).send('Invalid signature');
      return;
    }

    console.log(`[webhook] event: ${event.event_type} id: ${event.id}`);

    const clinicId = event.metadata?.clinicId;
    if (!clinicId) {
      // No clinicId — nothing to update, but acknowledge receipt
      res.status(200).send('ok');
      return;
    }

    const db = getFirestore();
    const clinicRef = db.collection('clinics').doc(clinicId);

    try {
      switch (event.event_type) {
        // Payment confirmed — activate subscription
        case 'intent.succeeded':
        case 'subscription.created':
        case 'subscription.updated': {
          // Calculate next expiry: 30 days from now (or from subscription period end)
          let expirationDate: string;
          if (event.subscription?.current_period_end) {
            expirationDate = event.subscription.current_period_end.slice(0, 10);
          } else {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            expirationDate = expiry.toISOString().slice(0, 10);
          }

          await clinicRef.set(
            {
              subscription: true,
              expirationDate,
              plan: 'monthly',
              subscriptionId: event.subscription?.id ?? null,
              subscriptionUpdatedAt: Timestamp.now(),
            },
            { merge: true },
          );
          console.log(`[webhook] Activated subscription for clinic ${clinicId} until ${expirationDate}`);
          break;
        }

        // Subscription ended or payment failed after retries
        case 'subscription.canceled':
        case 'subscription.past_due': {
          await clinicRef.set(
            {
              subscription: false,
              subscriptionUpdatedAt: Timestamp.now(),
            },
            { merge: true },
          );
          console.log(`[webhook] Deactivated subscription for clinic ${clinicId} (${event.event_type})`);
          break;
        }

        default:
          // Unhandled event type — no action needed
          break;
      }
    } catch (err) {
      console.error(`[webhook] Firestore update failed for clinic ${clinicId}:`, err);
      res.status(500).send('Internal error');
      return;
    }

    res.status(200).send('ok');
  },
);
