Eres un diseñador frontend senior especializado en landing pages SaaS premium.

Vamos a crear la **Landing Page pública** de **VetSystem** — un sistema de gestión veterinaria para clínicas en Nicaragua.

---

### Stack y contexto del proyecto

- **Next.js 15** con App Router y TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (ya instalados)
- Los temas (Light, Soft Light, Dark) ya están configurados en `globals.css`
- No usar imágenes externas — todos los mockups deben construirse con código (divs, bordes, colores, texto simulado)
- No agregar comentarios en el código salvo que el WHY sea completamente no obvio

---

### Estructura de archivos

- `src/app/(marketing)/layout.tsx` → Layout limpio sin sidebar ni header del dashboard
- `src/app/(marketing)/page.tsx` → Página principal (reemplaza `src/app/page.tsx` si existe)

La ruta `/` debe apuntar a la landing. Si ya existe `src/app/page.tsx`, eliminarlo y usar `src/app/(marketing)/page.tsx` en su lugar.

---

### Diseño

- Estilo: **Modern Clinical Premium** — limpio, profesional, confiable y cálido
- Colores: Teal/Emerald como acento principal, fondo neutro claro/oscuro según tema
- Tipografía: Inter (o sistema sans-serif moderno)
- Totalmente responsive — mobile-first
- Sin librerías de animación externas — solo Tailwind transitions y CSS puro

---

### Secciones (en orden)

**1. Navbar**
- Logo + nombre "VetSystem" a la izquierda
- Links: Beneficios · Precios · Contacto
- Botones: "Iniciar Sesión" (outline) · "Comenzar Gratis" (primary, lleva a `/register`)
- Sticky en scroll, con blur backdrop

**2. Hero**
- Título: "El sistema veterinario que Nicaragua estaba esperando"
- Subtítulo: "Funciona sin internet · Control total de tu clínica · Fácil de usar desde el primer día"
- Botones: "Comenzar Gratis" (grande) + "Ver cómo funciona" (scroll a sección mockup)
- A la derecha: mockup del dashboard construido en código (tarjetas, tabla, colores del sistema)

**3. Beneficios** (4 tarjetas con ícono, título y descripción corta)
- 📴 Funciona 100% sin internet — tus datos siempre disponibles, se sincronizan cuando hay conexión
- 🐾 Historial clínico completo — pacientes, consultas, vacunas y más en un solo lugar
- 📦 Inventario con alertas — nunca más quedarte sin medicamentos críticos
- 🧾 Facturación instantánea — genera y cobra desde la misma consulta
- (WhatsApp NO va aquí — no está implementado aún)

**4. "El sistema en acción"**
- Tres mockups en código lado a lado (o tabs en móvil):
  - Vista de paciente (nombre, especie, historial)
  - Agenda del día (lista de citas con estado)
  - Ticket de cobro / factura
- Todo construido con divs estilizados, sin screenshots reales

**5. Testimonios**
- Al menos 2 testimonios con nombre, clínica y texto corto
- Uno puede ser de una clínica de prueba / beta
- Diseño tipo card con avatar iniciales (no fotos)

**6. Precios**
- Un solo plan claro: **$15 USD / mes**
- Incluye: usuarios ilimitados, soporte, actualizaciones, funciona offline
- Opción anual con 2 meses gratis ($150/año)
- CTA: "Comenzar Gratis" → `/register`
- Nota pequeña: "14 días de prueba gratis · Sin tarjeta de crédito"

**7. Footer**
- Logo + tagline
- Links: Iniciar Sesión · Registrarse · Contacto
- Email de soporte
- "Hecho con ❤️ en Nicaragua"
- Copyright

---

### Rutas importantes

| Botón / Link | Destino |
|---|---|
| Iniciar Sesión | `/login` |
| Comenzar Gratis | `/register` |
| Ver cómo funciona | scroll interno `#demo` |

---

### Lo que NO hacer

- No usar `<img>` con URLs externas
- No instalar librerías nuevas (framer-motion, etc.)
- No agregar comentarios obvios en el código
- No mencionar WhatsApp como feature disponible (aún no existe)
- No poner "Probar Demo Gratis" si no hay demo real
- No inventar rutas que no existen en el proyecto
