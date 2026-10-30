// Storage security rules tests. Run with `npm run test:rules` (Firestore + Storage emulators).
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

const PLATFORM_OWNER_EMAIL = 'calebgtnbacon@gmail.com';
const PHOTO = 'landing/0123456789abcdef0123456789abcdef.jpg';
// A fresh name per upload, so no case depends on what an earlier one left behind.
const freshPhoto = () => `landing/${crypto.randomUUID().replace(/-/g, '')}.jpg`;
const JPEG = { contentType: 'image/jpeg' };
const bytes = (n) => new Uint8Array(n);
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vetsystem-rules',
    storage: { rules: readFileSync('storage.rules', 'utf8') },
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearStorage();
  // storage.rules reads the uploader's clinic and role from Firestore.
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'users/owner-a'), { uid: 'owner-a', clinicId: 'clinic-a', role: 'admin' }));
});

const owner = () => env.authenticatedContext('platform', { email: PLATFORM_OWNER_EMAIL }).storage();
const clinicUser = () => env.authenticatedContext('owner-a', { email: 'owner@clinic-a.test' }).storage();
const visitor = () => env.unauthenticatedContext().storage();

describe('landing photos', () => {
  it('the platform owner uploads and deletes small JPEGs', async () => {
    await assertSucceeds(uploadBytes(ref(owner(), PHOTO), bytes(1024), JPEG));
    await assertSucceeds(deleteObject(ref(owner(), PHOTO)));
  });

  it('visitors can see a photo but not upload or delete one', async () => {
    await env.withSecurityRulesDisabled((ctx) => uploadBytes(ref(ctx.storage(), PHOTO), bytes(16), JPEG));
    await assertSucceeds(getBytes(ref(visitor(), PHOTO)));
    await assertFails(uploadBytes(ref(visitor(), 'landing/ffffffffffffffffffffffffffffffff.jpg'), bytes(16), JPEG));
    await assertFails(deleteObject(ref(visitor(), PHOTO)));
  });

  it('a clinic user cannot upload to the landing folder', async () => {
    await assertFails(uploadBytes(ref(clinicUser(), PHOTO), bytes(16), JPEG));
  });

  it('refuses other names, types and sizes', async () => {
    await assertFails(uploadBytes(ref(owner(), 'landing/evil.html'), bytes(16), { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(owner(), freshPhoto()), bytes(16), { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(owner(), freshPhoto()), bytes(1024 * 1024 + 1), JPEG));
  });

  it('a published photo cannot be overwritten', async () => {
    const path = freshPhoto();
    await assertSucceeds(uploadBytes(ref(owner(), path), bytes(16), JPEG));
    await assertFails(uploadBytes(ref(owner(), path), bytes(16), JPEG));
  });
});

describe('payment receipts', () => {
  it('a clinic manager uploads a receipt but cannot swap it afterwards', async () => {
    const receipt = `paymentReceipts/clinic-a/${crypto.randomUUID().replace(/-/g, '')}.jpg`;
    await assertSucceeds(uploadBytes(ref(clinicUser(), receipt), bytes(16), JPEG));
    await assertFails(uploadBytes(ref(clinicUser(), receipt), bytes(16), JPEG));
  });

  it('a clinic cannot upload into another clinic folder', async () => {
    await assertFails(uploadBytes(ref(clinicUser(), 'paymentReceipts/clinic-b/x.jpg'), bytes(16), JPEG));
  });
});
