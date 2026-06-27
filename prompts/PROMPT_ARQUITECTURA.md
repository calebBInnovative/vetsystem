# Prompt de Arquitectura — SaaS Offline-First con Next.js + Dexie + Firebase

Usa este prompt al iniciar un proyecto nuevo con la misma arquitectura.

---

## Contexto del sistema

Construye un sistema de gestión **[DOMINIO]** como SaaS offline-first para **[PAÍS/REGIÓN]** donde la conectividad a internet es intermitente. El sistema debe funcionar completamente sin conexión y sincronizar automáticamente cuando hay internet.

**Stack obligatorio:**
- Next.js 14+ con App Router
- Dexie.js v4 (`dexie`, `dexie-react-hooks`) — IndexedDB como fuente de verdad local
- Firebase (Firestore + Auth) — backend en la nube
- TypeScript estricto
- Tailwind CSS + shadcn/ui

---

## Arquitectura de base de datos

### Principio fundamental
**Dexie es la fuente de verdad. Firebase es el respaldo.**
Toda escritura va primero a Dexie (instantánea, reactiva, offline), luego se encola para Firebase.

### Patrones de tipos locales

Cada entidad tiene un tipo `[Entidad]Local` con estos campos de infraestructura:
```typescript
interface EntidadLocal {
  id:         string;          // crypto.randomUUID() — generado en cliente
  clinicaId:  string;          // multi-tenant: separa datos por organización
  // ... campos del dominio ...
  creadoEn:   number;          // Date.now() — timestamp creación
  syncStatus: 'pending' | 'synced' | 'error';
  updatedAt:  number;          // Date.now() — timestamp última modificación
  deletedAt?: number;          // soft delete: nunca borrar físicamente
}
```

### Configuración de Dexie v4

```typescript
import Dexie, { type EntityTable } from 'dexie';

class AppDB extends Dexie {
  entidades!: EntityTable<EntidadLocal, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  sesion!:    EntityTable<SesionLocal,   'id'>; // singleton de auth/licencia

  constructor() {
    super('app-db');

    // REGLA: las versiones son INMUTABLES. Nunca modificar versiones anteriores.
    // Agregar siempre una versión nueva al final.
    this.version(1).stores({
      entidades: 'id, clinicaId, campo1, campo2, syncStatus, updatedAt, deletedAt',
      syncQueue: '++id, coleccion, documentoId, creadoEn',
    });

    // Versión 2: nueva tabla o re-indexación
    this.version(2).stores({
      nuevaTabla: 'id, clinicaId, ...',
    });
  }
}

export const db = new AppDB();
```

**Reglas de índices Dexie:**
- Solo indexar campos usados en `.where()`, `.filter()`, o `.sortBy()`
- `++campo` → auto-increment
- `&campo` → único
- No indexar todo — aumenta tamaño y reduce rendimiento

### SyncQueue

```typescript
export interface SyncQueueItem {
  id?:         number;   // auto-increment
  coleccion:   string;   // nombre de la colección en Firestore
  documentoId: string;
  operacion:   'create' | 'update' | 'delete';
  datos:       object;   // payload completo para Firestore
  intentos:    number;   // reintentos fallidos (máx 5)
  creadoEn:    number;
}
```

### Patrón de hooks de escritura

```typescript
const CLINICA_ID = '[slug-de-la-org]'; // hardcoded por deployment

export async function crearEntidad(input: CrearInput): Promise<string> {
  const ahora = Date.now();
  const id    = crypto.randomUUID();

  const entidad: EntidadLocal = {
    id,
    clinicaId:  CLINICA_ID,
    // ... campos del dominio ...
    creadoEn:   ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  };

  await db.transaction('rw', [db.entidades, db.syncQueue], async () => {
    await db.entidades.add(entidad);
    await db.syncQueue.add({
      coleccion:   'entidades',
      documentoId: id,
      operacion:   'create',
      datos:       entidad,
      intentos:    0,
      creadoEn:    ahora,
    });
  });

  return id;
}
```

**Soft delete siempre:**
```typescript
await db.entidades.update(id, { deletedAt: Date.now(), syncStatus: 'pending', updatedAt: Date.now() });
// Nunca: await db.entidades.delete(id)
```

### Hooks de lectura con useLiveQuery

```typescript
export function useEntidades(filtros?: { estado?: string }) {
  const resultado = useLiveQuery(async () => {
    let items = await db.entidades
      .where('clinicaId').equals(CLINICA_ID)
      .filter((e) => !e.deletedAt)
      .toArray();

    if (filtros?.estado) items = items.filter((e) => e.estado === filtros.estado);
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items;
  }, [filtros?.estado]);

  return { items: resultado ?? [], cargando: resultado === undefined };
}
```

**Regla crítica de React Hooks:** Todos los `useState`, `useEffect`, `useLiveQuery` deben declararse ANTES de cualquier `return` condicional.

---

## Capa de sincronización con Firebase

### Interfaz del provider (intercambiable)

```typescript
// src/lib/sync/sync.provider.ts
export interface SyncProvider {
  push(coleccion: string, id: string, datos: object): Promise<void>;
  pull(coleccion: string, desde: number): Promise<RemoteDoc[]>;
  subscribe?(coleccion: string, clinicaId: string, onChange: (docs: RemoteDoc[]) => void): () => void;
  readonly nombre: string;
}
```

### Configuración única del provider

```typescript
// src/lib/sync/sync.config.ts — ÚNICO lugar para cambiar el backend
import { FirebaseSyncProvider } from './providers/firebase.provider';
import { LocalSyncProvider }    from './providers/local.provider';

function buildProvider(): SyncProvider {
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    return new FirebaseSyncProvider('[clinica-id]');
  }
  return new LocalSyncProvider(); // dev sin Firebase
}

export const syncProvider: SyncProvider = buildProvider();
```

### SyncService

```typescript
// src/lib/sync/sync.service.ts
class SyncService {
  iniciar() {
    // Hook en Dexie: cada item nuevo en syncQueue → flush inmediato
    db.syncQueue.hook('creating', () => setTimeout(() => this.flush(), 0));
    // Fallback cada 30s para reintentos
    setInterval(() => this.flush(), 30_000);
    // Flush al reconectar
    window.addEventListener('online', () => this.flush());
  }

  async flush() {
    const pendientes = await db.syncQueue
      .where('intentos').below(5)
      .sortBy('creadoEn');

    for (const item of pendientes) {
      try {
        await syncProvider.push(item.coleccion, item.documentoId, item.datos);
        await db.syncQueue.delete(item.id!);
      } catch {
        await db.syncQueue.update(item.id!, { intentos: item.intentos + 1 });
      }
    }
  }

  // Sube TODO Dexie a Firebase (dev workflow: "estoy listo, empuja todo")
  async syncAll(onProgress?: (p: SyncAllProgress) => void) { ... }
}

export const syncService = new SyncService();
```

Iniciar en el layout raíz:
```typescript
useEffect(() => {
  syncService.iniciar();
  return () => syncService.detener();
}, []);
```

### Estructura Firestore

```
clinicas/{clinicaId}/
  {coleccion}/{documentoId}   ← misma estructura que Dexie
  licencia/datos              ← suscripción de la clínica

usuarios/{uid}/
  clinicaId, nombre, rol, ultimoAcceso
```

---

## Sistema de autenticación y licencias

### Flujo de login

1. Firebase Auth (email/password) — **requiere internet**
2. Al autenticar: fetch `usuarios/{uid}` + `clinicas/{clinicaId}/licencia/datos`
3. Guardar en Dexie tabla `sesion` (singleton: `id = 'singleton'`)
4. Trabajar offline hasta el período de gracia

### Sesión local (Dexie)

```typescript
interface SesionLocal {
  id:                   'singleton';
  uid:                  string;
  email:                string;
  clinicaId:            string;
  nombreClinica:        string;
  nombreUsuario:        string;
  rol:                  'admin' | 'operador' | 'solo_lectura';
  planNombre:           string;
  fechaExpiracion:      string;  // YYYY-MM-DD
  estadoSuscripcion:    'activa' | 'vencida' | 'suspendida' | 'prueba';
  ultimaSincronizacion: number;  // timestamp — clave para gracia offline
  cachedAt:             number;  // timestamp — anti-tamper de reloj
}
```

### Períodos de gracia offline

```typescript
function calcularLicencia(sesion: SesionLocal): LicenciaInfo {
  const ahora = Date.now();

  // Anti-tamper: reloj retrasado manualmente
  if (ahora < sesion.cachedAt) return { modo: 'bloqueado', ... };

  const diasOffline = Math.floor((ahora - sesion.ultimaSincronizacion) / 86_400_000);

  if (diasOffline >= 45) return { modo: 'bloqueado',          ... };
  if (diasOffline >= 30) return { modo: 'solo_lectura',       ... };
  if (diasOffline >= 15) return { modo: 'advertencia_fuerte', ... };
  if (diasOffline >=  7) return { modo: 'advertencia_suave',  ... };
  return                        { modo: 'normal',              ... };
}
```

| Días offline | Modo | Efecto |
|---|---|---|
| 0–6 | `normal` | Sin restricciones |
| 7–14 | `advertencia_suave` | Banner amarillo (cerrrable) |
| 15–29 | `advertencia_fuerte` | Banner naranja (cerrrable) |
| 30–44 | `solo_lectura` | Banner rojo fijo, sin escritura |
| 45+ | `bloqueado` | Pantalla completa hasta conectar |
| suscripción vencida | `vencida` | Pantalla de pago |

### AuthContext

```typescript
// src/contexts/AuthContext.tsx
export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [sesion, setSesion]             = useState(null);

  // 1. Firebase Auth listener
  useEffect(() => onAuthChange(async (user) => {
    if (user) {
      const local = await getSesionLocal(); // offline
      setSesion(local);
      if (navigator.onLine) {
        const fresca = await refrescarSesion(user); // online
        setSesion(fresca);
      }
    }
  }), []);

  // 2. Refrescar al reconectar
  useEffect(() => {
    window.addEventListener('online', () => refrescarSesion(firebaseUser));
  }, [firebaseUser]);

  const licencia = calcularLicencia(sesion); // corre offline, sin red

  return <AuthContext.Provider value={{ firebaseUser, sesion, licencia }}>
    {children}
  </AuthContext.Provider>;
}
```

### Reglas de negocio de auth

- **Login:** siempre requiere internet
- **Logout:** siempre requiere internet (para registrar el evento)
- **Si borra caché/IndexedDB:** sesión perdida → login requerido (validación en la nube)
- **Si la suscripción venció (detectado al reconectar):** redirigir a página de pago
- **`cachedAt`** protege contra retroceder el reloj del sistema

---

## Estructura de archivos

```
src/
  types/
    [entidad].ts           ← interfaces + constantes UI
    licencia.ts            ← SesionLocal, ModoLicencia, LicenciaInfo
  lib/
    db/
      database.ts          ← clase Dexie con versiones inmutables
    firebase/
      firebase.config.ts   ← initializeApp singleton
    sync/
      sync.provider.ts     ← interfaz SyncProvider
      sync.config.ts       ← ← punto único de configuración del backend
      sync.service.ts      ← worker de queue + syncAll()
      providers/
        firebase.provider.ts
        local.provider.ts  ← no-op para dev sin internet
    auth/
      auth.service.ts      ← login/logout/refrescarSesion
    license/
      license.service.ts   ← calcularLicencia(), puedeEscribir()
  hooks/
    use[Entidad].ts        ← useLiveQuery + mutaciones
  contexts/
    AuthContext.tsx         ← Firebase user + sesion + licencia
  components/
    license/
      LicenseBanner.tsx    ← banners de advertencia + pantalla bloqueada
      ReadOnlyGuard.tsx    ← deshabilita escritura en modo solo_lectura
    layout/
      AppLayout.tsx        ← sidebar + header + LicenseBanner
  app/
    layout.tsx             ← AuthProvider envuelve todo
    (auth)/
      login/page.tsx
    (dashboard)/
      layout.tsx           ← guard: redirige a /login si no hay sesión
      admin/page.tsx       ← seed + sync tools (solo visible en dev)
```

---

## Variables de entorno

```bash
# .env.local (desarrollo)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=vetsystem-dev   ← proyecto DEV
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# .env.production (producción)
NEXT_PUBLIC_FIREBASE_PROJECT_ID=vetsystem-prod  ← proyecto PROD separado
# ... resto igual
```

---

## Workflow de desarrollo

```
1. Agregar tipo en src/types/[entidad].ts
2. Bump versión en database.ts:  this.version(N+1).stores({ nuevaTabla: '...' })
3. Crear hook en src/hooks/use[Entidad].ts
4. Probar local (Dexie solo, sin Firebase)
5. Cuando funciona: /admin → "Sync todo a Firebase" → probar online/offline
6. git push → deploy → clientes reciben el cambio
```

---

## Gotchas críticos

- **Dexie versiones inmutables:** nunca modificar `version(N)` existente. Siempre `version(N+1)`.
- **React Hooks order:** todos los hooks antes de cualquier `return` condicional.
- **`useLiveQuery` timing:** al finalizar una transacción, el liveQuery puede no haberse actualizado aún. Usar `useEffect` + flag para esperar.
- **Zod v4 + react-hook-form:** usar `safeParseAsync` con `error.issues` (no `error.errors`). Crear `zodResolver` custom.
- **Firebase singleton en Next.js:** usar `getApps().length > 0 ? getApps()[0] : initializeApp(config)` para evitar re-inicialización en HMR.
- **`syncQueue` hook `creating`:** usar `setTimeout(..., 0)` para esperar que la transacción de Dexie cierre antes de leer la queue.
- **Soft delete:** filtrar siempre con `.filter((e) => !e.deletedAt)` en los hooks de lectura.
- **`bulkGet` con IDs opcionales:** filtrar antes con `.filter((id): id is string => !!id)`.
