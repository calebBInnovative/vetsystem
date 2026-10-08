import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Removes clinic data from an error event before it leaves the device.
 *
 * An error message routinely carries whatever the code was handling — a patient
 * name, an owner's phone, an e-mail. Those belong to the clinic's clients, not
 * to us, and they must not end up in a third-party dashboard. What stays is
 * what actually helps debugging: the error type, the stack, the route, the
 * clinicId and the user's role.
 *
 * Written as a pure function so it can be tested without a browser or a Sentry
 * client — the one piece of this integration that must never silently stop
 * working.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** Nicaraguan numbers: 8 digits, often written 8888-8888, with optional +505 */
const PHONE_RE = /(\+?505[\s-]?)?\b\d{4}[\s-]?\d{4}\b/g;
/** Long digit runs: card numbers, document ids */
const LONG_DIGITS_RE = /\b\d{9,}\b/g;

/** Keys whose value is replaced wholesale, wherever they appear. */
const SENSITIVE_KEYS = new Set([
  'name', 'patientname', 'ownername', 'clientname', 'username', 'fullname',
  'email', 'mail', 'phone', 'tel', 'telefono', 'address', 'direccion',
  'notes', 'notas', 'concept', 'concepto', 'description', 'descripcion',
  'password', 'token', 'apikey', 'authorization',
]);

const REDACTED = '[redacted]';

/**
 * Names that cannot be matched by a pattern but are known at runtime — the
 * signed-in user and the clinic. Patterns catch e-mails, phones and long digit
 * runs; a person's name is just words, and guessing at them would mangle real
 * error text. So the names we actually know get removed by exact match, and the
 * rest is handled by convention: never interpolate a patient or owner name into
 * an error message.
 */
let knownTerms: string[] = [];

export function setScrubTerms(terms: (string | undefined | null)[]): void {
  knownTerms = terms
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 3)
    .map((t) => t.trim());
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scrubText(text: string): string {
  let out = text
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED)
    .replace(LONG_DIGITS_RE, REDACTED);

  for (const term of knownTerms) {
    out = out.replace(new RegExp(escapeRegExp(term), 'gi'), REDACTED);
  }
  return out;
}

/** Depth-limited so a cyclic or enormous payload cannot hang the error path. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return REDACTED;
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Sentry's beforeSend hook. Returning null drops the event entirely.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  // Identify the clinic and the role, never the person
  if (event.user) {
    event.user = { id: event.user.id };
  }

  if (event.message) event.message = scrubText(event.message);

  for (const entry of event.exception?.values ?? []) {
    if (entry.value) entry.value = scrubText(entry.value);
  }

  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    if (crumb.data) crumb.data = scrubValue(crumb.data) as Record<string, unknown>;
  }

  if (event.extra)   event.extra   = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;

  // Query strings and hashes can carry anything a form put there
  if (event.request?.url) event.request.url = scrubText(event.request.url.split('?')[0]);
  delete event.request?.cookies;
  delete event.request?.headers;

  return event;
}
