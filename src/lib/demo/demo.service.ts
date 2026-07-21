import { getAuth, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase/firebase.config';
import { db } from '@/lib/db/database';
import { tryLoadDemoSnapshot, DEMO_CLINIC_ID } from '@/lib/demo/demo.snapshot';
import type { SessionLocal } from '@/types/license';
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

function uuid() { return crypto.randomUUID(); }
function ts()   { return Date.now(); }
function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function tsOffset(offsetDays: number) {
  return Date.now() + offsetDays * 86_400_000;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export async function setupDemo(): Promise<void> {
  const now = ts();

  const session: SessionLocal = {
    id:             'singleton',
    uid:            'demo-user',
    email:          'demo@vetsystem.app',
    clinicId:       DEMO_CLINIC_ID,
    clinicName:     'Clínica Veterinaria Demo',
    userName:       'Dr. Demo',
    role:           'admin',
    permissions:    null,
    plan:           'Demo',
    expirationDate: '2099-12-31',
    subscription:   true,
    lastSync:       now,
    cachedAt:       now,
    isDemo:         true,
  };

  // Write demo session BEFORE signing out so the auth listener
  // finds isDemo=true when it fires with user=null, and preserves it.
  await db.session.put(session);

  // If a real Firebase user is signed in, sign them out silently.
  // This prevents tryRefresh from overwriting the demo session
  // with real Firestore data after we return.
  const auth = getAuth(getFirebaseApp());
  if (auth.currentUser) {
    await firebaseSignOut(auth);
  }

  // Preferred path: load curated data published by the developer from Firestore.
  // This is a 1-read version check; subsequent visits skip the download entirely.
  const loadedFromFirestore = await tryLoadDemoSnapshot();
  if (loadedFromFirestore) return;

  // Fallback: generate local seed data (used when offline or no snapshot published yet).
  const existing = await db.patients.where('clinicId').equals(DEMO_CLINIC_ID).count();
  if (existing > 0) return;

  await _seedDemoData();
}

export async function clearDemo(): Promise<void> {
  await db.session.delete('singleton');
  await db.transaction('rw', [
    db.patients, db.owners, db.consultations, db.appointments,
    db.products, db.movements, db.payments, db.invoices, db.services, db.sales,
    db.fixedExpenses, db.expensePayments, db.collaborators, db.collaboratorPayments,
  ], async () => {
    await Promise.all([
      db.patients.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.owners.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.consultations.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.appointments.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.products.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.movements.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.payments.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.invoices.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.services.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.sales.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.fixedExpenses.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.expensePayments.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.collaborators.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
      db.collaboratorPayments.where('clinicId').equals(DEMO_CLINIC_ID).delete(),
    ]);
  });
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function _seedDemoData() {
  const now = ts();
  const c   = DEMO_CLINIC_ID;

  // ── Owners ───────────────────────────────────────────────────────────────────
  const ownersRaw = [
    { name: 'María González',  phone: '8891-2341', email: 'maria@demo.com'   },
    { name: 'José Martínez',   phone: '7723-4512', email: 'jose@demo.com'    },
    { name: 'Ana López',       phone: '8834-6723', email: 'ana@demo.com'     },
    { name: 'Carlos Ibarra',   phone: '8812-3344', email: 'carlos@demo.com'  },
    { name: 'Sofía Morales',   phone: '7790-1122', email: 'sofia@demo.com'   },
    { name: 'Diego Hernández', phone: '8856-7890', email: 'diego@demo.com'   },
    { name: 'Laura Pérez',     phone: '8823-4561', email: 'laura@demo.com'   },
    { name: 'Roberto Jiménez', phone: '7745-8901', email: 'roberto@demo.com' },
  ];

  const owners: OwnerLocal[] = ownersRaw.map(d => ({
    id:         uuid(),
    clinicId:   c,
    name:       d.name,
    phone:      d.phone,
    email:      d.email,
    syncStatus: 'pending' as const,
    updatedAt:  now,
    createdAt:  now,
  }));

  // ── Patients ─────────────────────────────────────────────────────────────────
  const patientsRaw = [
    { name: 'Luna',     species: 'dog' as const, breed: 'Golden Retriever', sex: 'female' as const, years: 3, ownerIdx: 0 },
    { name: 'Mochi',    species: 'cat' as const, breed: 'Persa',            sex: 'male'   as const, years: 2, ownerIdx: 1 },
    { name: 'Rex',      species: 'dog' as const, breed: 'Pastor Alemán',    sex: 'male'   as const, years: 5, ownerIdx: 2 },
    { name: 'Canela',   species: 'dog' as const, breed: 'Shih Tzu',         sex: 'female' as const, years: 1, ownerIdx: 3 },
    { name: 'Simba',    species: 'cat' as const, breed: 'Maine Coon',       sex: 'male'   as const, years: 4, ownerIdx: 4 },
    { name: 'Princesa', species: 'dog' as const, breed: 'Chihuahua',        sex: 'female' as const, years: 7, ownerIdx: 5 },
    { name: 'Thor',     species: 'dog' as const, breed: 'Labrador',         sex: 'male'   as const, years: 2, ownerIdx: 6 },
    { name: 'Pelusa',   species: 'cat' as const, breed: 'Angora',           sex: 'female' as const, years: 3, ownerIdx: 7 },
    { name: 'Kira',     species: 'dog' as const, breed: 'Border Collie',    sex: 'female' as const, years: 6, ownerIdx: 0 },
    { name: 'Manchas',  species: 'cat' as const, breed: 'Mestizo',          sex: 'male'   as const, years: 8, ownerIdx: 2 },
  ];

  const patients: PatientLocal[] = patientsRaw.map(p => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - p.years);
    return {
      id:         uuid(),
      clinicId:   c,
      ownerId:    owners[p.ownerIdx].id,
      name:       p.name,
      species:    p.species,
      breed:      p.breed,
      sex:        p.sex,
      birthDate:  birth.toISOString().slice(0, 10),
      active:     true,
      syncStatus: 'pending' as const,
      updatedAt:  now,
      createdAt:  now,
    };
  });

  // ── Services ─────────────────────────────────────────────────────────────────
  const servicesRaw: { name: string; category: ServiceLocal['category']; price: number }[] = [
    { name: 'Consultation general',       category: 'consultation', price: 350  },
    { name: 'Consultation de emergencia', category: 'emergency',    price: 600  },
    { name: 'Vacuna antirrábica',         category: 'vaccination',  price: 280  },
    { name: 'Vacuna múltiple',            category: 'vaccination',  price: 450  },
    { name: 'Desparasitación',            category: 'deworming',    price: 150  },
    { name: 'Baño y corte',              category: 'grooming',     price: 450  },
    { name: 'Radiografía',               category: 'laboratory',   price: 800  },
    { name: 'Cirugía menor',             category: 'surgery',      price: 2500 },
  ];

  const services: ServiceLocal[] = servicesRaw.map(s => ({
    id:         uuid(),
    clinicId:   c,
    name:       s.name,
    category:   s.category,
    price:      s.price,
    active:     true,
    syncStatus: 'pending' as const,
    updatedAt:  now,
    createdAt:  now,
  }));

  // ── Products ─────────────────────────────────────────────────────────────────
  const productsRaw: {
    name: string;
    category: ProductLocal['category'];
    salePrice: number;
    stock: number;
    min: number;
  }[] = [
    { name: 'Vacuna Antirrábica',   category: 'vaccine',        salePrice: 180, stock: 24, min: 10 },
    { name: 'Frontline Plus',        category: 'antiparasitic',  salePrice: 220, stock: 18, min: 5  },
    { name: 'Amoxicilina 500mg',     category: 'medication',     salePrice: 45,  stock: 60, min: 20 },
    { name: 'Meloxicam 1.5mg/ml',    category: 'medication',     salePrice: 85,  stock: 30, min: 10 },
    { name: 'Jeringa 5ml',           category: 'other',          salePrice: 8,   stock: 4,  min: 20 },
    { name: 'Sutura absorbible 3-0', category: 'surgery',        salePrice: 95,  stock: 12, min: 5  },
    { name: 'Guantes Látex M',       category: 'other',          salePrice: 12,  stock: 2,  min: 10 },
    { name: 'Vitamina B12',          category: 'medication',     salePrice: 35,  stock: 45, min: 15 },
    { name: 'Suero fisiológico',     category: 'other',          salePrice: 25,  stock: 30, min: 10 },
    { name: 'Ivermectina 1%',        category: 'antiparasitic',  salePrice: 55,  stock: 22, min: 8  },
  ];

  const products: ProductLocal[] = productsRaw.map(p => ({
    id:           uuid(),
    clinicId:     c,
    name:         p.name,
    category:     p.category,
    unit:         'unit' as const,
    salePrice:    p.salePrice,
    currentStock: p.stock,
    minimumStock: p.min,
    active:       true,
    syncStatus:   'pending' as const,
    updatedAt:    now,
    createdAt:    now,
  }));

  // ── Stock movements ───────────────────────────────────────────────────────────
  const movements: StockMovementLocal[] = products.map(p => ({
    id:          uuid(),
    clinicId:    c,
    productId:   p.id,
    type:        'entry' as const,
    quantity:    p.currentStock,
    stockBefore: 0,
    stockAfter:  p.currentStock,
    reason:      'Stock inicial demo',
    createdAt:   now,
    syncStatus:  'pending' as const,
    updatedAt:   now,
  }));

  // ── Appointments ──────────────────────────────────────────────────────────────
  const appointmentsRaw: {
    pac: number;
    hour: string;
    type: AppointmentLocal['type'];
    status: AppointmentLocal['status'];
    offset: number;
  }[] = [
    { pac: 0, hour: '09:00', type: 'consultation', status: 'confirmed', offset: 0  },
    { pac: 2, hour: '10:30', type: 'vaccination',  status: 'confirmed', offset: 0  },
    { pac: 4, hour: '11:00', type: 'checkup',      status: 'pending',   offset: 0  },
    { pac: 6, hour: '14:00', type: 'consultation', status: 'pending',   offset: 0  },
    { pac: 1, hour: '09:30', type: 'vaccination',  status: 'confirmed', offset: 1  },
    { pac: 7, hour: '10:00', type: 'checkup',      status: 'pending',   offset: 2  },
  ];

  const appointments: AppointmentLocal[] = appointmentsRaw.map(cit => ({
    id:              uuid(),
    clinicId:        c,
    patientId:       patients[cit.pac].id,
    ownerId:         patients[cit.pac].ownerId,
    date:            dateStr(cit.offset),
    startTime:       cit.hour,
    durationMinutes: 30,
    type:            cit.type,
    status:          cit.status,
    reason:          `Appointment de ${cit.type}`,
    syncStatus:      'pending' as const,
    updatedAt:       now,
    createdAt:       now,
  }));

  // ── Consultations ─────────────────────────────────────────────────────────────
  const consultationsRaw: {
    pac:    number;
    days:   number;
    reason: string;
    type:   ConsultationLocal['type'];
    svc:    number;
    prod:   number;
  }[] = [
    { pac: 0, days: -5,  reason: 'Revisión anual',         type: 'general_consultation', svc: 0, prod: 4 },
    { pac: 2, days: -10, reason: 'Vacunación antirrábica',  type: 'vaccination',          svc: 2, prod: 0 },
    { pac: 3, days: -2,  reason: 'Vómitos y fiebre',        type: 'emergency',            svc: 1, prod: 2 },
    { pac: 5, days: -15, reason: 'Control de peso',         type: 'checkup',              svc: 0, prod: 7 },
    { pac: 8, days: -1,  reason: 'Desparasitación rutina',  type: 'deworming',            svc: 4, prod: 9 },
  ];

  const consultations: ConsultationLocal[] = [];
  const payments:      PaymentLocal[]      = [];
  const invoices:      InvoiceLocal[]      = [];

  let invoiceNum = 1;

  for (const cr of consultationsRaw) {
    const patient = patients[cr.pac];
    const svc     = services[cr.svc];
    const prod    = products[cr.prod];

    const items: ConsultationItem[] = [
      {
        id:          uuid(),
        description: svc.name,
        quantity:    1,
        unitPrice:   svc.price,
        subtotal:    svc.price,
        isService:   true,
      },
      {
        id:          uuid(),
        description: prod.name,
        quantity:    1,
        unitPrice:   prod.salePrice ?? 0,
        subtotal:    prod.salePrice ?? 0,
        isService:   false,
        productId:   prod.id,
      },
    ];

    const subtotal      = items.reduce((s, i) => s + i.subtotal, 0);
    const consultId     = uuid();
    const invoiceId     = uuid();
    const paymentId     = uuid();
    const dateString    = dateStr(cr.days);
    const dateTimestamp = tsOffset(cr.days);
    const isPaid        = cr.days < -3;
    const status        = isPaid ? 'completed' as const : 'in_progress' as const;

    const consultation: ConsultationLocal = {
      id:         consultId,
      clinicId:   c,
      patientId:  patient.id,
      ownerId:    patient.ownerId,
      date:       dateTimestamp,
      type:       cr.type,
      reason:     cr.reason,
      items,
      subtotal,
      discount:   0,
      total:      subtotal,
      status,
      invoiceId,
      paymentId,
      syncStatus: 'pending' as const,
      updatedAt:  now,
      createdAt:  now,
    };

    const invoiceItems: InvoiceItem[] = items.map(i => ({
      id:          i.id,
      description: i.description,
      quantity:    i.quantity,
      unitPrice:   i.unitPrice,
      subtotal:    i.subtotal,
      type:        i.isService ? 'service' as const : 'product' as const,
      productId:   i.productId,
    }));

    const number = `FAC-2026-${String(invoiceNum++).padStart(4, '0')}`;

    const invoice: InvoiceLocal = {
      id:             invoiceId,
      clinicId:       c,
      number,
      consultationId: consultId,
      patientId:      patient.id,
      ownerId:        patient.ownerId,
      date:           dateString,
      items:          invoiceItems,
      subtotal,
      discount:       0,
      total:          subtotal,
      paymentMethod:  'cash',
      status:         isPaid ? 'paid' : 'pending',
      amountPaid:     isPaid ? subtotal : 0,
      paymentId,
      syncStatus:     'pending' as const,
      updatedAt:      now,
      createdAt:      now,
    };

    const payment: PaymentLocal = {
      id:             paymentId,
      clinicId:       c,
      patientId:      patient.id,
      consultationId: consultId,
      date:           dateString,
      concept:        `${number} — ${cr.reason}`,
      type:           'consultation',
      amount:         subtotal,
      paymentMethod:  'cash',
      status:         isPaid ? 'paid' : 'pending',
      syncStatus:     'pending' as const,
      updatedAt:      now,
      createdAt:      now,
    };

    consultations.push(consultation);
    invoices.push(invoice);
    payments.push(payment);
  }

  // ── Sales (POS) ───────────────────────────────────────────────────────────────
  const salesRaw: { prods: { idx: number; qty: number }[]; days: number; method: SaleLocal['paymentMethod']; patientIdx?: number }[] = [
    { prods: [{ idx: 1, qty: 1 }, { idx: 4, qty: 2 }], days: -1,  method: 'cash',     patientIdx: 1 },
    { prods: [{ idx: 0, qty: 2 }, { idx: 7, qty: 1 }], days: -2,  method: 'card'                    },
    { prods: [{ idx: 2, qty: 3 }],                      days: -3,  method: 'cash',     patientIdx: 4 },
    { prods: [{ idx: 9, qty: 1 }, { idx: 3, qty: 2 }], days: -5,  method: 'transfer'                },
    { prods: [{ idx: 5, qty: 1 }],                      days: -7,  method: 'cash',     patientIdx: 0 },
    { prods: [{ idx: 6, qty: 4 }, { idx: 4, qty: 1 }], days: -10, method: 'card'                    },
    { prods: [{ idx: 8, qty: 2 }, { idx: 2, qty: 1 }], days: -12, method: 'cash',     patientIdx: 3 },
    { prods: [{ idx: 1, qty: 1 }, { idx: 9, qty: 2 }], days: -18, method: 'transfer'                },
    { prods: [{ idx: 0, qty: 3 }],                      days: -22, method: 'cash',     patientIdx: 7 },
    { prods: [{ idx: 3, qty: 1 }, { idx: 7, qty: 2 }], days: -28, method: 'card'                    },
  ];

  const sales: SaleLocal[]           = [];
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
    const saleDate   = dateStr(sr.days);
    const payMethod  = sr.method === 'mixed' ? ('other' as const) : sr.method;

    sales.push({
      id:            saleId,
      clinicId:      c,
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
      clinicId:      c,
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
  const today = new Date().toISOString().slice(0, 10);

  function nextDue(paymentDay: number): string {
    const d = new Date();
    d.setDate(paymentDay);
    if (d.toISOString().slice(0, 10) < today) d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(paymentDay, lastDay));
    return d.toISOString().slice(0, 10);
  }

  const fixedExpensesRaw: { name: string; amount: number; category: FixedExpense['category']; frequency: FixedExpense['frequency']; paymentDay: number }[] = [
    { name: 'Renta del local',       amount: 12000, category: 'rent',        frequency: 'monthly',   paymentDay: 5  },
    { name: 'Electricidad',          amount: 2200,  category: 'services',    frequency: 'monthly',   paymentDay: 10 },
    { name: 'Internet + teléfono',   amount: 850,   category: 'services',    frequency: 'monthly',   paymentDay: 15 },
    { name: 'Seguro del local',      amount: 1800,  category: 'insurance',   frequency: 'monthly',   paymentDay: 20 },
    { name: 'Mantenimiento equipos', amount: 3500,  category: 'maintenance', frequency: 'quarterly', paymentDay: 1  },
  ];

  const fixedExpenses: FixedExpense[] = fixedExpensesRaw.map(e => ({
    id:          uuid(),
    clinicId:    c,
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

  // Historical payments — last 2 months for each monthly expense
  const expensePayments: ExpensePayment[] = [];
  for (const expense of fixedExpenses) {
    if (expense.frequency !== 'monthly') continue;
    for (let m = 1; m <= 2; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      d.setDate(expense.paymentDay);
      expensePayments.push({
        id:             uuid(),
        clinicId:       c,
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
  const collabsRaw: { name: string; role: string; type: Collaborator['type']; salary: number; frequency: Collaborator['paymentFrequency']; daysUntilNext: number }[] = [
    { name: 'Dra. Valeria Núñez', role: 'Veterinaria',   type: 'employee',  salary: 18000, frequency: 'monthly',  daysUntilNext: 12 },
    { name: 'Mario Espinoza',     role: 'Recepcionista', type: 'employee',  salary: 9000,  frequency: 'biweekly', daysUntilNext: 5  },
    { name: 'Lucía Fonseca',      role: 'Groomer',       type: 'freelance', salary: 4500,  frequency: 'biweekly', daysUntilNext: 2  },
  ];

  function addDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const collaborators: Collaborator[] = collabsRaw.map(col => ({
    id:               uuid(),
    clinicId:         c,
    name:             col.name,
    role:             col.role,
    type:             col.type,
    salary:           col.salary,
    paymentFrequency: col.frequency,
    nextPaymentDate:  addDays(col.daysUntilNext),
    active:           true,
    syncStatus:       'pending' as const,
    createdAt:        now,
    updatedAt:        now,
  }));

  // One completed payment per collaborator in the previous cycle
  const collaboratorPayments: CollaboratorPayment[] = collaborators.map((col, i) => {
    const freq     = collabsRaw[i].frequency;
    const daysAgo  = freq === 'monthly' ? 30 : 15;
    return {
      id:             uuid(),
      clinicId:       c,
      collaboratorId: col.id,
      amount:         col.salary,
      period:         freq === 'monthly' ? 'Junio 2026' : 'Quincena 1 — Jul 2026',
      paymentDate:    addDays(-daysAgo),
      syncStatus:     'pending' as const,
      createdAt:      now,
      updatedAt:      now,
    };
  });

  // ── Write everything ──────────────────────────────────────────────────────────
  await db.transaction('rw', [
    db.owners, db.patients, db.services, db.products, db.movements,
    db.appointments, db.consultations, db.payments, db.invoices,
    db.sales, db.fixedExpenses, db.expensePayments,
    db.collaborators, db.collaboratorPayments,
  ], async () => {
    await db.owners.bulkAdd(owners);
    await db.patients.bulkAdd(patients);
    await db.services.bulkAdd(services);
    await db.products.bulkAdd(products);
    await db.movements.bulkAdd(movements);
    await db.appointments.bulkAdd(appointments);
    await db.consultations.bulkAdd(consultations);
    await db.payments.bulkAdd([...payments, ...salePayments]);
    await db.invoices.bulkAdd(invoices);
    await db.sales.bulkAdd(sales);
    await db.fixedExpenses.bulkAdd(fixedExpenses);
    await db.expensePayments.bulkAdd(expensePayments);
    await db.collaborators.bulkAdd(collaborators);
    await db.collaboratorPayments.bulkAdd(collaboratorPayments);
  });
}
