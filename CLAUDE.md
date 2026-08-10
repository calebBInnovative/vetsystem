# VetSystem — AI Assistant Context

This file is the authoritative guide for any AI assistant working on this project. Read it fully before making changes.

---

## 1. Project Context

**VetSystem** is a veterinary clinic management SaaS for **Pet's House** (Nicaragua).
It is a **multi-tenant, offline-first web app** — each clinic gets an isolated data space keyed by `clinicId`. The app works without internet and syncs to Firebase Firestore when a connection is available.

---

## 2. Mandatory Code Convention

> **ALL code must be in English.**

This rule is permanent and non-negotiable:
- Variable names, function names, type names, interface fields — **English only**
- File names — English only
- Code comments — English only
- Git commit messages — English only

**The only exception:** UI labels and user-facing strings visible in the browser may be in Spanish (the app's UI language).

Violation example — **never do this:**
```ts
const paciente = await db.patients.get(id); // ❌ Spanish variable
```
Correct:
```ts
const patient = await db.patients.get(id);  // ✓ English
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15.4.5 |
| Language | TypeScript | latest |
| Styling | Tailwind CSS v4 | ^4 |
| UI Components | shadcn/ui | - |
| Icons | Lucide React | - |
| Notifications | Sonner (toasts) | - |
| Forms | React Hook Form + Zod v4 | - |
| Local DB | Dexie (IndexedDB wrapper) | ^4.4.2 |
| Cloud DB | Firebase Firestore | ^12 |
| Auth | Firebase Auth (Google + Email) | ^12 |
| Date utils | date-fns | ^4.3.0 |
| React | React 19 | 19.1.0 |

---

## 4. Architecture — Offline-First SaaS

### Data flow
```
User action → Dexie (IndexedDB) → UI updates immediately
                                 → syncQueue entry added
                                    → SyncService (online) → Firestore
```

Dexie is the **source of truth** for all reads. The UI never reads directly from Firestore.

### Key patterns
- **Soft delete:** Never physically delete records. Set `deletedAt: Date.now()` and filter `!p.deletedAt` in all queries.
- **Sync queue:** Every mutation writes a `SyncQueueItem` to `db.syncQueue`. `SyncService` drains the queue when online.
- **clinicId isolation:** Every table row carries `clinicId`. All queries filter by `clinicId` from the active session.
- **useLiveQuery:** All list views use Dexie's `useLiveQuery` hook (reactive, auto-updates on DB changes). Returns `undefined` while loading.

### useLiveQuery loading pattern
```ts
const items = useLiveQuery(() => db.patients.where('clinicId').equals(clinicId).toArray(), [clinicId]);
const loading = items === undefined;
```

---

## 5. Routing — Static Export + Firebase Hosting

### Static export
Production builds use `output: 'export'` in `next.config.ts` with `trailingSlash: true`. This generates:
- `/patients/index.html` for the list route
- `/patients/_/index.html` for `[id]` detail routes (placeholder `_` segment)
- `/patients/_/index.txt` — **RSC payload** fetched by Next.js during client-side navigation

### The RSC payload problem
When a user navigates via `<Link>` to a dynamic route (e.g. `/patients/abc123`), Next.js fetches `GET /patients/abc123/index.txt` (the RSC payload). If Firebase Hosting's `/**` HTML rewrite intercepts this before the `.txt` file is served, the browser gets HTML instead of RSC data → Next.js falls back to a **hard full-page reload** → React context resets → session state is lost → tour restarts.

**Fix:** Firebase rewrites must have `.txt` rules **before** `/**` HTML rules for every dynamic route.

### Firebase rewrite generation
Never hand-edit `firebase.json` rewrites. Run:
```bash
node scripts/generate-firebase-rewrites.mjs
```

This script reads all `[id]` routes and emits paired rules:
```json
{"source": "/patients/*/index.txt", "destination": "/patients/_/index.txt"},
{"source": "/patients/**",          "destination": "/patients/_/index.html"}
```

### Static export hydration — useRouteId hook
During SSR/hydration, `useParams()` returns `'_'` (the placeholder). To get the real URL segment, use `useRouteId()`:

```ts
// src/hooks/useRouteId.ts
'use client';
import { useState, useEffect } from 'react';

export function useRouteId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    setId(segments[segments.length - 1] ?? '');
  }, []);
  return id;
}
```

- Returns `null` during SSR/hydration, real segment after mount
- All detail views guard with `!id || loading` to show a spinner instead of "not found"
- Pass `id ?? ''` to hooks that require a `string` (not `string | null`)

```ts
// Pattern used in every [id] detail view:
const id = useRouteId();
const { item, loading } = useMyHook(id ?? '');
if (!id || loading) return <Spinner />;
```

---

## 6. Session and Auth

The session is a single Dexie record (`id: 'singleton'`) in `db.session`. Shape: `SessionLocal` in `src/types/license.ts`.

Key fields:
```ts
interface SessionLocal {
  id: 'singleton';
  uid: string;
  email: string;
  clinicId: string;        // e.g. 'demo' in demo mode
  clinicName: string;
  userName: string;
  role: 'master' | 'admin' | 'veterinarian' | 'reception';
  permissions: Permissions | null; // null = full access (master/admin)
  plan: string;
  expirationDate: string;  // YYYY-MM-DD
  subscription: boolean;
  lastSync: number;        // ms timestamp of last Firebase validation
  cachedAt: number;
  isDemo?: boolean;
  setupComplete?: boolean;
}
```

Auth flow:
1. Firebase Auth → `AuthContext` subscribes to `onAuthStateChanged`
2. Session is read from Dexie (`db.session.get('singleton')`)
3. If online, session is refreshed from Firestore every login
4. `calculateLicense(session)` derives `LicenseInfo` (mode, daysOffline, daysUntilExpiry)
5. License mode gates: `read_only` (45+ days offline) disables writes; `blocked` shows lock screen

Access `AuthContext` via:
```ts
const { session, license, loading } = useAuth();
```

---

## 7. License System

License modes (from `src/types/license.ts`):
| Mode | Condition | Effect |
|---|---|---|
| `normal` | 0–6 days offline, active sub | Full access |
| `soft_warning` | 7–14 days offline | Banner warning |
| `hard_warning` | 15–29 days offline | Stronger banner |
| `read_only` | 30–44 days offline | Writes blocked |
| `blocked` | 45+ days offline / clock tamper | Full block |
| `expired` | `expirationDate` passed (online) | Block |

Roles `master` and `admin` bypass per-module permissions. `veterinarian` and `reception` are gated by the `Permissions` record.

---

## 8. Demo Mode

Demo mode is a fully isolated, no-Firebase sandbox:
- `clinicId = 'demo'`, `isDemo = true`
- Activated from `/demo` marketing page
- Data is auto-seeded via `src/lib/demo/seedDemoData.ts`
- Firebase Auth is **not used** — session is written directly to Dexie
- All sync operations are no-ops when `isDemo`
- Tour (`TourGuide` component) auto-starts on first demo visit
- Demo banner in the layout has a **"Probar alertas"** button to test push notifications

---

## 9. Database Schema (Dexie)

Current version: **22**. Schema is in `src/lib/db/database.ts`.

Tables and their primary key + indexed fields:
```
patients:             id, name, species, ownerId, clinicId, active, syncStatus, updatedAt, deletedAt
owners:               id, name, phone, clinicId, syncStatus, updatedAt
consultations:        id, patientId, ownerId, clinicId, date, type, status, appointmentId, syncStatus, updatedAt, deletedAt
appointments:         id, patientId, ownerId, clinicId, date, startTime, status, syncStatus, updatedAt, deletedAt
products:             id, name, clinicId, active, currentStock, minimumStock, syncStatus, updatedAt, deletedAt
movements:            id, productId, clinicId, type, date, syncStatus, updatedAt
payments:             id, invoiceId, clinicId, syncStatus, updatedAt
invoices:             id, patientId, ownerId, clinicId, status, date, syncStatus, updatedAt, deletedAt
services:             id, name, clinicId, active, syncStatus, updatedAt, deletedAt
sales:                id, clinicId, date, syncStatus, updatedAt, deletedAt
session:              id (singleton record)
fixedExpenses:        id, clinicId, syncStatus, updatedAt, deletedAt
expensePayments:      id, expenseId, clinicId, syncStatus, updatedAt
collaborators:        id, clinicId, syncStatus, updatedAt, deletedAt
collaboratorPayments: id, collaboratorId, clinicId, syncStatus, updatedAt
promotions:           id, clinicId, active, syncStatus, updatedAt, deletedAt
syncQueue:            id, table, operation, payload, clinicId, createdAt, attempts, status
```

### DB versioning rules
- **Never** remove or rename existing `version(N).stores()` blocks — Dexie needs the full migration history
- When adding indexes or tables, add a **new** `version(N+1).stores()` block at the end
- Use the bump script: `node scripts/bump-db-version.mjs`
- Dexie's `versionchange` event drops and re-creates the DB when schema conflicts occur (data loss acceptable — Firestore is source of truth)

### Dexie transaction scoping
When using `db.transaction('rw', [...tables], fn)`, every table accessed inside `fn` must be listed. Accessing an unlisted table throws `NotFoundError`.

---

## 10. Module Map

All modules live under `src/app/(dashboard)/`. Feature logic is in `src/hooks/use*.ts` and `src/lib/*/`.

| Route | Hook | Status |
|---|---|---|
| `/dashboard` | `useDashboard` | ✓ Built |
| `/patients`, `/patients/[id]`, `/patients/[id]/history` | `usePatients`, `useHistory` | ✓ Built |
| `/schedule`, `/schedule/new` | `useAppointments` | ✓ Built |
| `/consultations`, `/consultations/[id]`, `/consultations/new` | `useConsultations` | ✓ Built |
| `/inventory`, `/inventory/[id]`, `/inventory/new` | `useInventory` | ✓ Built |
| `/sales` | `useSales` | ✓ Built |
| `/invoices`, `/invoices/[id]` | `useInvoices` | ✓ Built |
| `/services` | `useServices` | ✓ Built |
| `/finances`, `/finances/new` | `useFinances` | ✓ Built |
| `/expenses` | `useExpenses` | ✓ Built |
| `/promotions`, `/promotions/[id]`, `/promotions/new` | `usePromotions` | ✓ Built |
| `/admin` | - | ✓ Built (user/clinic management) |
| `/import` | - | ✓ Built (CSV bulk import) |
| `/dev/seed` | - | Dev only (seed data) |

---

## 11. Component Structure

```
src/
  app/
    (auth)/         Login, Register, Setup flows
    (dashboard)/    All protected dashboard routes
    (marketing)/    Landing page, Demo page
  components/
    layout/         AppLayout.tsx — main shell (sidebar, header, notifications, PWA banner)
    common/         Shared components (PWAInstallBanner, StockAlerts, etc.)
    ui/             shadcn/ui primitives
    patients/       PatientProfile, PatientCard, etc.
    appointments/   AppointmentCard, etc.
    consultations/  ConsultationForm, etc.
    inventory/      StockAlerts, ProductForm, etc.
    invoices/       InvoiceDetail, etc.
    finances/       FinanceCharts, etc.
    collaborators/  CollaboratorCard, etc.
    history/        HistorialTimeline, etc.
    license/        LicenseBanner, BlockedScreen, etc.
    themes/         ThemeProvider (dark/light)
  hooks/            One hook per domain (usePatients.ts, useInventory.ts, etc.)
  lib/
    db/             database.ts (Dexie instance + schema)
    auth/           auth.service.ts (Firebase Auth helpers)
    sync/           SyncService, sync providers per table
    demo/           seedDemoData.ts
    license/        license.service.ts (calculateLicense)
    firebase/       Firestore helpers
    invoices/       Invoice PDF generation
    validations/    Zod schemas
  contexts/         AuthContext.tsx
  firebase/         Firebase app init
  types/            TypeScript types (license.ts, db types, etc.)
  stores/           (Zustand or similar if used)
  utils/            Pure utility functions
```

---

## 12. AppLayout — Global Shell

`src/components/layout/AppLayout.tsx` wraps all dashboard pages. It provides:
- Sidebar navigation with role-based items
- Header with `BellNotification` (stock alerts + notification permission)
- `LicenseBanner` — shown when license mode is degraded
- `AlertasStock` — horizontal chip bar showing low/out-of-stock products (always visible)
- `TourGuide` — onboarding tour (demo only)
- `PWAInstallBanner` — fixed bottom banner for PWA install
- `useSystemNotifications(clinicId, appointments)` — registers SW, checks stock, schedules appointment reminders

---

## 13. Push Notifications

All in `src/hooks/useNotifications.ts`. No backend required — pure browser Notification API + Service Worker.

### Service Worker
`public/sw.js` — handles `notificationclick`, focuses existing window or opens a new one with the notification's URL.

### Stock alerts
- Throttled to at most once per hour per clinic (localStorage key `vetsys-stock-notif-ts`)
- Queries `db.products` where `currentStock <= minimumStock` and `!deletedAt && active`
- Shows "sin stock" alert (red) or "stock bajo" alert (yellow)
- Links to `/inventory`

### Appointment reminders
- `scheduleAppointmentReminders(appointments, minutesBefore=15)` schedules `setTimeout` for each today's appointment
- Returns cleanup function; called in `useSystemNotifications` on every appointments change

### Demo test
`testNotifications(clinicId)` — clears throttle, triggers stock check immediately + mock appointment notification in 10 seconds. Called by "Probar alertas" button in demo banner.

### Permission flow
`requestNotifPermission()` → calls `Notification.requestPermission()`. Check current state with `getNotifPermission()`.

---

## 14. PWA

### Manifest
`public/manifest.json` — name, icons, shortcuts to `/schedule` and `/sales`, theme color `#0f7d6e`.

### Install banner
`src/hooks/usePWAInstall.ts` + `src/components/common/PWAInstallBanner.tsx`:
- Android/Chrome: captures `beforeinstallprompt`, shows "Instalar ahora" button
- iOS: detects `/iPad|iPhone|iPod/` UA, shows Share → "Añadir a pantalla de inicio" instructions
- Dismissed state persisted in localStorage (`vetsys-pwa-dismissed`)
- Hides when already running as standalone (`display-mode: standalone`)

### Metadata
`src/app/layout.tsx` exports `metadata` (manifest, apple-web-app) and `viewport` (themeColor, no user-scale).

---

## 15. Script Automation

Both scripts are in `scripts/`:

### `bump-db-version.mjs`
Increments the Dexie DB version in `database.ts`. Run when adding a new migration version.
```bash
node scripts/bump-db-version.mjs
```

### `generate-firebase-rewrites.mjs`
Scans all `src/app/(dashboard)/` routes for `[id]` segments and regenerates the `rewrites` array in `firebase.json`. Emits paired `.txt` + `/**` rules per dynamic route.
```bash
node scripts/generate-firebase-rewrites.mjs
```

Always run this script after adding a new dynamic route. Never hand-edit `firebase.json` rewrites.

---

## 16. Deployment

### Build
```bash
npm run build
```
Produces `out/` — static HTML/CSS/JS export.

### Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```
Requires Firebase CLI logged in and `firebase.json` up to date.

### Full deploy sequence
```bash
node scripts/generate-firebase-rewrites.mjs   # update rewrites if routes changed
npm run build
firebase deploy --only hosting
```

### Firebase project
Project: `vetsystem` (Nicaragua). `firebase.json` uses `out/` as public dir with SPA-style rewrites for each route group.

---

## 17. Git Workflow

**Claude Code cannot push to GitHub in this environment** — SSH key permission is denied (`calebBInnovative` user) and HTTPS returns 403. After Claude commits changes, the user must push manually:

```bash
git push origin master
```

The main branch is `master`. No staging branch — all work goes directly to master and is deployed from there.

---

## 18. Known Gotchas

### 1. RSC payload interception (most critical production bug)
If a new dynamic route is added without updating `firebase.json` (`.txt` rules), client-side navigation to that route will hard-reload, resetting React context. Always run `generate-firebase-rewrites.mjs` and redeploy.

### 2. useRouteId hydration delay
`useRouteId()` returns `null` on first render. Every detail view must guard: `if (!id || loading) return <Spinner />`. Passing `null` to a hook that expects `string` causes an empty Dexie query returning `undefined`, which shows the "not found" state.

### 3. Dexie transaction table listing
`db.transaction('rw', [table1, table2], ...)` — list every table accessed inside the callback. Missing one throws `NotFoundError` at runtime, not at compile time.

### 4. useLiveQuery returns undefined (not null) while loading
Check `items === undefined` for the loading state. `items === null` is a valid "not found" state for single-record queries.

### 5. Demo mode and tour
The `TourGuide` effect watches for `isDemo && !tourCompleted`. If the page hard-reloads (e.g. RSC bug), `isDemo` briefly re-evaluates to `true` before session hydration, restarting the tour. The fix is ensuring client-side navigation works (Firebase `.txt` rewrites).

### 6. Date-fns v4 API
v4 is NOT backward-compatible with v3. Use named exports only: `format`, `addDays`, `parseISO`, etc. The `isValid` function has changed behavior; prefer `parseISO` with a try/catch.

### 7. Zod v4 API
v4 is NOT backward-compatible with v3. Schema builders and error message APIs differ. Always import from `zod` directly (not `zod/v4`).

### 8. Tailwind v4 configuration
No `tailwind.config.ts` — configuration is done via CSS `@theme` directives in `globals.css`. Do not create a Tailwind config file.

### 9. Firebase Auth in static export
Because this is a static export with `output: 'export'`, server components cannot access Firebase Auth. All auth is client-side via `AuthContext`.

### 10. Soft delete everywhere
Never use `db.patients.delete(id)`. Always: `db.patients.update(id, { deletedAt: Date.now() })` and enqueue a sync delete operation.

---

## 19. Environment Variables

Firebase config is in `src/firebase/` (or similar). Required env vars for production build:
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

---

## 20. Development

```bash
npm run dev    # localhost:3000
npm run build  # static export → out/
npm run lint   # ESLint
```

TypeScript strict mode is enabled. Fix all type errors before committing — do not use `any` or `@ts-ignore` without a documented reason.
