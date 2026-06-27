import { getAuth, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase/firebase.config';
import { db } from '@/lib/db/database';
import type { SessionLocal } from '@/types/licencia';
import type { PacienteLocal, DuenoLocal } from '@/types/paciente';
import type { ConsultaLocal, ConsultaItem } from '@/types/consulta';
import type { CitaLocal } from '@/types/agenda';
import type { ProductoLocal, MovimientoStockLocal } from '@/types/inventario';
import type { PagoLocal } from '@/types/finanzas';
import type { FacturaLocal, FacturaItem } from '@/types/factura';
import type { ServicioLocal } from '@/types/servicio';

const DEMO_CLINIC_ID = 'demo';

function uuid() { return crypto.randomUUID(); }
function ts()   { return Date.now(); }
function fecha(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
function tsOffset(offsetDias: number) {
  return Date.now() + offsetDias * 86_400_000;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export async function setupDemo(): Promise<void> {
  const ahora = ts();

  const session: SessionLocal = {
    id:             'singleton',
    uid:            'demo-user',
    email:          'demo@vetsystem.app',
    clinicId:       DEMO_CLINIC_ID,
    clinicName:     'Clínica Veterinaria Demo',
    userName:       'Dr. Demo',
    role:           'admin',
    permisos:       null,
    plan:           'Demo',
    expirationDate: '2099-12-31',
    subscription:   true,
    lastSync:       ahora,
    cachedAt:       ahora,
    isDemo:         true,
  };

  // Write demo session BEFORE signing out so the auth listener
  // finds isDemo=true when it fires with user=null, and preserves it.
  await db.session.put(session);

  // If a real Firebase user is signed in, sign them out silently.
  // This prevents intentarRefrescar from overwriting the demo session
  // with real Firestore data after we return.
  const auth = getAuth(getFirebaseApp());
  if (auth.currentUser) {
    await firebaseSignOut(auth);
  }

  const existing = await db.patients.where('clinicaId').equals(DEMO_CLINIC_ID).count();
  if (existing > 0) return;

  await _seedDemoData();
}

export async function clearDemo(): Promise<void> {
  await db.session.delete('singleton');
  await db.transaction('rw', [
    db.patients, db.owners, db.consultations, db.appointments,
    db.products, db.movements, db.payments, db.invoices, db.services, db.sales,
  ], async () => {
    await Promise.all([
      db.patients.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.owners.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.consultations.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.appointments.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.products.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.movements.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.payments.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.invoices.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.services.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
      db.sales.where('clinicaId').equals(DEMO_CLINIC_ID).delete(),
    ]);
  });
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function _seedDemoData() {
  const ahora = ts();
  const c = DEMO_CLINIC_ID;

  // ── Dueños ──────────────────────────────────────────────────────────────────
  const duenosData = [
    { nombre: 'María González',   telefono: '8891-2341', email: 'maria@demo.com'   },
    { nombre: 'José Martínez',    telefono: '7723-4512', email: 'jose@demo.com'    },
    { nombre: 'Ana López',        telefono: '8834-6723', email: 'ana@demo.com'     },
    { nombre: 'Carlos Ibarra',    telefono: '8812-3344', email: 'carlos@demo.com'  },
    { nombre: 'Sofía Morales',    telefono: '7790-1122', email: 'sofia@demo.com'   },
    { nombre: 'Diego Hernández',  telefono: '8856-7890', email: 'diego@demo.com'   },
    { nombre: 'Laura Pérez',      telefono: '8823-4561', email: 'laura@demo.com'   },
    { nombre: 'Roberto Jiménez',  telefono: '7745-8901', email: 'roberto@demo.com' },
  ];

  const duenos: DuenoLocal[] = duenosData.map(d => ({
    id:         uuid(),
    clinicaId:  c,
    nombre:     d.nombre,
    telefono:   d.telefono,
    email:      d.email,
    syncStatus: 'pending' as const,
    updatedAt:  ahora,
    creadoEn:   ahora,
  }));

  // ── Pacientes ────────────────────────────────────────────────────────────────
  const pacientesData = [
    { nombre: 'Luna',     especie: 'perro' as const, raza: 'Golden Retriever', sexo: 'hembra' as const, anios: 3, dueno: 0 },
    { nombre: 'Mochi',    especie: 'gato'  as const, raza: 'Persa',            sexo: 'macho'  as const, anios: 2, dueno: 1 },
    { nombre: 'Rex',      especie: 'perro' as const, raza: 'Pastor Alemán',    sexo: 'macho'  as const, anios: 5, dueno: 2 },
    { nombre: 'Canela',   especie: 'perro' as const, raza: 'Shih Tzu',         sexo: 'hembra' as const, anios: 1, dueno: 3 },
    { nombre: 'Simba',    especie: 'gato'  as const, raza: 'Maine Coon',       sexo: 'macho'  as const, anios: 4, dueno: 4 },
    { nombre: 'Princesa', especie: 'perro' as const, raza: 'Chihuahua',        sexo: 'hembra' as const, anios: 7, dueno: 5 },
    { nombre: 'Thor',     especie: 'perro' as const, raza: 'Labrador',         sexo: 'macho'  as const, anios: 2, dueno: 6 },
    { nombre: 'Pelusa',   especie: 'gato'  as const, raza: 'Angora',           sexo: 'hembra' as const, anios: 3, dueno: 7 },
    { nombre: 'Kira',     especie: 'perro' as const, raza: 'Border Collie',    sexo: 'hembra' as const, anios: 6, dueno: 0 },
    { nombre: 'Manchas',  especie: 'gato'  as const, raza: 'Mestizo',          sexo: 'macho'  as const, anios: 8, dueno: 2 },
  ];

  const pacientes: PacienteLocal[] = pacientesData.map(p => {
    const nacimiento = new Date();
    nacimiento.setFullYear(nacimiento.getFullYear() - p.anios);
    return {
      id:              uuid(),
      clinicaId:       c,
      duenoId:         duenos[p.dueno].id,
      nombre:          p.nombre,
      especie:         p.especie,
      raza:            p.raza,
      sexo:            p.sexo,
      fechaNacimiento: nacimiento.toISOString().slice(0, 10),
      activo:          true,
      syncStatus:      'pending' as const,
      updatedAt:       ahora,
      creadoEn:        ahora,
    };
  });

  // ── Servicios ────────────────────────────────────────────────────────────────
  const serviciosData: { nombre: string; categoria: ServicioLocal['categoria']; precio: number }[] = [
    { nombre: 'Consulta general',       categoria: 'consulta',        precio: 350  },
    { nombre: 'Consulta de emergencia', categoria: 'emergencia',      precio: 600  },
    { nombre: 'Vacuna antirrábica',     categoria: 'vacunacion',      precio: 280  },
    { nombre: 'Vacuna múltiple',        categoria: 'vacunacion',      precio: 450  },
    { nombre: 'Desparasitación',        categoria: 'desparasitacion', precio: 150  },
    { nombre: 'Baño y corte',           categoria: 'estetica',        precio: 450  },
    { nombre: 'Radiografía',            categoria: 'laboratorio',     precio: 800  },
    { nombre: 'Cirugía menor',          categoria: 'cirugia',         precio: 2500 },
  ];

  const servicios: ServicioLocal[] = serviciosData.map(s => ({
    id:          uuid(),
    clinicaId:   c,
    nombre:      s.nombre,
    categoria:   s.categoria,
    precio:      s.precio,
    activo:      true,
    syncStatus:  'pending' as const,
    updatedAt:   ahora,
    creadoEn:    ahora,
  }));

  // ── Productos ────────────────────────────────────────────────────────────────
  const productosData: {
    nombre: string;
    categoria: ProductoLocal['categoria'];
    precio: number;
    stock: number;
    min: number;
  }[] = [
    { nombre: 'Vacuna Antirrábica',    categoria: 'vacuna',          precio: 180, stock: 24, min: 10 },
    { nombre: 'Frontline Plus',         categoria: 'antiparasitario', precio: 220, stock: 18, min: 5  },
    { nombre: 'Amoxicilina 500mg',      categoria: 'medicamento',     precio: 45,  stock: 60, min: 20 },
    { nombre: 'Meloxicam 1.5mg/ml',     categoria: 'medicamento',     precio: 85,  stock: 30, min: 10 },
    { nombre: 'Jeringa 5ml',            categoria: 'otro',            precio: 8,   stock: 4,  min: 20 },
    { nombre: 'Sutura absorbible 3-0',  categoria: 'cirugia',         precio: 95,  stock: 12, min: 5  },
    { nombre: 'Guantes Látex M',        categoria: 'otro',            precio: 12,  stock: 2,  min: 10 },
    { nombre: 'Vitamina B12',           categoria: 'medicamento',     precio: 35,  stock: 45, min: 15 },
    { nombre: 'Suero fisiológico',      categoria: 'otro',            precio: 25,  stock: 30, min: 10 },
    { nombre: 'Ivermectina 1%',         categoria: 'antiparasitario', precio: 55,  stock: 22, min: 8  },
  ];

  const productos: ProductoLocal[] = productosData.map(p => ({
    id:           uuid(),
    clinicaId:    c,
    nombre:       p.nombre,
    categoria:    p.categoria,
    unidad:       'unidad' as const,
    precioVenta:  p.precio,
    stockActual:  p.stock,
    stockMinimo:  p.min,
    activo:       true,
    syncStatus:   'pending' as const,
    updatedAt:    ahora,
    creadoEn:     ahora,
  }));

  // ── Movimientos de stock ─────────────────────────────────────────────────────
  const movimientos: MovimientoStockLocal[] = productos.map(p => ({
    id:           uuid(),
    clinicaId:    c,
    productoId:   p.id,
    tipo:         'entrada' as const,
    cantidad:     p.stockActual,
    stockAntes:   0,
    stockDespues: p.stockActual,
    motivo:       'Stock inicial demo',
    creadoEn:     ahora,
    syncStatus:   'pending' as const,
    updatedAt:    ahora,
  }));

  // ── Citas ────────────────────────────────────────────────────────────────────
  const citasData: {
    pac: number;
    hora: string;
    tipo: CitaLocal['tipo'];
    estado: CitaLocal['estado'];
    offset: number;
  }[] = [
    { pac: 0, hora: '09:00', tipo: 'consulta',        estado: 'confirmada', offset: 0  },
    { pac: 2, hora: '10:30', tipo: 'vacunacion',      estado: 'confirmada', offset: 0  },
    { pac: 4, hora: '11:00', tipo: 'control',         estado: 'pendiente',  offset: 0  },
    { pac: 6, hora: '14:00', tipo: 'consulta',        estado: 'pendiente',  offset: 0  },
    { pac: 1, hora: '09:30', tipo: 'vacunacion',      estado: 'confirmada', offset: 1  },
    { pac: 7, hora: '10:00', tipo: 'control',         estado: 'pendiente',  offset: 2  },
  ];

  const citas: CitaLocal[] = citasData.map(cit => ({
    id:               uuid(),
    clinicaId:        c,
    pacienteId:       pacientes[cit.pac].id,
    duenoId:          pacientes[cit.pac].duenoId,
    fecha:            fecha(cit.offset),
    horaInicio:       cit.hora,
    duracionMinutos:  30,
    tipo:             cit.tipo,
    estado:           cit.estado,
    motivo:           `Cita de ${cit.tipo}`,
    syncStatus:       'pending' as const,
    updatedAt:        ahora,
    creadoEn:         ahora,
  }));

  // ── Consultas ────────────────────────────────────────────────────────────────
  const consultasRaw: {
    pac: number;
    dias: number;
    motivo: string;
    tipo: ConsultaLocal['tipo'];
    svc: number;
    prod: number;
  }[] = [
    { pac: 0, dias: -5,  motivo: 'Revisión anual',         tipo: 'consulta_general', svc: 0, prod: 4 },
    { pac: 2, dias: -10, motivo: 'Vacunación antirrábica',  tipo: 'vacunacion',       svc: 2, prod: 0 },
    { pac: 3, dias: -2,  motivo: 'Vómitos y fiebre',        tipo: 'emergencia',       svc: 1, prod: 2 },
    { pac: 5, dias: -15, motivo: 'Control de peso',         tipo: 'control',          svc: 0, prod: 7 },
    { pac: 8, dias: -1,  motivo: 'Desparasitación rutina',  tipo: 'desparasitacion',  svc: 4, prod: 9 },
  ];

  const consultas: ConsultaLocal[] = [];
  const pagos: PagoLocal[] = [];
  const facturas: FacturaLocal[] = [];

  let facturaNum = 1;

  for (const cr of consultasRaw) {
    const pac  = pacientes[cr.pac];
    const svc  = servicios[cr.svc];
    const prod = productos[cr.prod];

    const items: ConsultaItem[] = [
      {
        id:             uuid(),
        descripcion:    svc.nombre,
        cantidad:       1,
        precioUnitario: svc.precio,
        subtotal:       svc.precio,
        esServicio:     true,
      },
      {
        id:             uuid(),
        descripcion:    prod.nombre,
        cantidad:       1,
        precioUnitario: prod.precioVenta ?? 0,
        subtotal:       prod.precioVenta ?? 0,
        esServicio:     false,
        productoId:     prod.id,
      },
    ];

    const subtotal    = items.reduce((s, i) => s + i.subtotal, 0);
    const consultaId  = uuid();
    const facturaId   = uuid();
    const pagoId      = uuid();
    const fechaStr    = fecha(cr.dias);
    const fechaTs     = tsOffset(cr.dias);
    const esPagada    = cr.dias < -3;
    const estadoC     = esPagada ? 'completada' as const : 'en_proceso' as const;

    const consulta: ConsultaLocal = {
      id:          consultaId,
      clinicaId:   c,
      pacienteId:  pac.id,
      duenoId:     pac.duenoId,
      fecha:       fechaTs,
      tipo:        cr.tipo,
      motivo:      cr.motivo,
      items,
      subtotal,
      descuento:   0,
      total:       subtotal,
      estado:      estadoC,
      facturaId,
      pagoId,
      syncStatus:  'pending' as const,
      updatedAt:   ahora,
      creadoEn:    ahora,
    };

    const facturaItems: FacturaItem[] = items.map(i => ({
      id:             i.id,
      descripcion:    i.descripcion,
      cantidad:       i.cantidad,
      precioUnitario: i.precioUnitario,
      subtotal:       i.subtotal,
      tipo:           i.esServicio ? 'servicio' as const : 'producto' as const,
      productoId:     i.productoId,
    }));

    const factura: FacturaLocal = {
      id:           facturaId,
      clinicaId:    c,
      numero:       `FAC-2026-${String(facturaNum++).padStart(4, '0')}`,
      consultaId,
      pacienteId:   pac.id,
      duenoId:      pac.duenoId,
      fecha:        fechaStr,
      items:        facturaItems,
      subtotal,
      descuento:    0,
      total:        subtotal,
      metodoPago:   'efectivo',
      estado:       esPagada ? 'pagada' : 'pendiente',
      montoPagado:  esPagada ? subtotal : 0,
      pagoId,
      syncStatus:   'pending' as const,
      updatedAt:    ahora,
      creadoEn:     ahora,
    };

    const pago: PagoLocal = {
      id:          pagoId,
      clinicaId:   c,
      pacienteId:  pac.id,
      consultaId,
      fecha:       fechaStr,
      concepto:    `${factura.numero} — ${cr.motivo}`,
      tipo:        'consulta',
      monto:       subtotal,
      metodoPago:  'efectivo',
      estado:      esPagada ? 'pagado' : 'pendiente',
      syncStatus:  'pending' as const,
      updatedAt:   ahora,
      creadoEn:    ahora,
    };

    consultas.push(consulta);
    facturas.push(factura);
    pagos.push(pago);
  }

  // ── Escribir todo ────────────────────────────────────────────────────────────
  await db.transaction('rw', [
    db.owners, db.patients, db.services, db.products, db.movements,
    db.appointments, db.consultations, db.payments, db.invoices,
  ], async () => {
    await db.owners.bulkAdd(duenos);
    await db.patients.bulkAdd(pacientes);
    await db.services.bulkAdd(servicios);
    await db.products.bulkAdd(productos);
    await db.movements.bulkAdd(movimientos);
    await db.appointments.bulkAdd(citas);
    await db.consultations.bulkAdd(consultas);
    await db.payments.bulkAdd(pagos);
    await db.invoices.bulkAdd(facturas);
  });
}
