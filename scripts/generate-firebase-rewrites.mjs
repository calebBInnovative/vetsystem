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

// ── 2. Convert a Next.js route path to Firebase rewrite entries ───────────────
//
// Each dynamic route needs TWO rules (both sorted deepest-first):
//   a) TXT rule  — serves the RSC payload (index.txt) for client-side navigation.
//      Next.js fetches /<route>/<real-id>/index.txt when navigating client-side;
//      without this rule, the /** HTML rewrite intercepts and serves the wrong
//      file, causing Next.js to fall back to a hard page reload.
//   b) HTML rule — serves the pre-rendered page for direct URL access / refresh.

function toRewrites(route) {
  const segments = route.split('/').filter(Boolean);

  // Build the source prefix:
  // - Dynamic segments that are NOT last → replaced with * (single-segment wildcard)
  // - The last dynamic segment → dropped (covered by /** or /*/index.txt suffix)
  // - Static segments → kept as-is
  // e.g. /patients/[id]/history → prefix = /patients/*/history
  //      /invoices/[id]         → prefix = /invoices
  const sourceSegments = [];
  let lastIsDynamic = false;
  for (let i = 0; i < segments.length; i++) {
    const isDynamic = /^\[.+\]$/.test(segments[i]);
    const isLast    = i === segments.length - 1;
    if (isDynamic && isLast) { lastIsDynamic = true; break; }
    sourceSegments.push(isDynamic ? '*' : segments[i]);
  }

  const prefix      = '/' + sourceSegments.join('/');
  const destBase    = route.replace(/\[([^\]]+)\]/g, '_');

  // TXT: when the last segment was dynamic (e.g. /invoices/[id]), Next.js fetches
  //      /invoices/<id>/index.txt → we need /invoices/*/index.txt.
  //      When last segment is static (e.g. /patients/[id]/history), it fetches
  //      /patients/<id>/history/index.txt → /patients/*/history/index.txt.
  const txtSource = lastIsDynamic
    ? `${prefix}/*/index.txt`
    : `${prefix}/index.txt`;

  return [
    { source: txtSource,         destination: `${destBase}/index.txt`  },
    { source: `${prefix}/**`,    destination: `${destBase}/index.html` },
  ];
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
  ...dynamicRoutes.flatMap(toRewrites),
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
  const [txt, html] = toRewrites(r);
  console.log(`    ${txt.source.padEnd(50)} → ${txt.destination}`);
  console.log(`    ${html.source.padEnd(50)} → ${html.destination}`);
});
