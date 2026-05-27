import { db } from '@/lib/db/database';
import type { PacienteLocal, DuenoLocal } from '@/types/paciente';
import type { ConsultaLocal } from '@/types/historial';
import type { CitaLocal } from '@/types/agenda';
import type { ProductoLocal, MovimientoStockLocal } from '@/types/inventario';
import type { PagoLocal } from '@/types/finanzas';

const CLINICA_ID = 'house-of-pets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }
function ts()   { return Date.now(); }

/** Timestamp Unix de hace N días */
function tsHace(dias: number): number {
  return Date.now() - dias * 86_400_000;
}

/** Retorna fecha "YYYY-MM-DD" relativa a hoy */
function fechaStr(diasOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + diasOffset);
  return d.toISOString().slice(0, 10);
}

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ─── Datos base ───────────────────────────────────────────────────────────────

const DUENOS_DATA = [
  { nombre: 'Carlos Martínez',    telefono: '8612-3401', email: 'carlos.m@gmail.com',   direccion: 'Colonia Centroamérica, Managua' },
  { nombre: 'Ana Sofía Ríos',     telefono: '8732-1190', email: 'anasofia.r@gmail.com', direccion: 'Reparto Schick, Managua' },
  { nombre: 'José Luis Herrera',  telefono: '8500-4412', email: 'joseluis.h@yahoo.com', direccion: 'Altamira D\'Este, Managua' },
  { nombre: 'María Elena Solís',  telefono: '8901-2234', email: 'maria.s@hotmail.com',  direccion: 'Linda Vista, Managua' },
  { nombre: 'Roberto Castillo',   telefono: '8345-6678', email: undefined,              direccion: 'Bolonia, Managua' },
  { nombre: 'Yessenia Aguirre',   telefono: '8223-9901', email: 'yessenia.a@gmail.com', direccion: 'Los Robles, Managua' },
  { nombre: 'Diego Obando',       telefono: '8766-3312', email: undefined,              direccion: 'Bello Horizonte, Managua' },
  { nombre: 'Karla Mendoza',      telefono: '8456-7890', email: 'karla.m@gmail.com',    direccion: 'Villa Fontana, Managua' },
] as const;

const PACIENTES_DATA = [
  { nombre: 'Rocky',    especie: 'perro' as const, raza: 'Labrador Retriever',  sexo: 'macho'  as const, color: 'Amarillo',     peso: 28,   duenoIdx: 0 },
  { nombre: 'Luna',     especie: 'perro' as const, raza: 'Pastor Alemán',       sexo: 'hembra' as const, color: 'Negro y café', peso: 22,   duenoIdx: 0 },
  { nombre: 'Michi',    especie: 'gato'  as const, raza: 'Doméstico',           sexo: 'hembra' as const, color: 'Atigrado',     peso: 3.5,  duenoIdx: 1 },
  { nombre: 'Thor',     especie: 'perro' as const, raza: 'Rottweiler',          sexo: 'macho'  as const, color: 'Negro y café', peso: 42,   duenoIdx: 2 },
  { nombre: 'Canela',   especie: 'perro' as const, raza: 'Cocker Spaniel',      sexo: 'hembra' as const, color: 'Café',         peso: 9,    duenoIdx: 3 },
  { nombre: 'Whiskers', especie: 'gato'  as const, raza: 'Siamés',             sexo: 'macho'  as const, color: 'Crema y café', peso: 4.2,  duenoIdx: 3 },
  { nombre: 'Max',      especie: 'perro' as const, raza: 'Bulldog Francés',     sexo: 'macho'  as const, color: 'Atigrado',     peso: 11,   duenoIdx: 4 },
  { nombre: 'Nala',     especie: 'perro' as const, raza: 'Labrador Retriever',  sexo: 'hembra' as const, color: 'Negro',        peso: 25,   duenoIdx: 5 },
  { nombre: 'Simba',    especie: 'gato'  as const, raza: 'Persa',              sexo: 'macho'  as const, color: 'Blanco',       peso: 5,    duenoIdx: 5 },
  { nombre: 'Buddy',    especie: 'perro' as const, raza: 'Golden Retriever',   sexo: 'macho'  as const, color: 'Dorado',       peso: 30,   duenoIdx: 6 },
  { nombre: 'Pistacho', especie: 'ave'   as const, raza: 'Periquito',          sexo: 'macho'  as const, color: 'Verde y azul', peso: 0.04, duenoIdx: 7 },
  { nombre: 'Kira',     especie: 'perro' as const, raza: 'Husky Siberiano',    sexo: 'hembra' as const, color: 'Gris y blanco',peso: 20,   duenoIdx: 7 },
];

const VACUNAS = ['Antirrábica', 'Parvovirus + Distemper', 'Bordetella', 'Triple felina', 'Leucemia felina', 'Leptospirosis'] as const;

const PRODUCTOS_DATA = [
  { nombre: 'Amoxicilina 500mg',         categoria: 'medicamento'     as const, stock: 45,  min: 10, unidad: 'tableta' as const, pv: 15,   pc: 8   },
  { nombre: 'Ivermectina 1%',            categoria: 'antiparasitario' as const, stock: 20,  min: 5,  unidad: 'frasco'  as const, pv: 180,  pc: 95  },
  { nombre: 'Meloxicam 1.5mg/mL',        categoria: 'medicamento'     as const, stock: 12,  min: 5,  unidad: 'frasco'  as const, pv: 250,  pc: 140 },
  { nombre: 'Vacuna Antirrábica',        categoria: 'vacuna'          as const, stock: 30,  min: 10, unidad: 'ampolla' as const, pv: 120,  pc: 60  },
  { nombre: 'Vacuna DHPP',               categoria: 'vacuna'          as const, stock: 25,  min: 10, unidad: 'ampolla' as const, pv: 150,  pc: 80  },
  { nombre: 'Shampoo Medicado Perros',   categoria: 'higiene'         as const, stock: 8,   min: 5,  unidad: 'frasco'  as const, pv: 220,  pc: 110 },
  { nombre: 'Royal Canin Mini Adult 3kg',categoria: 'alimento'        as const, stock: 15,  min: 5,  unidad: 'kg'      as const, pv: 450,  pc: 320 },
  { nombre: 'Whiskas Gatos 1kg',         categoria: 'alimento'        as const, stock: 20,  min: 5,  unidad: 'kg'      as const, pv: 280,  pc: 180 },
  { nombre: 'Dexametasona 4mg/mL',       categoria: 'medicamento'     as const, stock: 3,   min: 5,  unidad: 'frasco'  as const, pv: 320,  pc: 200 },
  { nombre: 'Collar Antipulgas Seresto', categoria: 'accesorio'       as const, stock: 10,  min: 3,  unidad: 'unidad'  as const, pv: 650,  pc: 400 },
  { nombre: 'Jeringa 3mL',              categoria: 'cirugia'         as const, stock: 200, min: 50, unidad: 'unidad'  as const, pv: 8,    pc: 3   },
  { nombre: 'Guantes de látex (caja)',   categoria: 'cirugia'         as const, stock: 4,   min: 5,  unidad: 'caja'    as const, pv: 180,  pc: 100 },
  { nombre: 'Suero Ringer Lactato',      categoria: 'medicamento'     as const, stock: 18,  min: 6,  unidad: 'frasco'  as const, pv: 95,   pc: 55  },
  { nombre: 'Frontline Spray',           categoria: 'antiparasitario' as const, stock: 7,   min: 5,  unidad: 'frasco'  as const, pv: 480,  pc: 280 },
  { nombre: 'Kit de sutura',             categoria: 'cirugia'         as const, stock: 12,  min: 4,  unidad: 'unidad'  as const, pv: 120,  pc: 65  },
  { nombre: 'Enrofloxacino 50mg/mL',     categoria: 'medicamento'     as const, stock: 9,   min: 5,  unidad: 'frasco'  as const, pv: 210,  pc: 120 },
  { nombre: 'Papel térmico impresora',   categoria: 'otro'            as const, stock: 2,   min: 3,  unidad: 'unidad'  as const, pv: 80,   pc: 50  },
  { nombre: 'Arena para gatos 5kg',      categoria: 'higiene'         as const, stock: 11,  min: 4,  unidad: 'kg'      as const, pv: 160,  pc: 90  },
];

const TIPOS_CONSULTA_SEED  = ['consulta_general', 'vacunacion', 'cirugia', 'control', 'desparasitacion', 'emergencia'] as const;
const TIPOS_CITA_SEED      = ['consulta', 'vacunacion', 'control', 'desparasitacion', 'cirugia', 'estetica']   as const;
const ESTADOS_PASADOS_SEED = ['completada', 'no_asistio', 'cancelada'] as const;
const TIPOS_PAGO_SEED      = ['consulta', 'vacunacion', 'cirugia', 'producto', 'estetica', 'otro']             as const;
const METODOS_SEED         = ['efectivo', 'tarjeta', 'transferencia']                                          as const;
const ESTADOS_PAGO_SEED    = ['pagado', 'pagado', 'pagado', 'pendiente']                                       as const;

const MOTIVOS_CONSULTA = [
  'Revisión de rutina', 'Vacunación anual', 'Vómitos y diarrea', 'Herida en la pata',
  'Control post-operatorio', 'Desparasitación interna', 'Revisión dental',
  'Revisión de piel', 'Pérdida de apetito', 'Revisión ocular',
] as const;

const MONTOS_POR_TIPO: Record<string, number[]> = {
  consulta:   [350, 400, 450, 500],
  vacunacion: [150, 180, 200, 220],
  cirugia:    [1200, 1500, 2000, 2500, 3000],
  producto:   [100, 150, 200, 280, 320],
  estetica:   [300, 350, 400],
  otro:       [100, 150, 200],
};

const CONCEPTOS_POR_TIPO: Record<string, string[]> = {
  consulta:   ['Consulta general', 'Consulta de urgencia', 'Revisión dermatológica', 'Revisión dental'],
  vacunacion: ['Vacuna antirrábica', 'Vacuna DHPP', 'Vacuna triple felina', 'Vacuna bordetella'],
  cirugia:    ['Castración', 'Esterilización', 'Extracción dental', 'Limpieza dental profunda'],
  producto:   ['Alimento Royal Canin', 'Ivermectina', 'Shampoo medicado', 'Collar antipulgas'],
  estetica:   ['Baño y corte', 'Corte de uñas', 'Limpieza de oídos'],
  otro:       ['Examen de laboratorio', 'Radiografía', 'Servicio varios'],
};

// ─── Función principal ────────────────────────────────────────────────────────

export async function sembrarDatos(): Promise<{ mensaje: string; conteos: Record<string, number> }> {
  const ahora = ts();

  // Dueños
  const duenos: DuenoLocal[] = DUENOS_DATA.map((d) => ({
    id:         uuid(),
    nombre:     d.nombre,
    telefono:   d.telefono,
    email:      d.email,
    direccion:  d.direccion,
    clinicaId:  CLINICA_ID,
    syncStatus: 'pending' as const,
    updatedAt:  ahora,
    creadoEn:   ahora,
  }));

  // Pacientes
  const pacientes: PacienteLocal[] = PACIENTES_DATA.map((p) => ({
    id:              uuid(),
    nombre:          p.nombre,
    especie:         p.especie,
    raza:            p.raza,
    sexo:            p.sexo,
    color:           p.color,
    peso:            p.peso,
    duenoId:         duenos[p.duenoIdx].id,
    clinicaId:       CLINICA_ID,
    activo:          true,
    fechaNacimiento: fechaStr(-randInt(365, 365 * 8)),
    syncStatus:      'pending' as const,
    updatedAt:       ahora,
    creadoEn:        ahora,
  }));

  // Consultas (2–4 por paciente, fechas en el pasado como timestamp)
  const consultas: ConsultaLocal[] = [];
  for (const pac of pacientes) {
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) {
      const diasAtras = randInt(7, 180);
      const tipo      = rand(TIPOS_CONSULTA_SEED);
      consultas.push({
        id:            uuid(),
        pacienteId:    pac.id,
        clinicaId:     CLINICA_ID,
        fecha:         tsHace(diasAtras),
        tipo,
        motivo:        rand(MOTIVOS_CONSULTA),
        diagnostico:   tipo === 'vacunacion'
          ? `Vacuna ${rand(VACUNAS)} aplicada sin incidentes.`
          : 'Examen físico general dentro de parámetros normales. Se recomienda seguimiento.',
        tratamiento:   tipo === 'vacunacion'
          ? 'Vacuna aplicada vía subcutánea. Próxima dosis en 12 meses.'
          : 'Medicación indicada por 7 días. Control en 2 semanas.',
        pesoConsulta:  pac.peso,
        temperatura:   parseFloat((38 + Math.random() * 1.2).toFixed(1)),
        veterinario:   'Dra. Patricia Vega',
        syncStatus:    'pending' as const,
        updatedAt:     ahora,
        creadoEn:      ahora,
      });
    }
  }

  // Citas
  const citas: CitaLocal[] = [];

  // Pasadas (últimos 14 días)
  for (let i = 0; i < 8; i++) {
    const pac = rand(pacientes);
    citas.push({
      id:              uuid(),
      pacienteId:      pac.id,
      duenoId:         pac.duenoId,
      clinicaId:       CLINICA_ID,
      fecha:           fechaStr(-randInt(1, 14)),
      horaInicio:      `${String(randInt(8, 16)).padStart(2, '0')}:00`,
      duracionMinutos: rand([30, 45, 60] as const),
      tipo:            rand(TIPOS_CITA_SEED),
      estado:          rand(ESTADOS_PASADOS_SEED),
      motivo:          rand(MOTIVOS_CONSULTA),
      veterinario:     'Dra. Patricia Vega',
      syncStatus:      'pending' as const,
      updatedAt:       ahora,
      creadoEn:        ahora,
    });
  }

  // Hoy (4–5 citas)
  const horasHoy = [8, 9, 10, 11, 14, 15] as const;
  const pacsCitasHoy = [...pacientes].sort(() => Math.random() - 0.5).slice(0, 5);
  pacsCitasHoy.forEach((pac, i) => {
    citas.push({
      id:              uuid(),
      pacienteId:      pac.id,
      duenoId:         pac.duenoId,
      clinicaId:       CLINICA_ID,
      fecha:           fechaStr(0),
      horaInicio:      `${String(horasHoy[i] ?? 9).padStart(2, '0')}:00`,
      duracionMinutos: rand([30, 45, 60] as const),
      tipo:            rand(TIPOS_CITA_SEED),
      estado:          i === 0 ? 'en_curso' : 'confirmada',
      motivo:          rand(MOTIVOS_CONSULTA),
      veterinario:     'Dra. Patricia Vega',
      syncStatus:      'pending' as const,
      updatedAt:       ahora,
      creadoEn:        ahora,
    });
  });

  // Futuras (próximos 7 días)
  for (let i = 0; i < 6; i++) {
    const pac = rand(pacientes);
    citas.push({
      id:              uuid(),
      pacienteId:      pac.id,
      duenoId:         pac.duenoId,
      clinicaId:       CLINICA_ID,
      fecha:           fechaStr(randInt(1, 7)),
      horaInicio:      `${String(randInt(8, 16)).padStart(2, '0')}:00`,
      duracionMinutos: rand([30, 45, 60] as const),
      tipo:            rand(TIPOS_CITA_SEED),
      estado:          'pendiente',
      motivo:          rand(MOTIVOS_CONSULTA),
      veterinario:     'Dra. Patricia Vega',
      syncStatus:      'pending' as const,
      updatedAt:       ahora,
      creadoEn:        ahora,
    });
  }

  // Productos + movimientos iniciales
  const productos: ProductoLocal[] = [];
  const movimientos: MovimientoStockLocal[] = [];

  for (const p of PRODUCTOS_DATA) {
    const prodId = uuid();
    productos.push({
      id:          prodId,
      nombre:      p.nombre,
      categoria:   p.categoria,
      stockActual: p.stock,
      stockMinimo: p.min,
      unidad:      p.unidad,
      precioVenta: p.pv,
      precioCosto: p.pc,
      activo:      true,
      clinicaId:   CLINICA_ID,
      syncStatus:  'pending' as const,
      updatedAt:   ahora,
      creadoEn:    ahora,
    });

    if (p.stock > 0) {
      movimientos.push({
        id:           uuid(),
        productoId:   prodId,
        clinicaId:    CLINICA_ID,
        tipo:         'entrada',
        cantidad:     p.stock,
        stockAntes:   0,
        stockDespues: p.stock,
        motivo:       'Stock inicial — Seed',
        syncStatus:   'pending' as const,
        updatedAt:    ahora,
        creadoEn:     ahora,
      });
    }
  }

  // Pagos del mes (30 registros)
  const pagos: PagoLocal[] = [];
  const diasEnMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  for (let i = 0; i < 30; i++) {
    const pac  = rand(pacientes);
    const tipo = rand(TIPOS_PAGO_SEED);
    pagos.push({
      id:         uuid(),
      pacienteId: pac.id,
      clinicaId:  CLINICA_ID,
      fecha:      fechaStr(-randInt(0, Math.min(diasEnMes - 1, 27))),
      concepto:   rand(CONCEPTOS_POR_TIPO[tipo]),
      tipo,
      monto:      rand(MONTOS_POR_TIPO[tipo]),
      metodoPago: rand(METODOS_SEED),
      estado:     rand(ESTADOS_PAGO_SEED),
      syncStatus: 'pending' as const,
      updatedAt:  ahora,
      creadoEn:   ahora,
    });
  }

  // ── Escribir todo en Dexie ────────────────────────────────────────────────
  await db.transaction('rw',
    [db.duenos, db.pacientes, db.consultas, db.citas, db.productos, db.movimientos, db.pagos],
    async () => {
      await db.duenos.bulkAdd(duenos);
      await db.pacientes.bulkAdd(pacientes);
      await db.consultas.bulkAdd(consultas);
      await db.citas.bulkAdd(citas);
      await db.productos.bulkAdd(productos);
      await db.movimientos.bulkAdd(movimientos);
      await db.pagos.bulkAdd(pagos);
    }
  );

  return {
    mensaje: '¡Datos sembrados correctamente!',
    conteos: {
      dueños:      duenos.length,
      pacientes:   pacientes.length,
      consultas:   consultas.length,
      citas:       citas.length,
      productos:   productos.length,
      movimientos: movimientos.length,
      pagos:       pagos.length,
    },
  };
}

export async function limpiarDatos(): Promise<void> {
  await db.transaction('rw',
    [db.duenos, db.pacientes, db.consultas, db.citas, db.productos, db.movimientos, db.pagos, db.syncQueue],
    async () => {
      await Promise.all([
        db.duenos.clear(),
        db.pacientes.clear(),
        db.consultas.clear(),
        db.citas.clear(),
        db.productos.clear(),
        db.movimientos.clear(),
        db.pagos.clear(),
        db.syncQueue.clear(),
      ]);
    }
  );
}
