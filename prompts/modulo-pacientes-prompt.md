# Prompt — Módulo de Pacientes (Fase 1)

Usando la arquitectura que definimos previamente para VetSystem, ahora vamos a construir el **Módulo de Pacientes** completo (Fase 1).

## Requisitos del Módulo Pacientes

- Debe ser extremadamente rápido y fácil de usar (registrar un paciente en menos de 60 segundos).
- Soporte completo para Offline-First con Dexie.js.
- Búsqueda ultrarrápida.
- Ficha completa del paciente.
- Historial clínico con plantillas rápidas.
- Soporte para múltiples temas (Light, Soft Light, Dark) y paletas de color.

## Tareas

1. **Genera todos los archivos necesarios** para el módulo Pacientes siguiendo exactamente la estructura de carpetas que definimos.

2. Entrega el código completo y listo para copiar de los siguientes archivos:
   - `src/types/paciente.ts`
   - `src/lib/validations/paciente.schema.ts`
   - `src/lib/db/database.ts`
   - `src/components/pacientes/PacienteForm.tsx`
   - `src/components/pacientes/BuscadorPacientes.tsx`
   - `src/components/pacientes/PacienteCard.tsx`
   - `src/components/pacientes/FichaPaciente.tsx`
   - `src/app/(dashboard)/pacientes/page.tsx`
   - `src/app/(dashboard)/pacientes/nuevo/page.tsx`
   - `src/hooks/usePacientes.ts`

3. Usa **React Hook Form + Zod** para los formularios.
4. Usa `useLiveQuery` de Dexie para reactividad en tiempo real.
5. El diseño debe ser limpio, elegante y mobile-friendly.
6. Incluye campos: nombre, especie, raza, sexo, fecha de nacimiento, peso, color, foto (opcional), datos del dueño.

## Reglas

- Todo el código en español (labels, placeholders, mensajes).
- Máxima simplicidad para el usuario final.
- Buen manejo de loading y estados vacíos.
- Preparado para sincronización (campos `_sync`).
