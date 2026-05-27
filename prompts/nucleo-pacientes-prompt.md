# Prompt — Núcleo del Módulo Pacientes

Usando toda la arquitectura que definimos para VetSystem, ahora vamos a construir **el núcleo del Módulo Pacientes**.

Genera el código completo y listo para copiar de los siguientes archivos:

1. `src/types/paciente.ts`
2. `src/lib/validations/paciente.schema.ts`
3. `src/lib/db/database.ts` (actualizado con las tablas necesarias para pacientes y sync)
4. `src/hooks/usePacientes.ts`

## Requisitos importantes

- Soporte completo para **Offline-First** con Dexie.js
- Soft delete (`deletedAt`)
- Campos de sincronización (`syncStatus`, `updatedAt`, `cloudUpdatedAt`)
- Búsqueda por nombre de paciente y nombre de dueño
- Deduplicación inteligente de dueños por teléfono
- Tipado fuerte y limpio
- Todo en español (comentarios y nombres donde corresponda)
- Preparado para temas Light / Soft Light / Dark

**Prioridad alta en simplicidad y rendimiento.**
