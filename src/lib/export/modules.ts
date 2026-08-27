'use client';

import { db, getClinicaId } from '@/lib/db/database';
import type { ExportColumn } from './index';

const fmt = {
  date:  (s: string) => s ?? '',
  money: (n: number | undefined) => (n != null ? `$${Number(n).toFixed(2)}` : '$0.00'),
  ts:    (ms: number) => (ms ? new Date(ms).toLocaleDateString('es-NI') : ''),
  bool:  (b: boolean | undefined) => (b ? 'Sí' : 'No'),
};

const SPECIES: Record<string, string> = {
  dog: 'Perro', cat: 'Gato', bird: 'Ave',
  rabbit: 'Conejo', reptile: 'Reptil', other: 'Otro',
};
const SEX: Record<string, string> = { male: 'Macho', female: 'Hembra' };
const PAYMENT_METHOD: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
  check: 'Cheque', mixed: 'Mixto', other: 'Otro',
};
const PAYMENT_STATUS: Record<string, string> = {
  pending: 'Pendiente', paid: 'Pagado', cancelled: 'Cancelado', refunded: 'Reembolsado',
};
const INVOICE_STATUS: Record<string, string> = {
  paid: 'Pagada', pending: 'Pendiente', partially_paid: 'Parcial', cancelled: 'Cancelada',
};
const APPT_STATUS: Record<string, string> = {
  scheduled: 'Programada', confirmed: 'Confirmada', completed: 'Completada',
  cancelled: 'Cancelada', no_show: 'No se presentó',
};
const EXPENSE_FREQ: Record<string, string> = {
  daily: 'Diario', monthly: 'Mensual', bimonthly: 'Bimestral',
  quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual',
};
const EXPENSE_CAT: Record<string, string> = {
  rent: 'Alquiler', services: 'Servicios', payroll: 'Nómina',
  insurance: 'Seguro', maintenance: 'Mantenimiento', supplies: 'Insumos',
  equipment: 'Equipos', marketing: 'Marketing', other: 'Otro',
};
const PRODUCT_CAT: Record<string, string> = {
  medication: 'Medicamento', vaccine: 'Vacuna', antiparasitic: 'Antiparasitario',
  food: 'Alimento', accessory: 'Accesorio', hygiene: 'Higiene',
  surgery: 'Cirugía', laboratory: 'Laboratorio', other: 'Otro',
};
const SVC_CAT: Record<string, string> = {
  consultation: 'Consulta', vaccination: 'Vacunación', surgery: 'Cirugía',
  deworming: 'Desparasit.', grooming: 'Estética', laboratory: 'Laboratorio',
  emergency: 'Emergencia', other: 'Otro',
};

// ─────────────────────────────────────────────────────────────────────────────

export async function getPatientsExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const patients = await db.patients
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt && p.active)
    .toArray();

  const ownerIds = [...new Set(patients.map((p) => p.ownerId))];
  const owners   = await db.owners.bulkGet(ownerIds);
  const ownerMap = new Map(owners.filter(Boolean).map((o) => [o!.id, o!]));

  const rows = patients.map((p) => {
    const o = ownerMap.get(p.ownerId);
    return {
      name:      p.name,
      species:   SPECIES[p.species] ?? p.species,
      breed:     p.breed ?? '',
      sex:       SEX[p.sex] ?? '',
      birthDate: p.birthDate ?? '',
      weight:    p.weight ? `${p.weight} kg` : '',
      owner:     o?.name ?? '',
      phone:     o?.phone ?? '',
      email:     o?.email ?? '',
      notes:     p.notes ?? '',
      created:   fmt.ts(p.createdAt),
    };
  });

  const columns: ExportColumn[] = [
    { header: 'Paciente',    key: 'name',      width: 20 },
    { header: 'Especie',     key: 'species',   width: 12 },
    { header: 'Raza',        key: 'breed',     width: 16 },
    { header: 'Sexo',        key: 'sex',       width: 10 },
    { header: 'F. Nac.',     key: 'birthDate', width: 14 },
    { header: 'Peso',        key: 'weight',    width: 10 },
    { header: 'Propietario', key: 'owner',     width: 22 },
    { header: 'Teléfono',    key: 'phone',     width: 14 },
    { header: 'Email',       key: 'email',     width: 24 },
    { header: 'Notas',       key: 'notes',     width: 30 },
    { header: 'Registro',    key: 'created',   width: 14 },
  ];

  return { rows, columns };
}

export async function getAppointmentsExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const appts = await db.appointments
    .where('clinicId').equals(clinicId)
    .filter((a) => !a.deletedAt)
    .toArray();
  appts.sort((a, b) => b.date.localeCompare(a.date));

  const patIds   = [...new Set(appts.map((a) => a.patientId))];
  const patients = await db.patients.bulkGet(patIds);
  const patMap   = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

  const ownerIds = [...new Set(appts.map((a) => a.ownerId))];
  const owners   = await db.owners.bulkGet(ownerIds);
  const ownerMap = new Map(owners.filter(Boolean).map((o) => [o!.id, o!]));

  const rows = appts.map((a) => ({
    date:    fmt.date(a.date),
    time:    a.startTime ?? '',
    patient: patMap.get(a.patientId)?.name ?? '',
    owner:   ownerMap.get(a.ownerId)?.name ?? '',
    phone:   ownerMap.get(a.ownerId)?.phone ?? '',
    status:  APPT_STATUS[a.status] ?? a.status,
    type:    a.type ?? '',
    notes:   a.notes ?? '',
  }));

  const columns: ExportColumn[] = [
    { header: 'Fecha',       key: 'date',    width: 14 },
    { header: 'Hora',        key: 'time',    width: 10 },
    { header: 'Paciente',    key: 'patient', width: 20 },
    { header: 'Propietario', key: 'owner',   width: 22 },
    { header: 'Teléfono',    key: 'phone',   width: 14 },
    { header: 'Estado',      key: 'status',  width: 14 },
    { header: 'Tipo',        key: 'type',    width: 14 },
    { header: 'Notas',       key: 'notes',   width: 30 },
  ];

  return { rows, columns };
}

export async function getConsultationsExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const consults = await db.consultations
    .where('clinicId').equals(clinicId)
    .filter((c) => !c.deletedAt)
    .toArray();
  consults.sort((a, b) => b.date - a.date);

  const patIds   = [...new Set(consults.map((c) => c.patientId))];
  const patients = await db.patients.bulkGet(patIds);
  const patMap   = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

  const rows = consults.map((c) => {
    const pat = patMap.get(c.patientId);
    return {
      date:      fmt.ts(c.date),
      patient:   pat?.name ?? '',
      species:   SPECIES[pat?.species ?? ''] ?? '',
      type:      SVC_CAT[c.type] ?? c.type ?? '',
      reason:    c.reason ?? '',
      diagnosis: c.diagnosis ?? '',
      treatment: c.treatment ?? '',
      weight:    c.weight ? `${c.weight} kg` : '',
      temp:      c.temperature ? `${c.temperature}°C` : '',
      status:    c.status ?? '',
      total:     fmt.money(c.total),
    };
  });

  const columns: ExportColumn[] = [
    { header: 'Fecha',       key: 'date',      width: 14 },
    { header: 'Paciente',    key: 'patient',   width: 20 },
    { header: 'Especie',     key: 'species',   width: 12 },
    { header: 'Tipo',        key: 'type',      width: 14 },
    { header: 'Motivo',      key: 'reason',    width: 24 },
    { header: 'Diagnóstico', key: 'diagnosis', width: 28 },
    { header: 'Tratamiento', key: 'treatment', width: 28 },
    { header: 'Peso',        key: 'weight',    width: 10 },
    { header: 'Temp.',       key: 'temp',      width: 10 },
    { header: 'Estado',      key: 'status',    width: 12 },
    { header: 'Total',       key: 'total',     width: 12 },
  ];

  return { rows, columns };
}

export async function getInventoryExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const products = await db.products
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt)
    .toArray();
  products.sort((a, b) => a.name.localeCompare(b.name));

  const rows = products.map((p) => ({
    name:        p.name,
    category:    PRODUCT_CAT[p.category] ?? p.category,
    description: p.description ?? '',
    stock:       p.currentStock,
    minStock:    p.minimumStock,
    unit:        p.unit ?? '',
    salePrice:   fmt.money(p.salePrice),
    costPrice:   fmt.money(p.costPrice),
    supplier:    p.supplier ?? '',
    expiration:  p.expirationDate ?? '',
    active:      fmt.bool(p.active),
    alertLevel:  p.currentStock <= 0 ? 'Sin stock' : p.currentStock <= p.minimumStock ? 'Stock bajo' : 'OK',
  }));

  const columns: ExportColumn[] = [
    { header: 'Producto',     key: 'name',        width: 24 },
    { header: 'Categoría',    key: 'category',    width: 16 },
    { header: 'Descripción',  key: 'description', width: 28 },
    { header: 'Stock',        key: 'stock',       width: 10 },
    { header: 'Stock mín.',   key: 'minStock',    width: 12 },
    { header: 'Unidad',       key: 'unit',        width: 12 },
    { header: 'Precio venta', key: 'salePrice',   width: 14 },
    { header: 'Precio costo', key: 'costPrice',   width: 14 },
    { header: 'Proveedor',    key: 'supplier',    width: 20 },
    { header: 'Vencimiento',  key: 'expiration',  width: 14 },
    { header: 'Activo',       key: 'active',      width: 10 },
    { header: 'Estado',       key: 'alertLevel',  width: 12 },
  ];

  return { rows, columns };
}

export async function getSalesExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const sales = await db.sales
    .where('clinicId').equals(clinicId)
    .filter((s) => !s.deletedAt)
    .toArray();
  sales.sort((a, b) => b.date.localeCompare(a.date));

  const patIds   = [...new Set(sales.map((s) => s.patientId).filter(Boolean) as string[])];
  const patients = await db.patients.bulkGet(patIds);
  const patMap   = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

  const rows = sales.flatMap((s) =>
    s.items.map((item, i) => ({
      date:     fmt.date(s.date),
      sale:     s.id.slice(-8).toUpperCase(),
      patient:  patMap.get(s.patientId ?? '')?.name ?? 'Anónimo',
      item:     item.description,
      qty:      item.quantity,
      unit:     fmt.money(item.unitPrice),
      subtotal: fmt.money(item.subtotal),
      discount: i === 0 ? fmt.money(s.discount) : '',
      total:    i === 0 ? fmt.money(s.total) : '',
      method:   i === 0 ? PAYMENT_METHOD[s.paymentMethod] ?? s.paymentMethod : '',
      status:   s.status === 'cancelled' ? 'Cancelada' : 'Completada',
    }))
  );

  const columns: ExportColumn[] = [
    { header: 'Fecha',       key: 'date',     width: 14 },
    { header: 'Venta #',     key: 'sale',     width: 12 },
    { header: 'Cliente',     key: 'patient',  width: 20 },
    { header: 'Artículo',    key: 'item',     width: 28 },
    { header: 'Cant.',       key: 'qty',      width: 8  },
    { header: 'P. Unitario', key: 'unit',     width: 14 },
    { header: 'Subtotal',    key: 'subtotal', width: 12 },
    { header: 'Descuento',   key: 'discount', width: 12 },
    { header: 'Total',       key: 'total',    width: 12 },
    { header: 'Método pago', key: 'method',   width: 16 },
    { header: 'Estado',      key: 'status',   width: 12 },
  ];

  return { rows, columns };
}

export async function getInvoicesExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const invoices = await db.invoices
    .where('clinicId').equals(clinicId)
    .filter((i) => !i.deletedAt)
    .toArray();
  invoices.sort((a, b) => b.date.localeCompare(a.date));

  const patIds   = [...new Set(invoices.map((i) => i.patientId).filter(Boolean) as string[])];
  const patients = await db.patients.bulkGet(patIds);
  const patMap   = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

  const ownerIds = [...new Set(invoices.map((i) => i.ownerId).filter(Boolean) as string[])];
  const owners   = await db.owners.bulkGet(ownerIds);
  const ownerMap = new Map(owners.filter(Boolean).map((o) => [o!.id, o!]));

  const rows = invoices.map((inv) => ({
    number:   inv.number ?? '',
    date:     fmt.date(inv.date),
    patient:  patMap.get(inv.patientId ?? '')?.name ?? '',
    owner:    ownerMap.get(inv.ownerId ?? '')?.name ?? '',
    subtotal: fmt.money(inv.subtotal),
    discount: fmt.money(inv.discount),
    total:    fmt.money(inv.total),
    paid:     fmt.money(inv.amountPaid),
    balance:  fmt.money(inv.total - inv.amountPaid),
    method:   PAYMENT_METHOD[inv.paymentMethod] ?? inv.paymentMethod,
    status:   INVOICE_STATUS[inv.status] ?? inv.status,
    items:    inv.items.map((it) => `${it.description} x${it.quantity}`).join(' | '),
  }));

  const columns: ExportColumn[] = [
    { header: 'Factura #',   key: 'number',   width: 16 },
    { header: 'Fecha',       key: 'date',     width: 14 },
    { header: 'Paciente',    key: 'patient',  width: 20 },
    { header: 'Propietario', key: 'owner',    width: 20 },
    { header: 'Subtotal',    key: 'subtotal', width: 12 },
    { header: 'Descuento',   key: 'discount', width: 12 },
    { header: 'Total',       key: 'total',    width: 12 },
    { header: 'Abonado',     key: 'paid',     width: 12 },
    { header: 'Saldo',       key: 'balance',  width: 12 },
    { header: 'Método pago', key: 'method',   width: 16 },
    { header: 'Estado',      key: 'status',   width: 14 },
    { header: 'Artículos',   key: 'items',    width: 40 },
  ];

  return { rows, columns };
}

export async function getServicesExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const services = await db.services
    .where('clinicId').equals(clinicId)
    .filter((s) => !s.deletedAt)
    .toArray();
  services.sort((a, b) => a.name.localeCompare(b.name));

  const rows = services.map((s) => ({
    name:        s.name,
    category:    SVC_CAT[s.category] ?? s.category,
    price:       fmt.money(s.price),
    description: s.description ?? '',
    active:      fmt.bool(s.active),
    created:     fmt.ts(s.createdAt),
  }));

  const columns: ExportColumn[] = [
    { header: 'Servicio',    key: 'name',        width: 24 },
    { header: 'Categoría',  key: 'category',    width: 16 },
    { header: 'Precio',     key: 'price',       width: 12 },
    { header: 'Descripción', key: 'description', width: 36 },
    { header: 'Activo',     key: 'active',      width: 10 },
    { header: 'Registro',   key: 'created',     width: 14 },
  ];

  return { rows, columns };
}

export async function getFinancesExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const payments = await db.payments
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt)
    .toArray();
  payments.sort((a, b) => b.date.localeCompare(a.date));

  const patIds   = [...new Set(payments.map((p) => p.patientId).filter(Boolean))];
  const patients = await db.patients.bulkGet(patIds);
  const patMap   = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

  const rows = payments.map((p) => ({
    date:    fmt.date(p.date),
    patient: patMap.get(p.patientId)?.name ?? '',
    concept: p.concept ?? '',
    type:    SVC_CAT[p.type] ?? p.type ?? '',
    amount:  fmt.money(p.amount),
    method:  PAYMENT_METHOD[p.paymentMethod] ?? p.paymentMethod,
    status:  PAYMENT_STATUS[p.status] ?? p.status,
    notes:   p.notes ?? '',
  }));

  const columns: ExportColumn[] = [
    { header: 'Fecha',       key: 'date',    width: 14 },
    { header: 'Paciente',    key: 'patient', width: 22 },
    { header: 'Concepto',    key: 'concept', width: 28 },
    { header: 'Tipo',        key: 'type',    width: 14 },
    { header: 'Monto',       key: 'amount',  width: 12 },
    { header: 'Método pago', key: 'method',  width: 16 },
    { header: 'Estado',      key: 'status',  width: 14 },
    { header: 'Notas',       key: 'notes',   width: 28 },
  ];

  return { rows, columns };
}

export async function getExpensesExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const expenses = await db.fixedExpenses
    .where('clinicId').equals(clinicId)
    .filter((e) => !e.deletedAt)
    .toArray();
  expenses.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  const expPayments = await db.expensePayments
    .where('clinicId').equals(clinicId)
    .toArray();
  const payByExpense = expPayments.reduce<Record<string, number>>((acc, p) => {
    acc[p.fixedExpenseId] = (acc[p.fixedExpenseId] ?? 0) + p.amount;
    return acc;
  }, {});

  const rows = expenses.map((e) => ({
    name:      e.name,
    category:  EXPENSE_CAT[e.category] ?? e.category,
    type:      e.expenseType === 'one_time' ? 'Único' : e.expenseType === 'daily' ? 'Diario' : 'Recurrente',
    amount:    fmt.money(e.amount),
    frequency: EXPENSE_FREQ[e.frequency] ?? e.frequency,
    dueDate:   fmt.date(e.nextDueDate),
    totalPaid: fmt.money(payByExpense[e.id] ?? 0),
    balance:   fmt.money(e.amount - (payByExpense[e.id] ?? 0)),
    active:    fmt.bool(e.active),
    notes:     e.notes ?? '',
  }));

  const columns: ExportColumn[] = [
    { header: 'Gasto',      key: 'name',      width: 24 },
    { header: 'Categoría',  key: 'category',  width: 16 },
    { header: 'Tipo',       key: 'type',      width: 12 },
    { header: 'Monto',      key: 'amount',    width: 12 },
    { header: 'Frecuencia', key: 'frequency', width: 14 },
    { header: 'Próx. pago', key: 'dueDate',   width: 14 },
    { header: 'Pagado',     key: 'totalPaid', width: 12 },
    { header: 'Saldo',      key: 'balance',   width: 12 },
    { header: 'Activo',     key: 'active',    width: 10 },
    { header: 'Notas',      key: 'notes',     width: 28 },
  ];

  return { rows, columns };
}

export async function getCollaboratorsExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const collabs  = await db.collaborators
    .where('clinicId').equals(clinicId)
    .filter((c) => !c.deletedAt)
    .toArray();
  collabs.sort((a, b) => a.name.localeCompare(b.name));

  const payments = await db.collaboratorPayments
    .where('clinicId').equals(clinicId)
    .toArray();
  const totalPaid = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.collaboratorId] = (acc[p.collaboratorId] ?? 0) + p.amount;
    return acc;
  }, {});

  const rows = collabs.map((c) => ({
    name:             c.name,
    role:             c.role ?? '',
    phone:            c.phone ?? '',
    salary:           fmt.money(c.salary),
    paymentFrequency: c.paymentFrequency ?? '',
    totalPaid:        fmt.money(totalPaid[c.id] ?? 0),
    active:           fmt.bool(c.active),
    notes:            c.notes ?? '',
    joined:           fmt.ts(c.createdAt),
  }));

  const columns: ExportColumn[] = [
    { header: 'Colaborador', key: 'name',             width: 22 },
    { header: 'Cargo',       key: 'role',             width: 16 },
    { header: 'Teléfono',    key: 'phone',            width: 14 },
    { header: 'Salario',     key: 'salary',           width: 12 },
    { header: 'Frecuencia',  key: 'paymentFrequency', width: 14 },
    { header: 'Total pago.', key: 'totalPaid',        width: 14 },
    { header: 'Activo',      key: 'active',           width: 10 },
    { header: 'Notas',       key: 'notes',            width: 28 },
    { header: 'Ingreso',     key: 'joined',           width: 14 },
  ];

  return { rows, columns };
}

export async function getPromotionsExportData(): Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }> {
  const clinicId = await getClinicaId();
  const promos   = await db.promotions
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt)
    .toArray();
  promos.sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));

  const rows = promos.map((p) => ({
    name:          p.name,
    description:   p.description ?? '',
    items:         p.items.length,
    originalTotal: fmt.money(p.originalTotal),
    total:         fmt.money(p.total),
    validFrom:     fmt.date(p.validFrom ?? ''),
    validUntil:    fmt.date(p.validUntil ?? ''),
    active:        fmt.bool(p.active),
    created:       fmt.ts(p.createdAt),
  }));

  const columns: ExportColumn[] = [
    { header: 'Promoción',    key: 'name',          width: 22 },
    { header: 'Descripción',  key: 'description',   width: 32 },
    { header: 'Artículos',    key: 'items',         width: 12 },
    { header: 'Total orig.',  key: 'originalTotal', width: 14 },
    { header: 'Total c/desc', key: 'total',         width: 14 },
    { header: 'Válida desde', key: 'validFrom',     width: 14 },
    { header: 'Válida hasta', key: 'validUntil',    width: 14 },
    { header: 'Activa',       key: 'active',        width: 10 },
    { header: 'Registro',     key: 'created',       width: 14 },
  ];

  return { rows, columns };
}
