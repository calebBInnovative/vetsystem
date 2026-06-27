Ahora vamos a implementar el **Modo Demo** para VetSystem con los siguientes requisitos exactos:

### Requisitos de la Demo:

1. **Datos de Ejemplo Pre-cargados**
   - Al entrar en modo Demo, cargar automáticamente datos realistas:
     - 8-10 pacientes con dueños
     - 5-6 citas programadas
     - Algunas consultas/historial clínico
     - Inventario con productos y stock
     - Facturas de ejemplo
   - Los datos deben verse reales (nombres nicaragüenses, razas comunes, etc.)

2. **Tour Guiado**
   - Se activa **automáticamente** la primera vez que entra en Demo
   - El tour debe ser visible y claro (usando pasos con highlight)
   - Botón grande y visible de **"Saltar Tour"**
   - Opción de "**Ver Tour Nuevamente**" en algún lugar (header o menú)

3. **Comportamiento de los Datos**
   - Los datos se guardan en IndexedDB (Dexie)
   - **NO se borran** al cerrar la pestaña o navegador
   - **Se borran automáticamente** cuando el usuario hace Logout del modo Demo

### Estructura Técnica Sugerida:

- Crear `src/lib/demo/demoData.ts` → datos de ejemplo
- Crear `src/hooks/useDemoMode.ts`
- Crear `src/components/common/TourGuide.tsx`
- Modificar el layout y login para detectar modo demo
- Agregar banner visible: "Modo Demo - Datos de prueba"

### Tareas:

Genera primero:

1. `src/lib/demo/demoData.ts` (datos realistas)
2. `src/hooks/useDemoMode.ts`
3. `src/components/common/TourGuide.tsx` (simple pero efectivo)
4. Modificaciones necesarias en `AppLayout.tsx` y `layout.tsx` para soportar modo demo

La experiencia debe sentirse profesional y pulida. El usuario debe poder explorar libremente el sistema como si fuera real.

Comienza entregándome los archivos en orden.