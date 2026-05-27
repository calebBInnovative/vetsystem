# Respuesta — Núcleo del Módulo Pacientes

## Archivos actualizados

| Archivo | Cambios clave |
|---------|--------------|
| `src/types/paciente.ts` | `SyncMeta` separado y comentado, `SEXOS` agregado, `ESPECIES` centralizado |
| `src/lib/validations/paciente.schema.ts` | Validaciones defensivas, regex en teléfono, límites `max()`, Zod v4 |
| `src/lib/db/database.ts` | Comentarios de arquitectura, índices explicados, guía para agregar tablas futuras |
| `src/hooks/usePacientes.ts` | Dos rutas de búsqueda (con/sin término), deduplicación de dueños, soft delete |

---

## Decisiones técnicas

### `types/paciente.ts`

**`SyncMeta` como interface separada:**
Se separa del tipo `Paciente` para reutilizarla en todos los módulos futuros
(`HistorialLocal`, `CitaLocal`, `ProductoLocal`, etc.) sin duplicar código.

**`PacienteConDueno`:**
Extiende `PacienteLocal` con el dueño ya unido. Evita que cada componente tenga
que hacer su propio query de dueño. El join se hace una sola vez en el hook.

**`ESPECIES` y `SEXOS` como constantes:**
Centralizados aquí en vez de duplicarlos en form + card + ficha.
Cualquier cambio de label/emoji se hace en un solo lugar.

---

### `validations/paciente.schema.ts`

**`z.preprocess` para el campo `peso`:**
```typescript
z.preprocess(
  (val) => {
    if (val === '' || val === undefined || val === null) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  },
  z.number().positive().optional()
)
```
Los inputs `type="number"` de HTML retornan strings. Sin `preprocess`,
Zod v4 fallaría con "expected number, received string".

**`duenoSchema` exportado por separado:**
Permite reutilizarlo en el futuro formulario de edición de dueño sin
tener que extraerlo del schema de paciente.

---

### `lib/db/database.ts`

**Índices de Dexie — qué se indexa y por qué:**

| Campo | Por qué se indexa |
|-------|-------------------|
| `nombre` | Búsqueda directa `.where('nombre').startsWithIgnoreCase()` |
| `especie` | Filtro futuro por tipo de animal |
| `duenoId` | Join con tabla duenos |
| `clinicaId` | Multi-clínica: aislar datos por clínica |
| `syncStatus` | SyncEngine filtra `pending` para procesar |
| `updatedAt` | `.sortBy('updatedAt')` — orden por reciente |
| `deletedAt` | Filtrar eliminados eficientemente |
| `telefono` (duenos) | Deduplicación por teléfono |

**No se indexa:** `notas`, `color`, `fotoUrl`, `raza` — campos que nunca
se filtran directamente. Más índices = más espacio + más lento en escritura.

---

### `hooks/usePacientes.ts`

**Dos rutas en `usePacientes(busqueda)`:**

```
Sin término → usa índice Dexie → .reverse().sortBy('updatedAt')
                                  más eficiente para listas grandes

Con término → carga todo en memoria → filter() en JS
              más flexible para búsqueda cross-table (paciente + dueño)
```

**Por qué no buscar solo con índices Dexie:**
Dexie no soporta joins nativos. Para buscar "Max cuyo dueño se llama Carlos",
hay que cargar ambas tablas y filtrar en JS. Con <10,000 registros esto
es instantáneo en IndexedDB.

**`bulkGet` para cargar dueños:**
```typescript
const duenos = await db.duenos.bulkGet(duenoIds);
```
Una sola operación en vez de N `db.duenos.get(id)` en loop.
Crítico para listas de 100+ pacientes.

**Deduplicación de dueños en `crearPaciente`:**
Busca por teléfono + clinicaId. Si el dueño existe, solo actualiza
sus datos. Esto evita crear 3 registros "María García" cuando trae
3 mascotas distintas.

**`encolarSync` helper privado:**
Centraliza la lógica de insertar en syncQueue. Si en el futuro
el schema de SyncQueueItem cambia, se modifica en un solo lugar.
