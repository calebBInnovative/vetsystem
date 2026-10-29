/**
 * The person who runs the SaaS. Mirrors isPlatformOwner() in firestore.rules and
 * PLATFORM_OWNER_EMAILS in src/lib/usage/usage.service.ts — change all three together.
 */
const PLATFORM_OWNER_EMAILS = ['calebgtnbacon@gmail.com'];

export function isPlatformOwnerEmail(email: unknown): boolean {
  return typeof email === 'string' && PLATFORM_OWNER_EMAILS.includes(email.toLowerCase().trim());
}
