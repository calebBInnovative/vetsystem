# VetSystem — Estrategia de precios y planes

> Documento de trabajo (2026-10-30). Complementa a `docs/prompts/saas-cost-control-prompt.md`,
> que trata **cuánto nos cuesta** cada clínica; este trata **cuánto cobrarle** y **qué incluye cada plan**.
> Los precios de la competencia se tomaron de sus páginas públicas en octubre 2026: verifícalos antes de
> citarlos a un cliente.

---

## 1. Punto de partida

| Hoy | Valor |
|---|---|
| Plan único | **US$20 / 30 días**, todo incluido, usuarios ilimitados |
| Prueba gratis | 7 días (`TRIAL_DAYS`) |
| Cobro | Transferencia BAC / LAFISE o Kash (manual, sin comisión); tarjeta vía Recurrente (oculta: no paga a Nicaragua) |
| Dónde vive el precio | Tarjeta: `functions/src/payments/recurrente/recurrente.plans.ts` (código). Manual: `platform/billing.prices` (editable en `/admin/payments`) |

Un solo precio deja dinero en la mesa en los dos extremos: el veterinario independiente que atiende solo
encuentra caro US$20, y una clínica con 8 empleados paga lo mismo que él.

## 2. Lo que nos cuesta una clínica

Con las cifras del prompt de costos (Firestore Blaze, us-central):

| Concepto | Clínica pequeña (~20k docs) | Clínica grande (~200k docs) |
|---|---|---|
| Almacenamiento | < US$0.01 / mes | ~US$0.04 / mes |
| Una descarga completa (dispositivo nuevo) | ~US$0.01 | ~US$0.12 |
| Push (FCM), Sentry (free tier), Hosting | US$0 | US$0 |
| Comprobantes en Storage | < US$0.01 / mes | < US$0.01 / mes |

**El costo de infraestructura es ruido frente al precio.** Lo que sí cuesta es:

- **Tu tiempo**: soporte por WhatsApp, revisar cada transferencia, capacitar. Una clínica con 10 usuarios
  pregunta más que un veterinario solo.
- **Comisión de tarjeta** (Recurrente u otra pasarela), cuando se active: confírmala en tu contrato;
  típicamente 4–6 % del cobro. Por eso el pago manual debe seguir siendo la opción por defecto.

Conclusión: **el precio no se fija por costo, se fija por valor y por mercado.** Los límites de cada plan
existen para separar tipos de cliente, no para proteger la factura de Firebase (de eso se encarga el
prompt de costos).

## 3. Mercado

| Producto | Precio mensual | Qué limita |
|---|---|---|
| [Veti](https://veti.app/) | US$15 + US$6 por usuario extra | Usuarios |
| [Mi Vete App](https://www.miveteapp.com/en/) | US$19 + IVA (Starter) | — |
| [g.vet](https://g.vet/en/plans-pricing) | US$20 (Plus) / US$25 (Gold) por sede | Funciones, sedes |
| [Vetesoft Nube](https://vetesoft.org/precios) | US$25 Starter / US$50 completo / US$369 al año | 1 usuario y 500 pacientes en Starter |
| [ACVet](https://www.acvet.app/) (Chile) | ~US$16 / 23 / 30 (Individual / Clínica / Hospital) | Tamaño de clínica |
| [Clinsis](https://sourceforge.net/software/product/Clinsis/) (presente en Nicaragua) | Cotización por módulos y usuarios | Módulos, usuarios |

Lectura: la entrada del mercado latino está en **US$15–20**, el plan "completo" en **US$25–50**, y los
dos ejes de límite más usados son **usuarios** y **módulos**. Nadie en la región compite fuerte en
**offline real** — es nuestra diferencia y justifica no ser el más barato.

## 4. Propuesta: tres planes

| | **Básico** | **Profesional** | **Clínica** |
|---|---|---|---|
| Para quién | Veterinario independiente, consultorio | Clínica típica (la de hoy) | Clínica con varios veterinarios / alto volumen |
| Precio mensual | **US$12** | **US$20** | **US$35** |
| Precio anual (2 meses gratis) | US$120 | US$200 | US$350 |
| Usuarios | 2 | 5 | 15 |
| Pacientes activos | 500 | Ilimitados | Ilimitados |
| Pacientes, agenda, consultas, historial | ✓ | ✓ | ✓ |
| Ventas (POS), cotizaciones, servicios | ✓ | ✓ | ✓ |
| Inventario y alertas de stock | ✓ | ✓ | ✓ |
| Facturas | — | ✓ | ✓ |
| Finanzas, egresos, colaboradores | — | ✓ | ✓ |
| Promociones | — | ✓ | ✓ |
| Importar / exportar CSV | — | ✓ | ✓ |
| Soporte | WhatsApp, horario hábil | WhatsApp, horario hábil | WhatsApp prioritario + capacitación inicial |

Por qué así:

- **Profesional = el plan actual a US$20.** Ninguna clínica que ya paga ve un cambio; el plan nuevo
  aparece por debajo (captar consultorios) y por encima (cobrar más a quien más usa).
- **Los límites son usuarios, pacientes y módulos** porque los tres se pueden verificar **offline**
  (ver §5). Límites de "documentos" o "consultas por mes" no los entiende un veterinario y son difíciles
  de hacer cumplir sin conexión — quedan como uso justo, medido con `admin/usage`.
- **Básico conserva todo lo clínico y el POS**: un consultorio que no puede cobrar ni ver su stock no
  adopta el sistema. Lo que se queda fuera es administración (finanzas, colaboradores, facturación).
- **No prometer multi-sucursal** en Clínica hasta que exista: el diferencial hoy son usuarios y soporte.
- **Anual con 2 meses gratis**: mejora caja y retención; con pago manual es una sola transferencia al año.

## 5. Cómo se haría cumplir (offline-first)

| Límite | Dónde se verifica | Offline |
|---|---|---|
| Módulos | El plan se copia a la sesión de Dexie; el menú y las rutas se ocultan igual que hoy con `Permissions` | ✓ |
| Pacientes | Antes de crear, `count()` local en Dexie contra el límite de la sesión | ✓ (tope suave: si dos dispositivos offline crean a la vez, puede pasarse por unos pocos) |
| Usuarios | Al crear usuario. Hoy se crea desde el cliente con reglas; para un tope **duro** conviene mover la creación a una Cloud Function que cuente antes de crear | Requiere conexión (crear usuarios ya la requiere) |
| Uso justo (documentos) | Foto diaria en `admin/usage` | Solo informativo, para conversar con quien se sale de la norma |

Al **bajar** de plan nunca se borran datos: lo que excede el límite queda visible en solo lectura
(no se pueden crear más pacientes / el módulo se oculta pero sus datos siguen en Firestore).

## 6. Control desde tu panel

Precios y límites deben salir del código y vivir en Firestore, editables desde `/admin/billing`
(o una pestaña "Planes"):

```
platform/plans → {
  plans: {
    basic:        { name, priceUSD, priceNIO, annualUSD, maxUsers, maxPatients, modules: AppModule[], active },
    professional: { … },
    clinic:       { … },
  },
  updatedAt,
}
clinics/{id}/license/data → { planId: 'professional', limits: { maxUsers, maxPatients, modules } , … }
```

Reglas de juego:

- **El servidor decide el precio.** El cliente envía solo `planId` (como hoy con Recurrente); las
  funciones leen `platform/plans`. Esto reemplaza `recurrente.plans.ts` y `platform/billing.prices`
  como fuente de precio — habría que actualizar CLAUDE.md §18c.
- **Los límites se copian a la licencia al pagar** (`license.limits`), no se leen en vivo del catálogo:
  si subes el precio o bajas un límite, las clínicas conservan lo que pagaron hasta su próximo pago.
- **Solo el dueño escribe** `platform/plans` y `license/data` (ya es así para la licencia).
- La sesión de Dexie guarda `planId` y `limits`, así que todo §5 funciona sin internet.

## 7. Migración de clientes actuales

1. Todas las licencias `monthly` actuales pasan a `professional` con sus mismos límites → nadie pierde nada.
2. Las pruebas gratis prueban **Profesional** (es lo que se quiere vender); al vencer, la clínica elige plan.
3. Avisar con un aviso de cobro (`billingNotice`) no bloqueante el mes en que se publiquen los planes.

## 8. Decisiones tomadas (2026-10-30)

- [x] Precios iniciales **US$12 / 20 / 35** (editables en `/admin/plans`).
- [x] **Anual** desde el inicio: 2 meses gratis (US$120 / 200 / 350), 365 días de acceso.
- [x] Córdobas: **precio NIO fijo por plan**, escrito por el dueño (vacío = no se vende en C$).
- [x] Límite de usuarios **suave** (solo en la app) en la primera versión.
- [x] Básico sin: facturas, finanzas/egresos, promociones, importar/exportar (editable por plan).

Pendiente: el cobro con tarjeta (Recurrente) solo vende Profesional mensual; ampliarlo a los tres
planes cuando la tarjeta vuelva a estar activa.
