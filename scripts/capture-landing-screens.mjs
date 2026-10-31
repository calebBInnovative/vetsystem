// Captures the real app screens shown on the landing page (public/landing/screens/).
//
// Never point this at a server that talks to production. Run it against an
// isolated copy (its own .next, NEXT_PUBLIC_USE_EMULATOR=true) with the Firebase
// emulators up; the browser also aborts every request that is not to localhost.
//
//   git worktree add ../vs-shots HEAD && cd ../vs-shots && ln -s ../vetsystem/node_modules
//   (copy .env.local with NEXT_PUBLIC_USE_EMULATOR=true)
//   npx firebase emulators:start --only auth,firestore,functions &
//   npx next dev -p 3200 &
//   npm i --no-save playwright-core && npx playwright-core install chromium
//   node scripts/capture-landing-screens.mjs /tmp/shots
//
// Then convert to WebP (desktop 1600 px wide, mobile 780 px) into public/landing/screens/.
// Set CHROME_PATH to use a specific Chrome; LANDING_SHOTS_BASE for another port.
import { chromium } from 'playwright-core';
const [,, outDir] = process.argv;
const BASE = process.env.LANDING_SHOTS_BASE ?? 'http://localhost:3200';
// A Friday morning in Managua, so "today" has upcoming appointments and dates agree.
const NOW = new Date('2026-10-30T09:15:00-06:00');
const blocked = new Set();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

async function newPage(viewport, { dark = false, mobile = false } = {}) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 2, locale: 'es-NI', timezoneId: 'America/Managua',
    colorScheme: dark ? 'dark' : 'light', isMobile: mobile, hasTouch: mobile,
  });
  await ctx.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return route.continue();
    blocked.add(host); return route.abort();
  });
  await ctx.addInitScript((isDark) => {
    try {
      localStorage.setItem('vetsys-pwa-dismissed', 'true');
      localStorage.setItem('vet-theme-mode', isDark ? 'dark' : 'light');
    } catch {}
  }, dark);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 160)));
  return page;
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const skip = page.getByRole('button', { name: /Saltar tour/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.addStyleTag({ content: `
    div.bg-amber-500\\/10.border-b { display: none !important; }
    nextjs-portal { display: none !important; }
  ` });
  // The sidebar shows "Modo Demo" where a real clinic sees its own name.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('aside *')) {
      if (el.childElementCount === 0 && el.textContent?.trim() === 'Modo Demo') el.textContent = 'Clínica Veterinaria Demo';
    }
  });
  await page.waitForTimeout(800);
}

async function go(page, path) { await page.goto(`${BASE}${path}`); await settle(page); }
async function snap(page, name) { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); }

async function run(page, prefix) {
  await page.goto(`${BASE}/demo`);
  await page.waitForURL('**/dashboard**', { timeout: 120000 });
  await settle(page);
  await snap(page, `${prefix}-dashboard`);
  await go(page, '/schedule'); await snap(page, `${prefix}-schedule`);
  await go(page, '/patients');
  await page.getByText('Luna', { exact: true }).first().click();
  await page.waitForURL(/\/patients\/(?!_)[^/]+/);
  await settle(page); await page.waitForTimeout(800);
  await snap(page, `${prefix}-patient`);
  await go(page, '/sales');
  for (const name of ['Amoxicilina 500mg', 'Frontline Plus', 'Vacuna Antirrábica']) {
    const card = page.locator('div', { hasText: name }).filter({ has: page.getByRole('button', { name: /\+?\s*1 Unidad/ }) }).last();
    await card.getByRole('button', { name: /\+?\s*1 Unidad/ }).first().click().catch((e) => console.log('cart', name, e.message.slice(0, 80)));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await snap(page, `${prefix}-sales`);
  await go(page, '/consultations'); await snap(page, `${prefix}-consultations`);
  await go(page, '/invoices'); await snap(page, `${prefix}-invoices`);
}

await run(await newPage({ width: 1440, height: 900 }), 'desktop');
const dark = await newPage({ width: 1440, height: 900 }, { dark: true });
await dark.goto(`${BASE}/demo`); await dark.waitForURL('**/dashboard**', { timeout: 120000 }); await settle(dark);
await snap(dark, 'dark-dashboard');
await run(await newPage({ width: 390, height: 844 }, { mobile: true }), 'mobile');
console.log('blocked hosts:', [...blocked].join(', ') || 'none');
await browser.close();
