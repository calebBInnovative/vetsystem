#!/usr/bin/env node
// Validates a Recurrente secret key with GET https://app.recurrente.com/api/test.
// That endpoint only identifies the account: it creates no checkout and moves no money.
//
// The key is read from the RECURRENTE_SECRET_KEY environment variable and is
// never printed. Run it only when you mean to — see docs/payments/recurrente.md:
//
//   cd functions && npm run build
//   RECURRENTE_SECRET_KEY="$(firebase functions:secrets:access RECURRENTE_SECRET_KEY)" \
//     npm run recurrente:check-credentials

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RecurrenteClient } = require('../lib/payments/recurrente/recurrente.client.js');

const key = process.env.RECURRENTE_SECRET_KEY;
if (!key?.trim()) {
  console.error('✖ RECURRENTE_SECRET_KEY is not set.');
  process.exit(1);
}

const prefix = key.trim().startsWith('sk_live_') ? 'sk_live_' : key.trim().startsWith('sk_test_') ? 'sk_test_' : 'unknown';
console.log(`Checking a ${prefix} key against GET /api/test (read-only)…`);

try {
  const result = await new RecurrenteClient({ secretKey: key }).testCredentials();
  console.log('✔ Credentials accepted');
  console.log(`  account:     ${result.account_id}`);
  console.log(`  environment: ${result.environment}`);
  console.log(`  sandbox_id:  ${result.sandbox_id ?? '—'}`);
  console.log(`  message:     ${result.message}`);
} catch (err) {
  // RecurrenteError carries only a code, a status and the provider's short message — never the key.
  console.error(`✖ ${err.code ?? 'error'}${err.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}: ${err.message}`);
  process.exit(1);
}
