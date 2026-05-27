# Respuesta — Módulo de Pacientes (Fase 1)

## Archivos creados

```
src/
├── types/
│   └── paciente.ts
├── lib/
│   ├── db/
│   │   └── database.ts
│   └── validations/
│       └── paciente.schema.ts
├── hooks/
│   └── usePacientes.ts
├── components/
│   └── pacientes/
│       ├── PacienteForm.tsx
│       ├── BuscadorPacientes.tsx
│       ├── PacienteCard.tsx
│       └── FichaPaciente.tsx
└── app/
    └── (dashboard)/
        ├── layout.tsx                  ← nuevo: AppLayout para todo el grupo
        └── pacientes/
            ├── page.tsx                ← lista con búsqueda
            ├── nuevo/page.tsx          ← formulario de registro
            └── [id]/page.tsx           ← ficha del paciente
```

## Dependencia requerida

```bash
npm install @hookform/resolvers
```

Se agregó a `package.json`. El usuario debe correr `npm install` una vez.

---

## Decisiones técnicas

### `src/types/paciente.ts`
- `SyncMeta` separado como interface — reutilizable en otros módulos (citas, inventario)
- `ESPECIES` como constante tipada con emoji + label para evitar duplicación en formularios y cards
- `PacienteConDueno` extiende `PacienteLocal` con el dueño ya unido (para evitar re-queries en la UI)

### `src/lib/db/database.ts`
- Usa `EntityTable<T, 'id'>` de Dexie 4 para tipado fuerte
- Índices en campos frecuentemente filtrados: `nombre`, `especie`, `duenoId`, `syncStatus`, `deletedAt`
- `syncQueue` con auto-increment (`++id`) — no necesita UUID

### `src/lib/validations/paciente.schema.ts`
- `z.preprocess` para el campo `peso` — convierte string vacío a `undefined` antes de validar
- `duenoSchema` separado — reutilizable en formulario de edición de dueño
- Compatible con Zod v4

### `src/hooks/usePacientes.ts`
- `usePacientes(busqueda)` — un solo hook para lista + búsqueda, evita dos hooks separados
- Búsqueda: cuando hay término hace join en memoria con dueños para filtrar por nombre del dueño también
- Sin término: usa índice de Dexie `.reverse().sortBy('updatedAt')` — más eficiente
- `crearPaciente` deduplica dueños por teléfono — si el dueño ya existe, solo actualiza sus datos
- Soft delete: `deletedAt` timestamp en vez de borrado físico — recuperable y sincronizable
- Toda escritura agrega a `syncQueue` automáticamente

### `src/components/pacientes/PacienteForm.tsx`
- Selector visual de especie con emojis (botones tipo chip) en vez de `<select>` — más rápido en móvil
- Selector de sexo igual (chips) — 1 tap en vez de dropdown
- `autoFocus` en nombre — el cursor ya está listo al abrir el formulario
- Secciones separadas: "Mascota" y "Dueño" — organización visual clara

### `src/components/pacientes/BuscadorPacientes.tsx`
- Debounce de 280ms con `useRef` para el timer — evita múltiples búsquedas mientras se escribe
- Botón de limpiar visible solo cuando hay texto

### `src/components/pacientes/PacienteCard.tsx`
- `calcularEdad` formatea la edad en semanas/meses/años de forma legible
- Indicador de sync (punto verde/ámbar) visible pero no invasivo
- `hover:scale-105` en el avatar — microinteracción que da vida a la UI

### `src/components/pacientes/FichaPaciente.tsx`
- Recibe `pacienteId` como prop — puede usarse en modal o en página
- Acciones rápidas: Historial, Nueva Cita, WhatsApp — preparadas para los próximos módulos
- Badge de sync con colores que funcionan en light y dark mode

### `src/app/(dashboard)/layout.tsx`
- Route group `(dashboard)` — aplica `AppLayout` a todas las rutas internas sin repetir código
- El dashboard raíz (`/`) sigue usando `AppLayout` directamente en su `page.tsx` por ahora

---

## Próximo paso sugerido

**Módulo Historial Clínico** con plantillas rápidas:
- `src/types/historial.ts`
- `src/lib/db/database.ts` (agregar tabla `historial`)
- `src/components/pacientes/HistorialItem.tsx`
- `src/components/pacientes/RegistroClinicoForm.tsx` (con plantillas)
- `src/app/(dashboard)/pacientes/[id]/historial/page.tsx`
