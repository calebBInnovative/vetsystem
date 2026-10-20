#!/usr/bin/env node
// Moves the expiration date of existing clinic licenses to a given day, so
// clinics registered before billing started have to pay from that day on.
//
// DRY RUN by default: it prints what it would change and writes nothing.
// Writing needs --apply. Credentials come from Application Default Credentials
// (`gcloud auth application-default login`), never from a key file in the repo.
//
// Usage:
//   node scripts/set-license-expiration.mjs --project vetsystem-b7675 --date 2026-10-21 \
//     [--exclude clinic-a,clinic-b] [--apply]
//
// Rules:
// - The demo clinic is always skipped.
// - A license that already expires on or before --date is left alone: this
//   never extends anyone.
// - A clinic without a license document gets one expiring on --date (the app
//   would otherwise treat it as expired right away).
// - The previous date is kept in previousExpirationDate so the change can be undone.

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    date:    { type: 'string' },
    exclude: { type: 'string', default: '' },
    apply:   { type: 'boolean', default: false },
  },
});

const fail = (message) => { console.error(`✖ ${message}`); process.exit(1); };

if (!values.project) fail('--project is required.');
if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) fail('--date YYYY-MM-DD is required.');
if (process.env.FIRESTORE_EMULATOR_HOST) console.log(`(emulator: ${process.env.FIRESTORE_EMULATOR_HOST})`);

const excluded = new Set(['demo', ...values.exclude.split(',').map((s) => s.trim()).filter(Boolean)]);

initializeApp(process.env.FIRESTORE_EMULATOR_HOST
  ? { projectId: values.project }
  : { projectId: values.project, credential: applicationDefault() });
const db = getFirestore();

const owners = new Map();
for (const user of (await db.collection('users').get()).docs) {
  const { clinicId, role, email } = user.data();
  if (clinicId && (role === 'admin' || role === 'master')) {
    owners.set(clinicId, [...(owners.get(clinicId) ?? []), `${email ?? user.id} (${role})`]);
  }
}

const clinics = await db.collection('clinics').get();
const changes = [];

console.log(`\nProject ${values.project} — ${clinics.size} clinics — target date ${values.date}\n`);
for (const clinic of clinics.docs) {
  const licenseRef = clinic.ref.collection('license').doc('data');
  const license = (await licenseRef.get()).data();
  const current = license?.expirationDate ?? null;
  const who = (owners.get(clinic.id) ?? ['no admin']).join(', ');

  let action;
  if (excluded.has(clinic.id))                  action = 'skip (excluded)';
  else if (current && current <= values.date)   action = 'skip (already expires by then)';
  else {
    action = current ? `${current} → ${values.date}` : `no license → create, expires ${values.date}`;
    changes.push({ licenseRef, current, exists: !!license });
  }
  console.log(`  ${clinic.id.padEnd(28)} ${String(license?.plan ?? '—').padEnd(8)} ${action}\n      ${clinic.data().name ?? ''} · ${who}`);
}

if (!values.apply) {
  console.log(`\nDry run: ${changes.length} license(s) would change. Re-run with --apply to write.`);
  process.exit(0);
}

const batch = db.batch();
for (const { licenseRef, current, exists } of changes) {
  const patch = {
    expirationDate:         values.date,
    previousExpirationDate: current,
    updatedAt:              FieldValue.serverTimestamp(),
  };
  if (exists) batch.update(licenseRef, patch);
  else batch.set(licenseRef, { ...patch, plan: 'Trial', subscription: true });
}
await batch.commit();
console.log(`\n✔ ${changes.length} license(s) updated.`);
