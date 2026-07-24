/**
 * generate-firebase-rewrites.mjs
 *
 * Scans src/app for dynamic route segments ([param] folders) and generates
 * the corresponding Firebase Hosting rewrite rules in firebase.json.
 *
 * Rules are sorted deepest-first so more specific routes win over catch-alls.
 *
 * Usage:
 *   node scripts/generate-firebase-rewrites.mjs          # auto-update (local / prebuild)
 *   node scripts/generate-firebase-rewrites.mjs --check  # fail if outdated (CI)
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const APP_DIR      = 'src/app';
const FIREBASE_JSON = 'firebase.json';
const CHECK_MODE   = process.argv.includes('--check');

// ── 1. Walk src/app and collect every route path that has a page.tsx ──────────

function collectRoutes(dir, urlPath = '') {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const routes = [];

  // Does this directory itself have a page?
  const hasPage = entries.some(
    (e) => !e.isDirectory() && /^page\.(tsx?|jsx?)$/.test(e.name)
  );

  if (hasPage && urlPath && /\[.+\]/.test(urlPath)) {
    routes.push(urlPath);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith('.') || name.startsWith('_')) continue;

    // Route groups like (dashboard) are transparent — they don't add a URL segment
    const segment = /^\(.+\)$/.test(name) ? '' : `/${name}`;

    routes.push(...collectRoutes(join(dir, name), urlPath + segment));
  }

  return routes;
}

// ── 2. Convert a Next.js route path to a Firebase rewrite entry ───────────────

function toRewrite(route) {
  const segments = route.split('/').filter(Boolean);

  // Build the source glob:
  // - Dynamic segments that are NOT last → replaced with * (single-segment wildcard)
  // - The last dynamic segment → dropped; /** is appended as the catch-all suffix
  // - Static segments → kept as-is
  // e.g. /patients/[id]/history → /patients/*/history/**
  //      /invoices/[id]         → /invoices/**
  const sourceSegments = [];
  for (let i = 0; i < segments.length; i++) {
    const isDynamic = /^\[.+\]$/.test(segments[i]);
    const isLast    = i === segments.length - 1;
    if (isDynamic && isLast) break; // drop last dynamic segment — replaced by /**
    sourceSegments.push(isDynamic ? '*' : segments[i]);
  }
  const source      = '/' + sourceSegments.join('/') + '/**';
  const destination = route.replace(/\[([^\]]+)\]/g, '_') + '/index.html';
  return { source, destination };
}

// ── 3. Sort: deepest (most segments) first so specific rules win ──────────────

function byDepthDesc(a, b) {
  const da = (a.match(/\//g) || []).length;
  const db = (b.match(/\//g) || []).length;
  return db - da || a.localeCompare(b);
}

// ── 4. Build the rewrites array ───────────────────────────────────────────────

const dynamicRoutes = [...new Set(collectRoutes(APP_DIR))].sort(byDepthDesc);

const rewrites = [
  ...dynamicRoutes.map(toRewrite),
  { source: '**', destination: '/index.html' },
];

// ── 5. Read firebase.json ─────────────────────────────────────────────────────

const firebase = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8'));

// ── 6. Check or update ───────────────────────────────────────────────────────

if (CHECK_MODE) {
  const current  = JSON.stringify(firebase.hosting.rewrites ?? []);
  const expected = JSON.stringify(rewrites);

  if (current !== expected) {
    console.error('');
    console.error('❌  firebase.json rewrites are outdated.');
    console.error('    A dynamic route was added or removed without updating firebase.json.');
    console.error('');
    console.error('    Run this locally, then commit:');
    console.error('      npm run firebase:rewrites');
    console.error('      git add firebase.json');
    console.error('      git commit -m "chore: update Firebase rewrites"');
    console.error('');
    process.exit(1);
  }

  console.log(`✅  firebase.json rewrites are up to date (${dynamicRoutes.length} dynamic route(s))`);
  process.exit(0);
}

firebase.hosting.rewrites = rewrites;
writeFileSync(FIREBASE_JSON, JSON.stringify(firebase, null, 2) + '\n', 'utf8');

console.log(`✅  firebase.json rewrites updated (${dynamicRoutes.length} dynamic route(s)):`);
dynamicRoutes.forEach((r) => {
  const { source, destination } = toRewrite(r);
  console.log(`    ${source.padEnd(45)} → ${destination}`);
});
