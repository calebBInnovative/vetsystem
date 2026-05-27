# VetSystem — Arquitectura Fase 1

> Stack: Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui + Dexie.js + Firebase

---

## 1. Estructura de Carpetas

```
vetsystem/
├── src/
│   ├── app/                              # Next.js 15 App Router
│   │   ├── (auth)/                       # Grupo: páginas sin sidebar
│   │   │   ├── login/page.tsx
│   │   │   ├── registro/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/                  # Grupo: app principal
│   │   │   ├── layout.tsx                # AppLayout (sidebar + header)
│   │   │   ├── page.tsx                  # Dashboard
│   │   │   ├── pacientes/
│   │   │   │   ├── page.tsx              # Lista con búsqueda
│   │   │   │   ├── nuevo/page.tsx        # Registro rápido
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Ficha completa
│   │   │   │       └── historial/page.tsx
│   │   │   ├── agenda/
│   │   │   │   ├── page.tsx              # Calendario
│   │   │   │   └── [id]/page.tsx         # Detalle de cita
│   │   │   ├── inventario/
│   │   │   │   ├── page.tsx
│   │   │   │   └── entrada-rapida/page.tsx  # Optimizada para celular
│   │   │   └── finanzas/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   └── whatsapp/route.ts         # Webhook recordatorios
│   │   ├── globals.css
│   │   └── layout.tsx                    # Root layout + providers
│   │
│   ├── components/
│   │   ├── ui/                           # shadcn/ui (no tocar)
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── themes/
│   │   │   ├── ThemeProvider.tsx
│   │   │   ├── ThemeSwitcher.tsx
│   │   │   └── theme-config.ts
│   │   ├── pacientes/
│   │   │   ├── PacienteCard.tsx
│   │   │   ├── PacienteForm.tsx          # Registro + edición
│   │   │   ├── BuscadorPacientes.tsx     # Búsqueda en tiempo real
│   │   │   ├── FichaPaciente.tsx
│   │   │   ├── HistorialItem.tsx
│   │   │   └── RegistroClinicoForm.tsx   # Con plantillas rápidas
│   │   ├── agenda/
│   │   │   ├── CalendarioSemanal.tsx
│   │   │   ├── CitaCard.tsx
│   │   │   └── CitaForm.tsx
│   │   ├── inventario/
│   │   │   ├── ProductoCard.tsx
│   │   │   ├── ProductoForm.tsx
│   │   │   ├── EntradaRapidaForm.tsx
│   │   │   └── AlertasStock.tsx
│   │   ├── finanzas/
│   │   │   ├── TransaccionForm.tsx
│   │   │   └── ResumenMensual.tsx
│   │   └── common/
│   │       ├── SyncStatusBadge.tsx       # Indicador online/offline/syncing
│   │       ├── OfflineBanner.tsx
│   │       ├── ConfirmDialog.tsx
│   │       └── EmptyState.tsx
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── database.ts               # Instancia Dexie + definición tablas
│   │   │   └── migrations.ts             # Versiones del schema local
│   │   ├── firebase/
│   │   │   ├── config.ts                 # Inicialización Firebase
│   │   │   ├── auth.ts                   # Login, logout, session
│   │   │   └── firestore.ts              # Helpers CRUD cloud
│   │   ├── sync/
│   │   │   ├── SyncEngine.ts             # Orquestador principal
│   │   │   ├── SyncQueue.ts              # Cola de operaciones pendientes
│   │   │   └── ConflictResolver.ts       # Resolución de conflictos
│   │   ├── hooks/
│   │   │   ├── usePacientes.ts
│   │   │   ├── useCitas.ts
│   │   │   ├── useInventario.ts
│   │   │   ├── useFinanzas.ts
│   │   │   ├── useSync.ts                # Estado de sincronización global
│   │   │   └── useOnlineStatus.ts
│   │   ├── validations/
│   │   │   ├── paciente.schema.ts        # Zod schemas
│   │   │   ├── cita.schema.ts
│   │   │   └── inventario.schema.ts
│   │   └── utils.ts
│   │
│   └── types/
│       ├── paciente.ts
│       ├── cita.ts
│       ├── inventario.ts
│       ├── finanzas.ts
│       └── sync.ts
│
├── public/
│   ├── icons/                            # 192x192, 512x512 para PWA
│   └── manifest.json
├── next.config.ts                        # next-pwa config
└── package.json
```

---

## 2. Esquema Firestore

Toda la data vive bajo una clínica. Multi-clínica desde el día 1.

```
firestore/
│
├── clinicas/{clinicaId}
│   ├── nombre: string
│   ├── pais: "NI"
│   ├── telefono: string
│   ├── plan: "free" | "pro"
│   └── creadoEn: Timestamp
│
├── usuarios/{uid}
│   ├── nombre: string
│   ├── email: string
│   ├── clinicaId: string
│   ├── rol: "admin" | "veterinario" | "recepcionista"
│   └── activo: boolean
│
├── clinicas/{clinicaId}/duenos/{duenoId}
│   ├── nombre: string
│   ├── telefono: string                  # Para WhatsApp
│   ├── email?: string
│   ├── direccion?: string
│   ├── notas?: string
│   ├── creadoEn: Timestamp
│   └── _sync: { updatedAt: Timestamp, deletedAt: Timestamp | null }
│
├── clinicas/{clinicaId}/pacientes/{pacienteId}
│   ├── nombre: string
│   ├── especie: "perro" | "gato" | "ave" | "conejo" | "reptil" | "otro"
│   ├── raza?: string
│   ├── sexo: "macho" | "hembra"
│   ├── fechaNacimiento?: Timestamp
│   ├── peso?: number                     # kg
│   ├── color?: string
│   ├── fotoUrl?: string
│   ├── duenoId: string
│   ├── activo: boolean
│   ├── notas?: string
│   ├── creadoEn: Timestamp
│   └── _sync: { updatedAt: Timestamp, deletedAt: Timestamp | null }
│
├── clinicas/{clinicaId}/historial/{registroId}
│   ├── pacienteId: string
│   ├── tipo: "consulta" | "vacuna" | "cirugia" | "control" | "examen" | "otro"
│   ├── fecha: Timestamp
│   ├── motivoConsulta: string
│   ├── examenFisico?: string
│   ├── diagnostico?: string
│   ├── tratamiento?: string
│   ├── medicamentos?: [{ nombre, dosis, duracion }]
│   ├── vacuna?: { nombre, lote, proximaDosis: Timestamp }
│   ├── peso?: number
│   ├── temperatura?: number
│   ├── veterinarioId: string
│   ├── creadoEn: Timestamp
│   └── _sync: { updatedAt: Timestamp }
│
├── clinicas/{clinicaId}/citas/{citaId}
│   ├── pacienteId: string
│   ├── duenoId: string
│   ├── fecha: Timestamp
│   ├── duracionMin: number               # 15, 30, 60
│   ├── tipo: "consulta" | "vacuna" | "cirugia" | "control" | "grooming"
│   ├── estado: "programada" | "confirmada" | "completada" | "cancelada"
│   ├── notas?: string
│   ├── recordatorioEnviado: boolean
│   ├── veterinarioId: string
│   ├── creadoEn: Timestamp
│   └── _sync: { updatedAt: Timestamp, deletedAt: Timestamp | null }
│
├── clinicas/{clinicaId}/inventario/{productoId}
│   ├── nombre: string
│   ├── categoria: "medicamento" | "alimento" | "accesorio" | "vacuna" | "insumo"
│   ├── esControlado: boolean             # Medicamentos controlados
│   ├── stockActual: number
│   ├── stockMinimo: number               # Para alertas
│   ├── unidad: "unidad" | "caja" | "ml" | "mg" | "kg" | "tableta"
│   ├── precioCompra?: number
│   ├── precioVenta?: number
│   ├── fechaCaducidad?: Timestamp
│   ├── proveedor?: string
│   ├── codigoBarras?: string
│   ├── activo: boolean
│   ├── creadoEn: Timestamp
│   └── _sync: { updatedAt: Timestamp }
│
├── clinicas/{clinicaId}/movimientos/{movimientoId}
│   ├── productoId: string
│   ├── tipo: "entrada" | "salida" | "ajuste"
│   ├── cantidad: number
│   ├── motivo?: string
│   ├── pacienteId?: string               # Si fue usado en consulta
│   ├── usuarioId: string
│   ├── fecha: Timestamp
│   └── _sync: { updatedAt: Timestamp }
│
└── clinicas/{clinicaId}/finanzas/{transaccionId}
    ├── tipo: "ingreso" | "gasto"
    ├── categoria: "consulta" | "vacuna" | "cirugia" | "venta" | "otro"
    ├── monto: number
    ├── moneda: "NIO" | "USD"
    ├── descripcion: string
    ├── pacienteId?: string
    ├── metodoPago: "efectivo" | "transferencia" | "tarjeta"
    ├── fecha: Timestamp
    ├── usuarioId: string
    └── _sync: { updatedAt: Timestamp }
```

---

## 3. Estrategia Offline-First

### Principio central

**Dexie es la fuente de verdad en tiempo real. Firebase es el respaldo y la sincronización entre dispositivos.**

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                     │
│                                                         │
│  UI → hooks → Dexie (IndexedDB) ← SyncEngine           │
│                    ↕ (siempre responde al instante)      │
│               SyncQueue (operaciones pendientes)         │
└─────────────────────────┬───────────────────────────────┘
                          │ cuando hay internet
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    FIREBASE                              │
│   Firestore ←→ SyncEngine (push + pull)                 │
└─────────────────────────────────────────────────────────┘
```

### Schema Dexie (IndexedDB local)

```typescript
// lib/db/database.ts
interface SyncMeta {
  syncStatus: 'synced' | 'pending' | 'conflict';
  updatedAt: number;       // timestamp local (ms)
  cloudUpdatedAt?: number; // timestamp cloud
  deletedAt?: number;      // soft delete
  operacion?: 'create' | 'update' | 'delete';
}

// Tabla especial: cola de sincronización
interface SyncQueueItem {
  id: string;              // UUID
  coleccion: string;       // "pacientes", "citas", etc.
  documentoId: string;
  operacion: 'create' | 'update' | 'delete';
  datos: object;
  intentos: number;
  creadoEn: number;
}
```

### Flujo de escritura (siempre offline-safe)

```
1. Usuario crea/edita un paciente
       ↓
2. Se escribe en Dexie inmediatamente
   { syncStatus: 'pending', updatedAt: Date.now() }
       ↓
3. Se agrega a sync_queue
   { coleccion: 'pacientes', operacion: 'create', datos: {...} }
       ↓
4. UI actualiza al instante (reactivo via useLiveQuery)
       ↓
5. SyncEngine detecta: ¿hay internet? ¿hay items en queue?
       ↓ SÍ
6. Envía a Firestore → actualiza syncStatus a 'synced'
       ↓ NO
7. Queda en queue hasta que vuelva la conexión
```

### Flujo de lectura (pull desde Firebase)

```
Al abrir la app / reconectar internet:
1. SyncEngine descarga cambios de Firestore
   donde _sync.updatedAt > última_sincronización_local
       ↓
2. Para cada documento:
   a. ¿Existe local con syncStatus: 'synced'?  → actualiza Dexie
   b. ¿Existe local con syncStatus: 'pending'? → ConflictResolver
   c. ¿No existe local?                        → inserta en Dexie
       ↓
3. Actualiza timestamp de última sync
```

### Resolución de conflictos

Estrategia: **Last Write Wins** con aviso visual si el conflicto es reciente.

```typescript
// lib/sync/ConflictResolver.ts
function resolver(local: SyncMeta, remoto: SyncMeta): 'local' | 'remoto' | 'notificar' {
  const diferencia = remoto.updatedAt - local.updatedAt;
  // Si ambos fueron editados con menos de 5 min de diferencia → avisar al usuario
  if (Math.abs(diferencia) < 5 * 60 * 1000) return 'notificar';
  return diferencia > 0 ? 'remoto' : 'local';
}
```

---

## 4. User Stories — Fase 1 Priorizada

### Épica 1: Pacientes

| # | Historia | Prioridad |
|---|----------|-----------|
| P1 | Como veterinaria, quiero registrar una mascota en menos de 1 minuto | 🔴 Crítica |
| P2 | Como recepcionista, quiero buscar una mascota por nombre o dueño instantáneamente | 🔴 Crítica |
| P3 | Como veterinaria, quiero ver toda la ficha de un paciente en una sola pantalla | 🔴 Crítica |
| P4 | Como veterinaria, quiero agregar una nota clínica usando una plantilla rápida | 🟠 Alta |
| P5 | Como veterinaria, quiero ver el historial completo ordenado por fecha | 🟠 Alta |
| P6 | Como recepcionista, quiero registrar los datos del dueño junto a la mascota | 🟠 Alta |
| P7 | Como veterinaria, quiero agregar o editar el peso en cada consulta | 🟡 Media |

### Épica 2: Agenda

| # | Historia | Prioridad |
|---|----------|-----------|
| A1 | Como recepcionista, quiero agendar una cita en menos de 30 segundos | 🔴 Crítica |
| A2 | Como veterinaria, quiero ver todas las citas del día de un vistazo | 🔴 Crítica |
| A3 | Como sistema, quiero enviar recordatorio por WhatsApp 24h antes de la cita | 🟠 Alta |
| A4 | Como recepcionista, quiero confirmar o cancelar una cita fácilmente | 🟠 Alta |
| A5 | Como veterinaria, quiero ver la agenda semanal | 🟡 Media |

### Épica 3: Inventario

| # | Historia | Prioridad |
|---|----------|-----------|
| I1 | Como encargada, quiero ver qué productos tienen stock bajo hoy | 🔴 Crítica |
| I2 | Como encargada, quiero registrar entrada de stock desde el celular | 🔴 Crítica |
| I3 | Como sistema, quiero alertar cuando un producto esté por vencer | 🟠 Alta |
| I4 | Como veterinaria, quiero registrar qué medicamentos usé en una consulta | 🟠 Alta |
| I5 | Como encargada, quiero un log de movimientos por producto | 🟡 Media |
| I6 | Como veterinaria, quiero un registro especial para medicamentos controlados | 🟡 Media |

### Épica 4: Finanzas

| # | Historia | Prioridad |
|---|----------|-----------|
| F1 | Como dueña, quiero registrar cada pago recibido rápidamente | 🔴 Crítica |
| F2 | Como dueña, quiero ver cuánto ingresé este mes | 🔴 Crítica |
| F3 | Como dueña, quiero ver un reporte simple por categoría | 🟠 Alta |
| F4 | Como dueña, quiero registrar gastos (compras de inventario) | 🟡 Media |

---

## 5. Plan de Desarrollo por Módulos

```
Semana 1 — Infraestructura + Pacientes Core
├── Dexie schema + migraciones
├── Firebase config + Auth
├── SyncEngine básico (write → queue)
├── Módulo Pacientes: registro + búsqueda + ficha
└── Hook usePacientes con useLiveQuery

Semana 2 — Historial + Agenda
├── HistorialClínico con plantillas rápidas
├── Módulo Agenda: calendario + formulario de cita
├── Hook useCitas
└── SyncEngine: pull desde Firestore al reconectar

Semana 3 — Inventario + WhatsApp
├── Módulo Inventario: productos + stock
├── Entrada rápida mobile-optimized
├── Alertas de stock bajo y caducidad
├── Integración WhatsApp (API route + proveedor)
└── Recordatorios automáticos de citas

Semana 4 — Finanzas + PWA + Pulido
├── Módulo Finanzas: ingresos + reportes
├── PWA: manifest + service worker
├── ConflictResolver completo
├── SyncStatusBadge + OfflineBanner
├── Testing en dispositivos reales (celular Nicaragua)
└── Optimizaciones de rendimiento offline
```

### Orden de dependencias técnicas

```
Auth → Dexie → SyncQueue → Pacientes → Historial
                                  ↓
                            Agenda (requiere Pacientes)
                                  ↓
                       Inventario (independiente)
                                  ↓
              Finanzas (requiere Pacientes + Inventario)
```
