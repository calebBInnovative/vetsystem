import { db } from '@/lib/db/database';
import type { PatientLocal, OwnerLocal } from '@/types/patient';
import type { ConsultationLocal, ConsultationItem } from '@/types/consultation';
import type { AppointmentLocal } from '@/types/appointment';
import type { ProductLocal, StockMovementLocal } from '@/types/inventory';
import type { PaymentLocal } from '@/types/finances';
import type { InvoiceLocal, InvoiceItem } from '@/types/invoice';
import type { ServiceLocal } from '@/types/service';
import type { SaleLocal, SaleItem } from '@/types/sale';
import type { FixedExpense, ExpensePayment } from '@/types/expense';
import type { Collaborator, CollaboratorPayment } from '@/types/collaborator';
import type { PromotionLocal, PromotionItem } from '@/types/promotion';
import { applyDiscount } from '@/types/promotion';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }
function ts()   { return Date.now(); }

function tsAgo(days: number): number {
  return Date.now() - days * 86_400_000;
}

function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function dateStrFromTs(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ─── Base data ────────────────────────────────────────────────────────────────

const OWNERS_DATA = [
  { name: 'Carlos Martínez',    phone: '8612-3401', email: 'carlos.m@gmail.com',   address: 'Colonia Centroamérica, Managua' },
  { name: 'Ana Sofía Ríos',     phone: '8732-1190', email: 'anasofia.r@gmail.com', address: 'Reparto Schick, Managua' },
  { name: 'José Luis Herrera',  phone: '8500-4412', email: 'joseluis.h@yahoo.com', address: "Altamira D'Este, Managua" },
  { name: 'María Elena Solís',  phone: '8901-2234', email: 'maria.s@hotmail.com',  address: 'Linda Vista, Managua' },
  { name: 'Roberto Castillo',   phone: '8345-6678', email: undefined,              address: 'Bolonia, Managua' },
  { name: 'Yessenia Aguirre',   phone: '8223-9901', email: 'yessenia.a@gmail.com', address: 'Los Robles, Managua' },
  { name: 'Diego Obando',       phone: '8766-3312', email: undefined,              address: 'Bello Horizonte, Managua' },
  { name: 'Karla Mendoza',      phone: '8456-7890', email: 'karla.m@gmail.com',    address: 'Villa Fontana, Managua' },
] as const;

const PATIENTS_DATA = [
  { name: 'Rocky',    species: 'dog'  as const, breed: 'Labrador Retriever',  sex: 'male'   as const, color: 'Amarillo',      weight: 28,   ownerIdx: 0 },
  { name: 'Luna',     species: 'dog'  as const, breed: 'Pastor Alemán',       sex: 'female' as const, color: 'Negro y café',  weight: 22,   ownerIdx: 0 },
  { name: 'Michi',    species: 'cat'  as const, breed: 'Doméstico',           sex: 'female' as const, color: 'Atigrado',      weight: 3.5,  ownerIdx: 1 },
  { name: 'Thor',     species: 'dog'  as const, breed: 'Rottweiler',          sex: 'male'   as const, color: 'Negro y café',  weight: 42,   ownerIdx: 2 },
  { name: 'Canela',   species: 'dog'  as const, breed: 'Cocker Spaniel',      sex: 'female' as const, color: 'Café',          weight: 9,    ownerIdx: 3 },
  { name: 'Whiskers', species: 'cat'  as const, breed: 'Siamés',              sex: 'male'   as const, color: 'Crema y café',  weight: 4.2,  ownerIdx: 3 },
  { name: 'Max',      species: 'dog'  as const, breed: 'Bulldog Francés',     sex: 'male'   as const, color: 'Atigrado',      weight: 11,   ownerIdx: 4 },
  { name: 'Nala',     species: 'dog'  as const, breed: 'Labrador Retriever',  sex: 'female' as const, color: 'Negro',         weight: 25,   ownerIdx: 5 },
  { name: 'Simba',    species: 'cat'  as const, breed: 'Persa',               sex: 'male'   as const, color: 'Blanco',        weight: 5,    ownerIdx: 5 },
  { name: 'Buddy',    species: 'dog'  as const, breed: 'Golden Retriever',    sex: 'male'   as const, color: 'Dorado',        weight: 30,   ownerIdx: 6 },
  { name: 'Pistacho', species: 'bird' as const, breed: 'Periquito',           sex: 'male'   as const, color: 'Verde y azul',  weight: 0.04, ownerIdx: 7 },
  { name: 'Kira',     species: 'dog'  as const, breed: 'Husky Siberiano',     sex: 'female' as const, color: 'Gris y blanco', weight: 20,   ownerIdx: 7 },
];

const VACCINES = ['Antirrábica', 'Parvovirus + Distemper', 'Bordetella', 'Triple felina', 'Leucemia felina', 'Leptospirosis'] as const;

const PRODUCTS_DATA = [
  { name: 'Amoxicilina 500mg',         category: 'medication'    as const, stock: 45,  min: 10, unit: 'tablet'  as const, salePrice: 15,  costPrice: 8   },
  { name: 'Ivermectina 1%',            category: 'antiparasitic' as const, stock: 20,  min: 5,  unit: 'bottle'  as const, salePrice: 180, costPrice: 95  },
  { name: 'Meloxicam 1.5mg/mL',        category: 'medication'    as const, stock: 12,  min: 5,  unit: 'bottle'  as const, salePrice: 250, costPrice: 140 },
  { name: 'Vacuna Antirrábica',        category: 'vaccine'       as const, stock: 30,  min: 10, unit: 'ampoule' as const, salePrice: 120, costPrice: 60  },
  { name: 'Vacuna DHPP',               category: 'vaccine'       as const, stock: 25,  min: 10, unit: 'ampoule' as const, salePrice: 150, costPrice: 80  },
  { name: 'Shampoo Medicado Perros',   category: 'hygiene'       as const, stock: 8,   min: 5,  unit: 'bottle'  as const, salePrice: 220, costPrice: 110 },
  { name: 'Royal Canin Mini Adult 3kg',category: 'food'          as const, stock: 15,  min: 5,  unit: 'kg'      as const, salePrice: 450, costPrice: 320 },
  { name: 'Whiskas Gatos 1kg',         category: 'food'          as const, stock: 20,  min: 5,  unit: 'kg'      as const, salePrice: 280, costPrice: 180 },
  { name: 'Dexametasona 4mg/mL',       category: 'medication'    as const, stock: 3,   min: 5,  unit: 'bottle'  as const, salePrice: 320, costPrice: 200 },
  { name: 'Collar Antipulgas Seresto', category: 'accessory'     as const, stock: 10,  min: 3,  unit: 'unit'    as const, salePrice: 650, costPrice: 400 },
  { name: 'Jeringa 3mL',              category: 'surgery'       as const, stock: 200, min: 50, unit: 'unit'    as const, salePrice: 8,   costPrice: 3   },
  { name: 'Guantes de látex (caja)',   category: 'surgery'       as const, stock: 4,   min: 5,  unit: 'box'     as const, salePrice: 180, costPrice: 100 },
  { name: 'Suero Ringer Lactato',      category: 'medication'    as const, stock: 18,  min: 6,  unit: 'bottle'  as const, salePrice: 95,  costPrice: 55  },
  { name: 'Frontline Spray',           category: 'antiparasitic' as const, stock: 7,   min: 5,  unit: 'bottle'  as const, salePrice: 480, costPrice: 280 },
  { name: 'Kit de sutura',             category: 'surgery'       as const, stock: 12,  min: 4,  unit: 'unit'    as const, salePrice: 120, costPrice: 65  },
  { name: 'Enrofloxacino 50mg/mL',     category: 'medication'    as const, stock: 9,   min: 5,  unit: 'bottle'  as const, salePrice: 210, costPrice: 120 },
  { name: 'Papel térmico impresora',   category: 'other'         as const, stock: 2,   min: 3,  unit: 'unit'    as const, salePrice: 80,  costPrice: 50  },
  { name: 'Arena para gatos 5kg',      category: 'hygiene'       as const, stock: 11,  min: 4,  unit: 'kg'      as const, salePrice: 160, costPrice: 90  },
];

// Items per consultation type: [primary service + possible products]
const ITEMS_BY_TYPE: Record<string, { description: string; price: number; isService: boolean; prodName?: string }[]> = {
  general_consultation: [
    { description: 'Consultation General',      price: 400,  isService: true },
    { description: 'Amoxicilina 500mg',         price: 15,   isService: false, prodName: 'Amoxicilina 500mg' },
  ],
  checkup: [
    { description: 'Control Médico',            price: 300,  isService: true },
  ],
  vaccination: [
    { description: 'Aplicación de Vacuna',      price: 80,   isService: true },
    { description: 'Vacuna Antirrábica',        price: 120,  isService: false, prodName: 'Vacuna Antirrábica' },
  ],
  deworming: [
    { description: 'Desparasitación Interna',   price: 150,  isService: true },
    { description: 'Ivermectina 1%',            price: 180,  isService: false, prodName: 'Ivermectina 1%' },
  ],
  surgery: [
    { description: 'Procedimiento Quirúrgico',  price: 1800, isService: true },
    { description: 'Kit de sutura',             price: 120,  isService: false, prodName: 'Kit de sutura' },
    { description: 'Suero Ringer Lactato',      price: 95,   isService: false, prodName: 'Suero Ringer Lactato' },
  ],
  emergency: [
    { description: 'Atención de Emergencia',    price: 700,  isService: true },
    { description: 'Meloxicam 1.5mg/mL',        price: 250,  isService: false, prodName: 'Meloxicam 1.5mg/mL' },
  ],
  grooming: [
    { description: 'Baño y Corte',              price: 350,  isService: true },
  ],
  other: [
    { description: 'Atención Veterinaria',      price: 250,  isService: true },
  ],
};

const DEFAULT_SERVICES: Omit<ServiceLocal, 'id' | 'clinicId' | 'createdAt' | 'syncStatus' | 'updatedAt'>[] = [
  { name: 'Consultation General',        category: 'consultation', price: 400,  active: true },
  { name: 'Control Médico',             category: 'consultation', price: 300,  active: true },
  { name: 'Atención de Emergencia',     category: 'emergency',    price: 700,  active: true },
  { name: 'Aplicación de Vacuna',       category: 'vaccination',  price: 80,   active: true },
  { name: 'Desparasitación Interna',    category: 'deworming',    price: 150,  active: true },
  { name: 'Desparasitación Externa',    category: 'deworming',    price: 120,  active: true },
  { name: 'Castración Canino',          category: 'surgery',      price: 2000, active: true },
  { name: 'Esterilización Canino',      category: 'surgery',      price: 2500, active: true },
  { name: 'Castración Felino',          category: 'surgery',      price: 1500, active: true },
  { name: 'Esterilización Felino',      category: 'surgery',      price: 1800, active: true },
  { name: 'Limpieza Dental',            category: 'surgery',      price: 600,  active: true },
  { name: 'Baño y Corte',              category: 'grooming',     price: 350,  active: true },
  { name: 'Corte de Uñas',             category: 'grooming',     price: 100,  active: true },
  { name: 'Limpieza de Oídos',         category: 'grooming',     price: 120,  active: true },
  { name: 'Examen de Laboratorio',     category: 'laboratory',   price: 250,  active: true },
  { name: 'Radiografía Simple',        category: 'laboratory',   price: 400,  active: true },
  { name: 'Hospitalización (día)',     category: 'other',        price: 500,  active: true },
];

const CONSULTATION_TYPES_SEED  = ['general_consultation', 'vaccination', 'surgery', 'checkup', 'deworming', 'emergency'] as const;
const APPOINTMENT_TYPES_SEED   = ['consultation', 'vaccination', 'checkup', 'deworming', 'surgery', 'grooming'] as const;
const PAST_STATUSES_SEED       = ['completed', 'no_show', 'cancelled'] as const;
const PAYMENT_TYPES_SEED       = ['consultation', 'vaccination', 'surgery', 'product', 'grooming', 'other'] as const;
const PAYMENT_METHODS_SEED     = ['cash', 'card', 'transfer'] as const;
const PAYMENT_STATUSES_SEED    = ['paid', 'paid', 'paid', 'pending'] as const;
const INVOICE_METHODS_SEED     = ['cash', 'card', 'transfer', 'mixed'] as const;

const VISIT_REASONS = [
  'Revisión de rutina', 'Vacunación anual', 'Vómitos y diarrea', 'Herida en la pata',
  'Control post-operatorio', 'Desparasitación interna', 'Revisión dental',
  'Revisión de piel', 'Pérdida de apetito', 'Revisión ocular',
] as const;

const CONCEPTS_BY_TYPE: Record<string, string[]> = {
  consultation: ['Consultation general', 'Consultation de urgencia', 'Revisión dermatológica', 'Revisión dental'],
  vaccination:  ['Vacuna antirrábica', 'Vacuna DHPP', 'Vacuna triple felina', 'Vacuna bordetella'],
  surgery:      ['Castración', 'Esterilización', 'Extracción dental', 'Limpieza dental profunda'],
  product:      ['Alimento Royal Canin', 'Ivermectina', 'Shampoo medicado', 'Collar antipulgas'],
  grooming:     ['Baño y corte', 'Corte de uñas', 'Limpieza de oídos'],
  other:        ['Examen de laboratorio', 'Radiografía', 'Service varios'],
};

const AMOUNTS_BY_TYPE: Record<string, number[]> = {
  consultation: [350, 400, 450, 500],
  vaccination:  [150, 180, 200, 220],
  surgery:      [1200, 1500, 2000, 2500, 3000],
  product:      [100, 150, 200, 280, 320],
  grooming:     [300, 350, 400],
  other:        [100, 150, 200],
};

// ─── Main function ────────────────────────────────────────────────────────────

export async function sembrarDatos(clinicId: string): Promise<{ mensaje: string; conteos: Record<string, number> }> {
  const now      = ts();

  // Owners
  const owners: OwnerLocal[] = OWNERS_DATA.map((d) => ({
    id:         uuid(),
    name:       d.name,
    phone:      d.phone,
    email:      d.email,
    address:    d.address,
    clinicId,
    syncStatus: 'pending' as const,
    updatedAt:  now,
    createdAt:  now,
  }));

  // Patients
  const patients: PatientLocal[] = PATIENTS_DATA.map((p) => ({
    id:         uuid(),
    name:       p.name,
    species:    p.species,
    breed:      p.breed,
    sex:        p.sex,
    color:      p.color,
    weight:     p.weight,
    ownerId:    owners[p.ownerIdx].id,
    clinicId,
    active:     true,
    birthDate:  dateStr(-randInt(365, 365 * 8)),
    syncStatus: 'pending' as const,
    updatedAt:  now,
    createdAt:  now,
  }));

  // Service catalog
  const services: ServiceLocal[] = DEFAULT_SERVICES.map((s) => ({
    ...s,
    id:         uuid(),
    clinicId,
    createdAt:  now,
    syncStatus: 'pending' as const,
    updatedAt:  now,
  }));

  // Products
  const products: ProductLocal[] = [];
  const movements: StockMovementLocal[] = [];
  const productsByName = new Map<string, ProductLocal>();

  for (const p of PRODUCTS_DATA) {
    const prodId = uuid();
    const prod: ProductLocal = {
      id:           prodId,
      name:         p.name,
      category:     p.category,
      currentStock: p.stock,
      minimumStock: p.min,
      unit:         p.unit,
      salePrice:    p.salePrice,
      costPrice:    p.costPrice,
      active:       true,
      clinicId,
      syncStatus:   'pending' as const,
      updatedAt:    now,
      createdAt:    now,
    };
    products.push(prod);
    productsByName.set(p.name, prod);

    if (p.stock > 0) {
      movements.push({
        id:          uuid(),
        productId:   prodId,
        clinicId,
        type:        'entry',
        quantity:    p.stock,
        stockBefore: 0,
        stockAfter:  p.stock,
        reason:      'Initial stock — Seed',
        syncStatus:  'pending' as const,
        updatedAt:   now,
        createdAt:   now,
      });
    }
  }

  // Consultations with real items
  const consultations: ConsultationLocal[] = [];

  for (const patient of patients) {
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) {
      const daysAgo  = randInt(7, 180);
      const type     = rand(CONSULTATION_TYPES_SEED);
      const templates = ITEMS_BY_TYPE[type] ?? ITEMS_BY_TYPE['other'];

      const rawItems = templates.filter((_, idx) => idx === 0 || Math.random() > 0.4);
      const items: ConsultationItem[] = rawItems.map((tmpl) => {
        const qty  = tmpl.isService ? 1 : randInt(1, 3);
        const prod = tmpl.prodName ? productsByName.get(tmpl.prodName) : undefined;
        return {
          id:          uuid(),
          productId:   prod?.id,
          description: tmpl.description,
          quantity:    qty,
          unitPrice:   tmpl.price,
          subtotal:    tmpl.price * qty,
          isService:   tmpl.isService,
        };
      });

      const subtotal   = items.reduce((s, it) => s + it.subtotal, 0);
      const discount   = Math.random() > 0.85 ? rand([50, 100, 150] as const) : 0;
      const total      = Math.max(0, subtotal - discount);
      const consultId  = uuid();

      consultations.push({
        id:           consultId,
        patientId:    patient.id,
        ownerId:      patient.ownerId,
        clinicId,
        date:         tsAgo(daysAgo),
        type,
        status:       'completed',
        reason:       rand(VISIT_REASONS),
        diagnosis:    type === 'vaccination'
          ? `Vacuna ${rand(VACCINES)} aplicada sin incidentes.`
          : 'Examen físico general dentro de parámetros normales. Se recomienda seguimiento.',
        treatment:    type === 'vaccination'
          ? 'Vacuna aplicada vía subcutánea. Próxima dosis en 12 meses.'
          : 'Medicación indicada por 7 días. Control en 2 semanas.',
        weight:       patient.weight,
        temperature:  parseFloat((38 + Math.random() * 1.2).toFixed(1)),
        veterinarian: 'Dra. Patricia Vega',
        items,
        subtotal,
        discount,
        total,
        syncStatus:   'pending' as const,
        updatedAt:    now,
        createdAt:    now,
      });
    }
  }

  // Appointments
  const appointments: AppointmentLocal[] = [];

  for (let i = 0; i < 8; i++) {
    const patient = rand(patients);
    appointments.push({
      id:              uuid(),
      patientId:       patient.id,
      ownerId:         patient.ownerId,
      clinicId,
      date:            dateStr(-randInt(1, 14)),
      startTime:       `${String(randInt(8, 16)).padStart(2, '0')}:00`,
      durationMinutes: rand([30, 45, 60] as const),
      type:            rand(APPOINTMENT_TYPES_SEED),
      status:          rand(PAST_STATUSES_SEED),
      reason:          rand(VISIT_REASONS),
      veterinarian:    'Dra. Patricia Vega',
      syncStatus:      'pending' as const,
      updatedAt:       now,
      createdAt:       now,
    });
  }

  const todayHours = [8, 9, 10, 11, 14, 15] as const;
  const todayPatients = [...patients].sort(() => Math.random() - 0.5).slice(0, 5);
  todayPatients.forEach((patient, i) => {
    appointments.push({
      id:              uuid(),
      patientId:       patient.id,
      ownerId:         patient.ownerId,
      clinicId,
      date:            dateStr(0),
      startTime:       `${String(todayHours[i] ?? 9).padStart(2, '0')}:00`,
      durationMinutes: rand([30, 45, 60] as const),
      type:            rand(APPOINTMENT_TYPES_SEED),
      status:          i === 0 ? 'in_progress' : 'confirmed',
      reason:          rand(VISIT_REASONS),
      veterinarian:    'Dra. Patricia Vega',
      syncStatus:      'pending' as const,
      updatedAt:       now,
      createdAt:       now,
    });
  });

  for (let i = 0; i < 6; i++) {
    const patient = rand(patients);
    appointments.push({
      id:              uuid(),
      patientId:       patient.id,
      ownerId:         patient.ownerId,
      clinicId,
      date:            dateStr(randInt(1, 7)),
      startTime:       `${String(randInt(8, 16)).padStart(2, '0')}:00`,
      durationMinutes: rand([30, 45, 60] as const),
      type:            rand(APPOINTMENT_TYPES_SEED),
      status:          'pending',
      reason:          rand(VISIT_REASONS),
      veterinarian:    'Dra. Patricia Vega',
      syncStatus:      'pending' as const,
      updatedAt:       now,
      createdAt:       now,
    });
  }

  // Invoices + linked payments generated from consultations
  const invoices: InvoiceLocal[]  = [];
  const payments: PaymentLocal[]  = [];
  let invoiceNum = 1;
  const year = new Date().getFullYear();

  // Distribution: 65% paid, 20% pending, 15% partially_paid
  const INVOICE_STATUS_DIST = [
    ...Array(13).fill('paid'),
    ...Array(4).fill('pending'),
    ...Array(3).fill('partially_paid'),
  ] as const;

  for (const consultation of consultations) {
    if (consultation.total <= 0) continue;

    const invoiceId  = uuid();
    const number     = `FAC-${year}-${String(invoiceNum++).padStart(4, '0')}`;
    const date       = dateStrFromTs(consultation.date);
    const status     = rand(INVOICE_STATUS_DIST);
    const pmMethod   = rand(INVOICE_METHODS_SEED);

    const amountPaid =
      status === 'paid'            ? consultation.total :
      status === 'partially_paid'  ? Math.round(consultation.total * (0.3 + Math.random() * 0.4)) :
      0;

    const invoiceItems: InvoiceItem[] = consultation.items.map((ci) => ({
      id:          ci.id,
      description: ci.description,
      quantity:    ci.quantity,
      unitPrice:   ci.unitPrice,
      subtotal:    ci.subtotal,
      type:        ci.isService ? 'service' : 'product',
      productId:   ci.productId,
    }));

    const invoice: InvoiceLocal = {
      id:             invoiceId,
      number,
      consultationId: consultation.id,
      patientId:      consultation.patientId,
      ownerId:        consultation.ownerId,
      clinicId,
      date,
      items:          invoiceItems,
      subtotal:       consultation.subtotal,
      discount:       consultation.discount,
      total:          consultation.total,
      paymentMethod:  pmMethod,
      status,
      amountPaid,
      syncStatus:     'pending' as const,
      updatedAt:      now,
      createdAt:      now,
    };

    const paymentId     = uuid();
    const paymentMethod = pmMethod === 'mixed' ? ('other' as const) : pmMethod;
    const paymentStatus = status === 'paid' ? 'paid' : 'pending';

    const payment: PaymentLocal = {
      id:             paymentId,
      patientId:      consultation.patientId,
      clinicId,
      consultationId: consultation.id,
      date,
      concept:        `${number} — ${consultation.reason?.slice(0, 100) ?? ''}`,
      type:           paymentTypeFromConsultation(consultation.type),
      amount:         status === 'paid' ? consultation.total : amountPaid || consultation.total,
      paymentMethod,
      status:         paymentStatus,
      syncStatus:     'pending' as const,
      updatedAt:      now,
      createdAt:      now,
    };

    invoice.paymentId   = paymentId;
    consultation.invoiceId = invoiceId;
    consultation.paymentId = paymentId;

    invoices.push(invoice);
    payments.push(payment);
  }

  // Extra standalone payments for the finance module (no invoice)
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  for (let i = 0; i < 15; i++) {
    const patient = rand(patients);
    const type    = rand(PAYMENT_TYPES_SEED);
    payments.push({
      id:            uuid(),
      patientId:     patient.id,
      clinicId,
      date:          dateStr(-randInt(0, Math.min(daysInMonth - 1, 27))),
      concept:       rand(CONCEPTS_BY_TYPE[type]),
      type,
      amount:        rand(AMOUNTS_BY_TYPE[type]),
      paymentMethod: rand(PAYMENT_METHODS_SEED),
      status:        rand(PAYMENT_STATUSES_SEED),
      syncStatus:    'pending' as const,
      updatedAt:     now,
      createdAt:     now,
    });
  }

  // ── Sales (POS) ───────────────────────────────────────────────────────────────
  const salesRaw: { prods: { idx: number; qty: number }[]; daysAgo: number; method: SaleLocal['paymentMethod']; patientIdx?: number }[] = [
    { prods: [{ idx: 1, qty: 1 }, { idx: 4, qty: 2 }], daysAgo: 1,  method: 'cash',     patientIdx: 1 },
    { prods: [{ idx: 0, qty: 2 }, { idx: 7, qty: 1 }], daysAgo: 3,  method: 'card'                  },
    { prods: [{ idx: 2, qty: 3 }],                      daysAgo: 5,  method: 'cash',     patientIdx: 4 },
    { prods: [{ idx: 9, qty: 1 }, { idx: 3, qty: 2 }], daysAgo: 8,  method: 'transfer'              },
    { prods: [{ idx: 5, qty: 1 }],                      daysAgo: 11, method: 'cash',     patientIdx: 0 },
    { prods: [{ idx: 6, qty: 4 }, { idx: 4, qty: 1 }], daysAgo: 14, method: 'card'                  },
    { prods: [{ idx: 8, qty: 2 }, { idx: 2, qty: 1 }], daysAgo: 18, method: 'cash',     patientIdx: 3 },
    { prods: [{ idx: 1, qty: 1 }, { idx: 9, qty: 2 }], daysAgo: 22, method: 'transfer'              },
    { prods: [{ idx: 0, qty: 3 }],                      daysAgo: 26, method: 'cash',     patientIdx: 7 },
    { prods: [{ idx: 3, qty: 1 }, { idx: 7, qty: 2 }], daysAgo: 29, method: 'card'                  },
  ];

  const sales: SaleLocal[]          = [];
  const salePayments: PaymentLocal[] = [];

  for (const sr of salesRaw) {
    const items: SaleItem[] = sr.prods.map(p => ({
      id:          uuid(),
      productId:   products[p.idx].id,
      description: products[p.idx].name,
      quantity:    p.qty,
      unitPrice:   products[p.idx].salePrice ?? 0,
      subtotal:    (products[p.idx].salePrice ?? 0) * p.qty,
    }));
    const subtotal   = items.reduce((s, i) => s + i.subtotal, 0);
    const saleId     = uuid();
    const paymentId  = uuid();
    const saleDate   = dateStr(-sr.daysAgo);
    const payMethod  = sr.method === 'mixed' ? ('other' as const) : sr.method;

    sales.push({
      id:            saleId,
      clinicId,
      date:          saleDate,
      items,
      subtotal,
      discount:      0,
      total:         subtotal,
      paymentMethod: sr.method,
      status:        'completed',
      patientId:     sr.patientIdx !== undefined ? patients[sr.patientIdx].id : undefined,
      paymentId,
      createdAt:     now,
      syncStatus:    'pending' as const,
      updatedAt:     now,
    });

    salePayments.push({
      id:            paymentId,
      clinicId,
      patientId:     sr.patientIdx !== undefined ? patients[sr.patientIdx].id : '',
      date:          saleDate,
      concept:       `Venta mostrador — ${items.map(i => i.description).join(', ')}`,
      type:          'product',
      amount:        subtotal,
      paymentMethod: payMethod,
      status:        'paid',
      syncStatus:    'pending' as const,
      updatedAt:     now,
      createdAt:     now,
    });
  }

  // ── Fixed expenses ────────────────────────────────────────────────────────────
  const todayStr = dateStr(0);

  function nextDue(paymentDay: number): string {
    const d = new Date();
    d.setDate(paymentDay);
    if (d.toISOString().slice(0, 10) < todayStr) d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(paymentDay, lastDay));
    return d.toISOString().slice(0, 10);
  }

  const expensesData: { name: string; amount: number; category: FixedExpense['category']; frequency: FixedExpense['frequency']; paymentDay: number }[] = [
    { name: 'Renta del local',       amount: 12000, category: 'rent',        frequency: 'monthly',   paymentDay: 5  },
    { name: 'Electricidad',          amount: 2200,  category: 'services',    frequency: 'monthly',   paymentDay: 10 },
    { name: 'Internet + teléfono',   amount: 850,   category: 'services',    frequency: 'monthly',   paymentDay: 15 },
    { name: 'Seguro del local',      amount: 1800,  category: 'insurance',   frequency: 'monthly',   paymentDay: 20 },
    { name: 'Mantenimiento equipos', amount: 3500,  category: 'maintenance', frequency: 'quarterly', paymentDay: 1  },
  ];

  const fixedExpenses: FixedExpense[] = expensesData.map(e => ({
    id:          uuid(),
    clinicId,
    name:        e.name,
    amount:      e.amount,
    category:    e.category,
    frequency:   e.frequency,
    paymentDay:  e.paymentDay,
    nextDueDate: nextDue(e.paymentDay),
    active:      true,
    syncStatus:  'pending' as const,
    createdAt:   now,
    updatedAt:   now,
  }));

  const expensePayments: ExpensePayment[] = [];
  for (const expense of fixedExpenses) {
    if (expense.frequency !== 'monthly') continue;
    for (let m = 1; m <= 2; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      d.setDate(expense.paymentDay);
      expensePayments.push({
        id:             uuid(),
        clinicId,
        fixedExpenseId: expense.id,
        amount:         expense.amount,
        paymentDate:    d.toISOString().slice(0, 10),
        syncStatus:     'pending' as const,
        createdAt:      now,
        updatedAt:      now,
      });
    }
  }

  // ── Collaborators ─────────────────────────────────────────────────────────────
  const collabsData: { name: string; role: string; type: Collaborator['type']; salary: number; frequency: Collaborator['paymentFrequency']; daysUntilNext: number }[] = [
    { name: 'Dra. Valeria Núñez', role: 'Veterinaria',   type: 'employee',  salary: 18000, frequency: 'monthly',  daysUntilNext: 12 },
    { name: 'Mario Espinoza',     role: 'Recepcionista', type: 'employee',  salary: 9000,  frequency: 'biweekly', daysUntilNext: 5  },
    { name: 'Lucía Fonseca',      role: 'Groomer',       type: 'freelance', salary: 4500,  frequency: 'biweekly', daysUntilNext: 2  },
  ];

  const collaborators: Collaborator[] = collabsData.map(col => ({
    id:               uuid(),
    clinicId,
    name:             col.name,
    role:             col.role,
    type:             col.type,
    salary:           col.salary,
    paymentFrequency: col.frequency,
    nextPaymentDate:  dateStr(col.daysUntilNext),
    active:           true,
    syncStatus:       'pending' as const,
    createdAt:        now,
    updatedAt:        now,
  }));

  const collaboratorPayments: CollaboratorPayment[] = collaborators.map((col, i) => {
    const freq     = collabsData[i].frequency;
    const daysAgo  = freq === 'monthly' ? 30 : 15;
    return {
      id:             uuid(),
      clinicId,
      collaboratorId: col.id,
      amount:         col.salary,
      period:         freq === 'monthly' ? 'Junio 2026' : 'Quincena 1 — Jul 2026',
      paymentDate:    dateStr(-daysAgo),
      syncStatus:     'pending' as const,
      createdAt:      now,
      updatedAt:      now,
    };
  });

  // ── Promotions ────────────────────────────────────────────────────────────────
  // Reference real product/service IDs generated above (by PRODUCTS_DATA index).
  // products[1] = Ivermectina 1% (180), products[3] = Vacuna Antirrábica (120)
  // products[4] = Vacuna DHPP (150),    products[5] = Shampoo Medicado (220)
  // services[3] = Aplicación de Vacuna (80), services[5] = Desparasitación Externa (120)
  // services[11] = Baño y Corte (350)

  function makePromoItems(defs: {
    type: 'product' | 'service';
    ref: ProductLocal | ServiceLocal;
    qty: number;
    discountType: PromotionItem['discountType'];
    discountValue: number;
  }[]): PromotionItem[] {
    return defs.map((d) => {
      const originalPrice = d.type === 'product'
        ? (d.ref as ProductLocal).salePrice ?? 0
        : (d.ref as ServiceLocal).price;
      const finalUnitPrice = applyDiscount(originalPrice, d.discountType, d.discountValue);
      return {
        id:             uuid(),
        type:           d.type,
        refId:          d.ref.id,
        name:           d.ref.name,
        unit:           d.type === 'product' ? (d.ref as ProductLocal).unit : undefined,
        quantity:       d.qty,
        originalPrice,
        discountType:   d.discountType,
        discountValue:  d.discountValue,
        finalUnitPrice,
      };
    });
  }

  const promoDefsRaw: { name: string; description: string; defs: Parameters<typeof makePromoItems>[0] }[] = [
    {
      name:        'Paquete Antiparasitario',
      description: 'Ivermectina + desparasitación externa gratis',
      defs: [
        { type: 'product', ref: products[1], qty: 1, discountType: 'none',  discountValue: 0 },
        { type: 'service', ref: services[5], qty: 1, discountType: 'free',  discountValue: 0 },
      ],
    },
    {
      name:        'Pack Vacunación Completa',
      description: 'Antirrábica + DHPP con 10% descuento + aplicación incluida',
      defs: [
        { type: 'product', ref: products[3], qty: 1, discountType: 'percentage', discountValue: 10 },
        { type: 'product', ref: products[4], qty: 1, discountType: 'percentage', discountValue: 10 },
        { type: 'service', ref: services[3], qty: 1, discountType: 'none',       discountValue: 0  },
      ],
    },
    {
      name:        'Grooming Especial',
      description: 'Shampoo medicado + baño y corte con C$50 de descuento',
      defs: [
        { type: 'product', ref: products[5], qty: 1, discountType: 'fixed',      discountValue: 50  },
        { type: 'service', ref: services[11], qty: 1, discountType: 'none',      discountValue: 0   },
      ],
    },
  ];

  const promotions: PromotionLocal[] = promoDefsRaw.map(({ name, description, defs }) => {
    const items         = makePromoItems(defs);
    const originalTotal = items.reduce((s, i) => s + i.originalPrice * i.quantity, 0);
    const total         = items.reduce((s, i) => s + i.finalUnitPrice * i.quantity, 0);
    return {
      id:           uuid(),
      clinicId,
      name,
      description,
      active:       true,
      items,
      originalTotal,
      total,
      createdAt:    now,
      syncStatus:   'pending' as const,
      updatedAt:    now,
    };
  });

  // ── Write everything to Dexie ─────────────────────────────────────────────────
  await db.transaction('rw',
    [
      db.owners, db.patients, db.consultations, db.appointments,
      db.products, db.movements, db.payments, db.invoices, db.services,
      db.sales, db.fixedExpenses, db.expensePayments,
      db.collaborators, db.collaboratorPayments, db.promotions,
    ],
    async () => {
      await db.owners.bulkAdd(owners);
      await db.patients.bulkAdd(patients);
      await db.consultations.bulkAdd(consultations);
      await db.appointments.bulkAdd(appointments);
      await db.products.bulkAdd(products);
      await db.movements.bulkAdd(movements);
      await db.payments.bulkAdd([...payments, ...salePayments]);
      await db.invoices.bulkAdd(invoices);
      await db.services.bulkAdd(services);
      await db.sales.bulkAdd(sales);
      await db.fixedExpenses.bulkAdd(fixedExpenses);
      await db.expensePayments.bulkAdd(expensePayments);
      await db.collaborators.bulkAdd(collaborators);
      await db.collaboratorPayments.bulkAdd(collaboratorPayments);
      await db.promotions.bulkAdd(promotions);
    }
  );

  return {
    mensaje: '¡Datos sembrados correctamente!',
    conteos: {
      owners:               owners.length,
      patients:             patients.length,
      consultations:        consultations.length,
      appointments:         appointments.length,
      products:             products.length,
      movements:            movements.length,
      invoices:             invoices.length,
      payments:             payments.length + salePayments.length,
      services:             services.length,
      sales:                sales.length,
      fixedExpenses:        fixedExpenses.length,
      expensePayments:      expensePayments.length,
      collaborators:        collaborators.length,
      collaboratorPayments: collaboratorPayments.length,
      promotions:           promotions.length,
    },
  };
}

export async function limpiarDatos(): Promise<void> {
  await db.transaction('rw',
    [
      db.owners, db.patients, db.consultations, db.appointments,
      db.products, db.movements, db.payments, db.invoices, db.services,
      db.sales, db.fixedExpenses, db.expensePayments,
      db.collaborators, db.collaboratorPayments, db.promotions, db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.owners.clear(),
        db.patients.clear(),
        db.consultations.clear(),
        db.appointments.clear(),
        db.products.clear(),
        db.movements.clear(),
        db.payments.clear(),
        db.invoices.clear(),
        db.services.clear(),
        db.sales.clear(),
        db.fixedExpenses.clear(),
        db.expensePayments.clear(),
        db.collaborators.clear(),
        db.collaboratorPayments.clear(),
        db.promotions.clear(),
        db.syncQueue.clear(),
      ]);
    }
  );
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function paymentTypeFromConsultation(consultationType: string): PaymentLocal['type'] {
  const map: Record<string, PaymentLocal['type']> = {
    general_consultation: 'consultation',
    checkup:              'consultation',
    vaccination:          'vaccination',
    surgery:              'surgery',
    emergency:            'consultation',
    deworming:            'other',
    grooming:             'grooming',
    other:                'other',
  };
  return map[consultationType] ?? 'other';
}
