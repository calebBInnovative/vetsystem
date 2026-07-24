/**
 * bump-db-version.mjs
 *
 * Detects changes to the consolidated Dexie schema block and automatically
 * increments the version number so every schema change results in a proper
 * migration for existing users.
 *
 * Usage:
 *   node scripts/bump-db-version.mjs          # auto-bump (local / prebuild)
 *   node scripts/bump-db-version.mjs --check  # fail if schema changed but not committed (CI)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';

const DB_FILE   = 'src/lib/db/database.ts';
const HASH_FILE = 'src/lib/db/.schema-hash';
const CHECK_MODE = process.argv.includes('--check');

// ── 1. Read the database file ─────────────────────────────────────────────────

const content = readFileSync(DB_FILE, 'utf8');

// ── 2. Find ALL version declarations and pick the highest (consolidated block) ─

const VERSION_RE = /this\.version\((\d+)\)\.stores\(\{([\s\S]*?)\}\)/g;
const matches = [...content.matchAll(VERSION_RE)];

if (!matches.length) {
  console.error('❌ Could not find any this.version(N).stores({}) blocks in', DB_FILE);
  process.exit(1);
}

const top = matches.reduce((max, m) =>
  parseInt(m[1]) > parseInt(max[1]) ? m : max
);

const currentVersion = parseInt(top[1]);
const schemaBody     = top[2]; // everything inside .stores({ ... })

// ── 3. Hash the schema body (not the version number itself) ──────────────────

const hash = createHash('sha256')
  .update(schemaBody.trim())
  .digest('hex')
  .slice(0, 16);

// ── 4. Compare with the stored hash ──────────────────────────────────────────

const storedHash = existsSync(HASH_FILE)
  ? readFileSync(HASH_FILE, 'utf8').trim()
  : '';

if (hash === storedHash) {
  console.log(`✅  DB schema unchanged (v${currentVersion})`);
  process.exit(0);
}

// ── 5. Schema changed ─────────────────────────────────────────────────────────

if (CHECK_MODE) {
  // In CI we refuse to silently mutate source files — fail loudly instead.
  console.error('');
  console.error('❌  DB schema changed but the version was NOT bumped in git.');
  console.error('');
  console.error('    Run this locally, then commit both files:');
  console.error('      npm run db:bump');
  console.error('      git add src/lib/db/database.ts src/lib/db/.schema-hash');
  console.error('      git commit -m "chore: bump DB schema to v' + (currentVersion + 1) + '"');
  console.error('');
  process.exit(1);
}

// ── 6. Auto-bump: increment the version number in database.ts ────────────────

const newVersion = currentVersion + 1;

// Replace only the version number in the consolidated block (last occurrence of
// the current highest version, so we never touch older migration blocks).
const updatedContent = content.replace(
  `this.version(${currentVersion}).stores(`,
  `this.version(${newVersion}).stores(`
);

writeFileSync(DB_FILE,   updatedContent, 'utf8');
writeFileSync(HASH_FILE, hash,           'utf8');

console.log('');
console.log(`🔄  DB schema changed: v${currentVersion} → v${newVersion}`);
console.log(`    hash  : ${storedHash || '(none)'} → ${hash}`);
console.log('');
console.log('    ⚠️   Commit both files before pushing:');
console.log(`      git add ${DB_FILE} ${HASH_FILE}`);
console.log(`      git commit -m "chore: bump DB schema to v${newVersion}"`);
console.log('');
