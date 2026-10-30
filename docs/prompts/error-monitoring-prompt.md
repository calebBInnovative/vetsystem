# PROMPT — Monitoreo de errores en producción para una app web offline-first

Implementa el monitoreo de errores siguiendo este patrón, ya aplicado en producción en un SaaS multi-inquilino offline-first (Next.js con export estático, datos de clientes en la UI).
Todo el código (variables, tipos, comentarios, archivos) en **inglés**; solo los textos visibles al usuario en el idioma de la UI.

## Punto de partida: Crashlytics no sirve acá

Firebase Crashlytics **no tiene SDK para web** — solo iOS, Android, Flutter y Unity. Si el proyecto es una app web, la herramienta es **Sentry**. No pierdas tiempo buscando una integración que no existe.

Y si la app es un **export estático** (`output: 'export'`), configura **solo el cliente**: no hay runtime de servidor ni edge que instrumentar, así que los archivos `sentry.server.config.ts` y `sentry.edge.config.ts` que genera el asistente oficial sobran.

**No corras el wizard (`npx @sentry/wizard`) si vas a configurar a mano.** Reescribe `next.config`, crea sus propios archivos de configuración, publica una página de ejemplo en tu hosting, y —lo importante— su configuración **no incluye el transporte offline ni el filtrado de datos**, que son las dos decisiones que de verdad importan en este diseño.

## 1. Los errores offline son el punto, no un extra

En una app offline-first, el transporte por defecto **descarta** cualquier evento que no pueda enviar. O sea que pierdes exactamente los crashes que más te interesan: los que ocurren sin conexión.

```ts
import { makeBrowserOfflineTransport, makeFetchTransport } from '@sentry/browser';

Sentry.init({
  dsn,
  transport: makeBrowserOfflineTransport(makeFetchTransport),  // guarda en IndexedDB y reenvía al reconectar
  // …
});
```

No escribas tu propia cola: esta ya existe, está probada y usa IndexedDB igual que el resto de tu stack.

## 2. El monitoreo nunca puede romper el producto

Tres salvaguardas, todas con la misma lógica: es infraestructura opcional.

```ts
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) { Sentry.init({ ... }); }     // sin DSN, el SDK ni se inicializa
```

- Sin DSN la app corre intacta (desarrollo, forks, entornos sin configurar).
- Sin credenciales de build solo se salta la subida de source maps; el build **no falla**.
- `tracesSampleRate: 0` — errores sí, trazas no: el plan gratis se gasta en datos que nadie lee.

Añade una lista de ruido conocido para no llenar el panel con cosas que no son tus bugs:

```ts
ignoreErrors: [
  'ResizeObserver loop limit exceeded',
  'Non-Error promise rejection captured',
  /Failed to fetch/i, /NetworkError/i, /Load failed/i,
],
```

## 3. Filtrar datos del cliente antes de que salgan del dispositivo

Un mensaje de error arrastra rutinariamente lo que el código estaba manejando: un nombre, un teléfono, un correo. Eso pertenece a los clientes de tu cliente y no puede terminar en el panel de un tercero.

Escribe el filtro como **función pura**, aparte del SDK, para poder probarlo sin navegador:

```ts
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.user) event.user = { id: event.user.id };     // el inquilino, no la persona
  if (event.message) event.message = scrubText(event.message);
  for (const e of event.exception?.values ?? []) if (e.value) e.value = scrubText(e.value);
  for (const c of event.breadcrumbs ?? []) { /* message y data */ }
  event.extra = scrubValue(event.extra);
  if (event.request?.url) event.request.url = scrubText(event.request.url.split('?')[0]);
  delete event.request?.cookies;
  delete event.request?.headers;
  return event;
}
```

Tres capas de filtrado:

1. **Patrones**: correos, teléfonos (con el formato del país), secuencias largas de dígitos.
2. **Claves sensibles** por nombre (`name`, `phone`, `email`, `notes`, `address`, `password`, `token`, `authorization`…), reemplazadas sin importar dónde aparezcan, con recorrido **limitado en profundidad** para que un objeto cíclico o enorme no cuelgue la ruta de error.
3. **Términos conocidos en tiempo de ejecución**: el nombre del usuario y del inquilino de la sesión, eliminados por coincidencia exacta vía un `setScrubTerms()` que llamas al iniciar sesión.

**La limitación que debes documentar y no esconder:** un nombre de cliente interpolado en texto libre dentro de un mensaje de error es simplemente palabras, y tratar de adivinar nombres destrozaría los mensajes reales. La mitigación es una convención, no código: **nunca interpoles nombres de clientes en un mensaje de error que lances**.

**Pruébalo de verdad.** Arma un evento realista —con correos, teléfonos, cookies, headers de autorización, nombres, un id técnico y un monto— pásalo por el filtro y verifica dos cosas: que no sobrevive ningún dato personal, y que **sí** sobreviven el tipo de error, el stack y los ids técnicos. Un filtro que borra todo es tan inútil como uno que no borra nada.

## 4. Contexto útil, identidad no

```ts
Sentry.setUser({ id: session.tenantId });    // agrupa por inquilino sin identificar a nadie
Sentry.setTags({ role: session.role, plan: session.plan });
```

Con eso respondes "¿a qué cliente le pasa?" y "¿le pasa solo a recepción?" sin guardar quién es la persona.

## 5. Source maps o no hay diagnóstico

Sin source maps, un stack de producción se ve así:

```
page-021b38bea3215c9a.js:1:12456
```

Eso es inútil, y es la diferencia entre arreglar un bug en diez minutos o no arreglarlo. Súbelos en el build y **bórralos del export**: no quieras servir tus fuentes legibles desde un hosting público.

```ts
export default withSentryConfig(nextConfig, {
  org, project,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
```

Verifica después del build que no quedó ningún `.map` en la carpeta publicada.

## 6. Dónde van las credenciales (y la trampa del build)

| Valor | Dónde | Por qué |
|---|---|---|
| DSN (`NEXT_PUBLIC_*`) | **Variable** del repositorio | Va incrustado en el bundle del navegador: es público por diseño, igual que las claves web de Firebase. Guardarlo como secreto no protege nada y enmascara los logs del build. |
| Auth token | **Secreto** del repositorio | Da acceso a tu organización. Usa un token de **organización**, no uno personal atado a una cuenta. |

La regla general: **si lleva `NEXT_PUBLIC_`, no es secreto; si es secreto, no lleva `NEXT_PUBLIC_`.**

**Y la trampa que cuesta una tarde:** un valor `NEXT_PUBLIC_*` se incrusta **durante el build**, no se lee en tiempo de ejecución. Cambiar la variable en el CI no toca lo que ya está publicado — hace falta **un build nuevo**. Si recreas el proyecto en Sentry, el DSN cambia, y hasta que redespliegues tu producción seguirá mandando eventos a un proyecto borrado, donde se descartan en silencio. (Los tokens de organización, en cambio, sobreviven al borrado de un proyecto.)

Si recreas el proyecto, revisa también que el **slug** siga siendo el que tiene fijo el workflow: si cambió, el DSN funciona pero la subida de source maps apunta a un proyecto que no existe.

## 7. Cómo verificar que quedó andando

Un `throw` escrito directo en la consola a veces queda atrapado en el contexto de DevTools y no dispara `window.onerror`, que es de donde el SDK toma los errores globales. Usa:

```js
setTimeout(() => { throw new Error('prueba — ignorar'); });
```

Si no aparece nada, revisa en este orden:

1. **El filtro de entorno** en el panel: `environment` viene de `NODE_ENV`, así que lo desplegado reporta como `production` y lo local como `development`.
2. **El bloqueador de anuncios.** Es la causa más común y la más confusa: muchas extensiones y antivirus bloquean las peticiones a `*.ingest.sentry.io`. Míralo en la pestaña Network y prueba en una ventana de incógnito.
3. **El rango de tiempo** del panel.

Para la parte offline: pon el navegador en modo offline, lanza el error, vuelve a conectar y verifica que llega solo unos segundos después.

## 8. Higiene de CI al instalar el SDK

Instalar dependencias nuevas con una versión de npm distinta a la del CI rompe `npm ci` con un mensaje engañoso: *"package.json and package-lock.json are not in sync"*, aunque las dependencias estén perfectamente listadas. La causa suele ser que una versión de npm omite entradas opcionales (binarios nativos, wasm) que la otra espera.

Genera el lock con **la misma versión mayor de npm que corre el CI** y verifícalo ejecutando un `npm ci` real con esa versión contra una copia del manifiesto. Mejor aún: fija la versión de Node en ambos lados (`.nvmrc` y `engines`) para que el problema no pueda volver.

## 9. Errores que este diseño evita

1. Buscar Crashlytics para web, que no existe.
2. Usar el transporte por defecto en una app offline-first: pierdes justo los errores sin conexión.
3. Escribir tu propia cola offline cuando el SDK ya trae una.
4. Mandar datos de clientes a un tercero por no filtrar mensajes, breadcrumbs, cookies y headers.
5. Filtrar tanto que el reporte deja de servir para depurar: el tipo de error, el stack y los ids técnicos tienen que sobrevivir.
6. Dejar que la falta de una credencial de monitoreo rompa el deploy del producto.
7. Publicar source maps junto al bundle en un hosting público.
8. Guardar el DSN como secreto creyendo que lo proteges, cuando viaja en el bundle.
9. Cambiar la variable del DSN y esperar que surta efecto sin redesplegar.
10. Dar por buena la integración porque "compila", sin lanzar un error real y verlo llegar.
