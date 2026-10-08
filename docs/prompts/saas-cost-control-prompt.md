# PROMPT — Control de costos y medición de uso por inquilino en un SaaS sobre Firestore

Implementa el control de costos de infraestructura siguiendo este patrón, ya aplicado en producción en un SaaS multi-inquilino offline-first.
Todo el código (variables, tipos, comentarios, archivos) en **inglés**; solo los textos visibles al usuario en el idioma de la UI.

## El problema real (y el falso)

Antes de diseñar nada, ordena las magnitudes. Precios de Firestore (us-central, Blaze — verifícalos, cambian):

| Operación | Costo |
|---|---|
| Lecturas | $0.06 / 100k |
| Escrituras | $0.18 / 100k |
| Almacenamiento | $0.18 / GiB-mes |

Que un cliente cree **2,000,000 de registros** cuesta **$3.60 una sola vez** más ~$0.36/mes de almacenamiento. Eso casi nunca es el problema.

**El problema es la descarga completa.** En una app offline-first cada dispositivo nuevo baja la base entera: 2M documentos = **$1.20 por dispositivo, cada vez** que alguien entra desde otro navegador, borra los datos del sitio o cambia de máquina. Diez empleados rotando y ya pagas más en lecturas que lo que le facturas a ese cliente.

Diseña contra eso, no contra la escritura masiva.

## 1. Ventana temporal en la primera descarga (el mayor ahorro)

Divide las colecciones en dos clases y trátalas distinto:

- **Catálogo / datos maestros** (clientes, productos, servicios, usuarios): **nunca** se recortan. La UI lee solo de la base local, así que un registro que no se descargó *no existe* para el usuario — se ve como borrado.
- **Historial transaccional** (ventas, pagos, facturas, citas, movimientos): se limita a los últimos N meses (12 es un buen valor por defecto) en la primera descarga.

```ts
const INITIAL_PULL_WINDOW_DAYS = 365;
const WINDOWED_COLLECTIONS = new Set([
  'sales', 'payments', 'invoices', 'consultations', 'appointments', 'movements',
]);

async pull(collection: string, since: number, tenantId: string, fullHistory = false) {
  // …consulta incremental por cursor (barata, nunca se recorta)…

  if (since === 0 && results.length === 0) {           // primera descarga
    const windowed = !fullHistory && WINDOWED_COLLECTIONS.has(collection);
    const cutoff   = Date.now() - INITIAL_PULL_WINDOW_DAYS * 86_400_000;
    const constraints = windowed
      ? [where('updatedAt', '>=', cutoff), orderBy('updatedAt', 'asc'), limit(BATCH)]
      : [limit(BATCH)];
    // …paginar…
  }
}
```

Deja siempre una salida manual: una acción **"Forzar descarga"** que llame al pull con `fullHistory: true` y traiga la historia completa. Quien de verdad necesita cinco años de datos los pide; el resto no paga por ellos.

## 2. Medición por inquilino con agregaciones, no con triggers

Esta es la decisión que más gente erra. `count()` en Firestore se cobra **1 lectura por cada 1000 entradas de índice**, no una por documento: contar un millón de documentos cuesta ~1000 lecturas (≈ $0.0006).

```ts
const snap = await getCountFromServer(collection(db, 'tenants', tenantId, name));
counts[name] = snap.data().count;
```

**No uses un trigger `onDocumentCreated` que incremente contadores.** Cuesta una invocación por *cada* escritura, suma latencia a cada operación del usuario, y los contadores se desvían para siempre en cuanto una invocación falla. Para medir uso, una foto periódica barata es mejor que un contador caro y frágil.

Guarda una foto por inquilino por día:

```
admin/usage/{tenantId}/{YYYY-MM-DD} → {
  tenantId, date, takenAt,
  counts: { [collection]: number },
  totalDocs,
  measurementReads,     // lo que costó medir: la medición nunca esconde su propio costo
}
```

Un documento por día hace que el crecimiento sea una resta entre dos fotos, y el histórico sobrevive aunque Firestore no sepa atribuir costo por inquilino.

Dónde ejecutarlo:
- **Cloud Function programada** (diaria), si ya tienes funciones desplegadas: automático y cubre todos los inquilinos.
- **Desde la app, con el usuario administrador**, si no quieres abrir esa puerta todavía: mismo código, botón "Medir ahora", cubre el inquilino activo.

Escribe la lógica en un servicio aislado del framework para que pasar de una opción a otra sea cambiar quién la llama, no reescribirla.

Ojo con la visibilidad cruzada: si las reglas limitan cada usuario a su propio inquilino, desde la app **solo puedes medir el inquilino activo**. Para verlos todos hace falta una función con Admin SDK (que salta las reglas) o un rol de plataforma en las reglas. Decídelo a conciencia, no por accidente.

## 3. Panel de uso dentro del producto

Una pantalla solo para administradores que lea esas fotos y muestre:

- **Documentos totales** y desglose por colección (barra de proporción: dónde está el volumen).
- **Crecimiento** entre las dos últimas mediciones, con los días transcurridos.
- **Almacenamiento al mes** estimado.
- **Costo de una descarga completa** — la cifra a vigilar, con una línea explicando que se paga por cada dispositivo nuevo.

Y una regla de honestidad: **no estimes las lecturas/escrituras del día a día a partir del conteo de documentos.** Dependen de cuántos dispositivos sincronizan y con qué frecuencia, no de cuántos documentos existen. Un número inventado ahí es peor que ningún número. Dilo en la pantalla.

## 4. Límites por plan, en las reglas (no solo en la UI)

Guarda los límites en el documento del inquilino y valida contra la última foto de uso:

```
allow create: if belongsToTenant(tenantId)
              && get(/databases/$(db)/documents/admin/usage/$(tenantId)).data.totalDocs
                 < get(/databases/$(db)/documents/tenants/$(tenantId)).data.limits.maxDocs;
```

Dos advertencias que se pagan caro:
- Cada `get()` en reglas cuenta contra el **límite de 10 accesos a documentos por request**, y en consultas de lista se evalúa **por documento devuelto**. Si ya haces un `get()` por documento para validar pertenencia, el tamaño de página debe quedar por debajo de 10. Mídelo antes de darlo por bueno.
- Validar contra una foto diaria no frena un abuso dentro del mismo día. Es un tope contractual, no un cortafuegos.

## 5. Cortafuegos reales

- **Tope de importación masiva en la app.** El importador de CSV es la vía más probable de crear 10,000 registros sin querer. Límite de filas por archivo y confirmación explícita por encima de cierto número. Cubre el 90% del abuso, que es accidental.
- **Alertas de presupuesto** en Cloud Billing, en varios escalones.
- **Interruptor de emergencia**: un documento `admin/killswitch` que las reglas consulten para cortar escrituras si algo se desboca.
- **App Check** activado, para que solo tu app pueda hablar con el backend. Sin esto, cualquiera con las claves públicas del cliente puede generarte costo.

## 6. Modelo de cobro

No intentes facturar el uso real de infraestructura. No puedes atribuir lecturas por inquilino de forma confiable y acabas con una factura que no sabes explicar. **Cobra por plan, con un límite de uso justo publicado**, y usa las métricas para detectar quién se salió de la norma y conversarlo — no para cobrarle al centavo.

## 7. Errores que este diseño evita

1. Optimizar la escritura masiva (barata) y dejar la descarga completa (cara) sin tocar.
2. Recortar el catálogo por fecha: el usuario ve sus datos desaparecer y cree que el sistema los borró.
3. Contar con triggers por escritura: caro, lento, y se desvía con cada fallo.
4. Medir sin registrar lo que costó medir.
5. Estimar costos de lectura a partir del número de documentos y presentarlos como si fueran reales.
6. Poner los límites solo en la UI: el cliente de la base de datos los salta sin esfuerzo.
7. Añadir `get()` en reglas sin contar el límite de 10 accesos por request — se manifiesta como "Missing or insufficient permissions" solo cuando la colección crece, que es el peor momento para enterarse.
8. Dejar el periodo de prueba con un vencimiento largo por defecto (por ejemplo un año): regalas el producto sin darte cuenta.
