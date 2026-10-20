import { Webhook, WebhookVerificationError } from 'svix';
import type { Logger, PaymentService, WebhookOutcome } from './recurrente.service';
import { silentLogger } from './recurrente.service';
import type { RecurrenteIntentEvent } from './recurrente.types';

export interface WebhookRequest {
  method: string;
  /** The exact bytes Recurrente sent. Re-serialised JSON breaks the signature. */
  rawBody: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookResponse {
  status: number;
  body: string;
  outcome?: WebhookOutcome;
}

export interface WebhookDeps {
  /** Signing secret of the endpoint (whsec_…). Undefined means misconfigured. */
  signingSecret: string | undefined;
  service: PaymentService;
  logger?: Logger;
}

/**
 * Verifies and applies one Recurrente webhook delivery.
 *
 * - Signature: Svix HMAC over `svix-id.svix-timestamp.body` (documented by Recurrente).
 * - Replay: Svix rejects timestamps more than 5 minutes from now; a replay of an
 *   old delivery fails verification, and a replay within the window carries the
 *   same svix-id, which the service already recorded.
 * - Status codes: 4xx for requests that will never be valid (Recurrente should
 *   not retry them), 5xx for transient failures (it retries with backoff).
 */
export async function handleRecurrenteWebhook(request: WebhookRequest, deps: WebhookDeps): Promise<WebhookResponse> {
  const log = deps.logger ?? silentLogger;

  if (request.method !== 'POST') return { status: 405, body: 'Method Not Allowed' };

  if (!deps.signingSecret) {
    log.error('[webhook] signing secret is not configured');
    return { status: 500, body: 'Server configuration error' };
  }
  if (!request.rawBody) return { status: 400, body: 'Empty body' };

  const svixId        = header(request.headers, 'svix-id');
  const svixTimestamp = header(request.headers, 'svix-timestamp');
  const svixSignature = header(request.headers, 'svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { status: 401, body: 'Missing signature headers' };
  }

  let event: RecurrenteIntentEvent;
  try {
    event = new Webhook(deps.signingSecret).verify(request.rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as RecurrenteIntentEvent;
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      log.warn('[webhook] rejected: invalid signature or timestamp', { svixId });
      return { status: 401, body: 'Invalid signature' };
    }
    log.error('[webhook] verification error', { svixId, error: (err as Error).name });
    return { status: 400, body: 'Invalid payload' };
  }

  if (!event || typeof event.event_type !== 'string') {
    return { status: 400, body: 'Invalid event' };
  }

  try {
    const outcome = await deps.service.processWebhookEvent(svixId, event);
    return { status: 200, body: 'ok', outcome };
  } catch (err) {
    // Transient (provider unreachable, Firestore contention…). Recurrente retries;
    // the event id makes the retry safe.
    log.error('[webhook] processing failed — Recurrente will retry', {
      svixId, eventType: event.event_type, error: (err as Error).name, message: (err as Error).message,
    });
    return { status: 500, body: 'Processing error' };
  }
}

function header(headers: WebhookRequest['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
