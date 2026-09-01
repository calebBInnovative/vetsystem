import * as XLSX from 'xlsx';
import { db, getClinicId } from '@/lib/db/database';
import type { SyncQueueItem } from '@/lib/db/database';
import type { ProductLocal } from '@/types/inventory';
import type { ServiceLocal } from '@/types/service';
import type { FixedExpense, ExpenseCategory, ExpenseFrequency } from '@/types/expense';
import { calculateNextDueDate } from '@/types/expense';

// ─── Shared parse utilities ───────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeRaw(
  raw: Record<string, unknown>,
  colMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const nk = normalizeKey(key);
    result[colMap[nk] ?? key] = val;
  }
  return result;
}

function normalizeValue(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function parseBool(val: unknown, defaultVal = true): boolean {
  if (val === undefined || val === null || val === '') return defaultVal;
  const s = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'si', 'sí'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  return defaultVal;
}

async function parseFileToRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
}

function isEmptyRow(raw: Record<string, unknown>): boolean {
  return Object.values(raw).every((v) => v === '' || v == null);
}

// ─── Column header maps (Spanish / English → internal key) ───────────────────

const PRODUCT_COL_MAP: Record<string, string> = {
  'nombre': 'name', 'name': 'name',
  'categoria': 'category', 'category': 'category',
  'precio de venta': 'salePrice', 'precio venta': 'salePrice', 'saleprice': 'salePrice',
  'precio de costo': 'costPrice', 'precio costo': 'costPrice', 'costprice': 'costPrice',
  'stock actual': 'currentStock', 'currentstock': 'currentStock',
  'stock minimo': 'minStock', 'minstock': 'minStock',
  'unidad': 'unit', 'unit': 'unit',
  'activo': 'active', 'active': 'active',
};

const SERVICE_COL_MAP: Record<string, string> = {
  'nombre': 'name', 'name': 'name',
  'categoria': 'category', 'category': 'category',
  'precio': 'price', 'price': 'price',
  'descripcion': 'description', 'description': 'description',
  'activo': 'active', 'active': 'active',
};

const EXPENSE_COL_MAP: Record<string, string> = {
  'nombre': 'name', 'name': 'name',
  'monto': 'amount', 'amount': 'amount',
  'categoria': 'category', 'categoría': 'category', 'category': 'category',
  'frecuencia': 'frequency', 'frequency': 'frequency',
  'dia de pago': 'paymentDay', 'día de pago': 'paymentDay', 'paymentday': 'paymentDay',
};

// ─── Value maps (Spanish label → internal key) ────────────────────────────────

const PRODUCT_CAT_ES: Record<string, string> = {
  'medicamento': 'medication', 'medication': 'medication',
  'vacuna': 'vaccine', 'vaccine': 'vaccine',
  'antiparasitario': 'antiparasitic', 'antiparasitic': 'antiparasitic',
  'alimento': 'food', 'food': 'food',
  'accesorio': 'accessory', 'accessory': 'accessory',
  'higiene': 'hygiene', 'hygiene': 'hygiene',
  'cirugia': 'surgery', 'surgery': 'surgery',
  'laboratorio': 'laboratory', 'laboratory': 'laboratory',
  'otro': 'other', 'other': 'other',
};

const UNIT_ES: Record<string, string> = {
  'unidad': 'unit', 'unidades': 'unit', 'unit': 'unit',
  'caja': 'box', 'box': 'box',
  'botella': 'bottle', 'bottle': 'bottle',
  'ampolleta': 'ampoule', 'ampola': 'ampoule', 'ampoule': 'ampoule',
  'tableta': 'tablet', 'tabletas': 'tablet', 'tablet': 'tablet',
  'dosis': 'dose', 'dose': 'dose',
  'ml': 'ml', 'mililitro': 'ml', 'mililitros': 'ml',
  'mg': 'mg', 'miligramo': 'mg', 'miligramos': 'mg',
  'kg': 'kg', 'kilogramo': 'kg', 'kilogramos': 'kg',
  'gramo': 'gram', 'gramos': 'gram', 'gram': 'gram', 'g': 'gram',
  'litro': 'liter', 'litros': 'liter', 'liter': 'liter',
  'libra': 'pound', 'libras': 'pound', 'pound': 'pound', 'lb': 'pound',
};

const SERVICE_CAT_ES: Record<string, string> = {
  'consulta': 'consultation', 'consultation': 'consultation',
  'vacunacion': 'vaccination', 'vaccination': 'vaccination',
  'cirugia': 'surgery', 'surgery': 'surgery',
  'desparasitacion': 'deworming', 'deworming': 'deworming',
  'estetica': 'grooming', 'grooming': 'grooming',
  'laboratorio': 'laboratory', 'laboratory': 'laboratory',
  'emergencia': 'emergency', 'emergency': 'emergency',
  'otro': 'other', 'other': 'other',
};

const EXPENSE_CAT_ES: Record<string, string> = {
  'alquiler': 'rent', 'rent': 'rent',
  'servicios': 'services', 'services': 'services',
  'nomina': 'payroll', 'nómina': 'payroll', 'payroll': 'payroll',
  'seguro': 'insurance', 'insurance': 'insurance',
  'mantenimiento': 'maintenance', 'maintenance': 'maintenance',
  'otro': 'other', 'other': 'other',
};

const EXPENSE_FREQ_ES: Record<string, string> = {
  'mensual': 'monthly', 'monthly': 'monthly',
  'bimestral': 'bimonthly', 'bimonthly': 'bimonthly',
  'trimestral': 'quarterly', 'quarterly': 'quarterly',
  'semestral': 'semiannual', 'semiannual': 'semiannual',
  'anual': 'annual', 'annual': 'annual',
};

// ─── Products ─────────────────────────────────────────────────────────────────

export async function importProductsFromFile(file: File): Promise<{ imported: number; skipped: number }> {
  const rawRows = await parseFileToRows(file);
  const now = Date.now();
  const clinicId = await getClinicId();
  let skipped = 0;
  const items: ProductLocal[] = [];

  for (const raw of rawRows) {
    if (isEmptyRow(raw)) continue;
    const r = normalizeRaw(raw, PRODUCT_COL_MAP);
    const name = String(r['name'] ?? '').trim();
    const catNorm = normalizeValue(r['category']);
    const category = PRODUCT_CAT_ES[catNorm] ?? 'other';
    const unitNorm = normalizeValue(r['unit']);
    const unit = UNIT_ES[unitNorm] ?? 'unit';
    const salePrice = parseFloat(String(r['salePrice'] ?? ''));
    const costPrice = parseFloat(String(r['costPrice'] ?? ''));
    const currentStock = parseFloat(String(r['currentStock'] ?? ''));
    const minimumStock = parseFloat(String(r['minStock'] ?? ''));

    if (!name || isNaN(salePrice) || salePrice < 0) { skipped++; continue; }

    items.push({
      id: crypto.randomUUID(),
      clinicId,
      name,
      category: category as ProductLocal['category'],
      salePrice: isNaN(salePrice) ? undefined : salePrice,
      costPrice: isNaN(costPrice) ? undefined : costPrice,
      currentStock: isNaN(currentStock) ? 0 : currentStock,
      minimumStock: isNaN(minimumStock) ? 0 : minimumStock,
      unit: unit as ProductLocal['unit'],
      active: parseBool(r['active'], true),
      syncStatus: 'pending',
      updatedAt: now,
      createdAt: now,
    });
  }

  if (items.length === 0) throw new Error('No se encontraron filas válidas. Revisa el formato del archivo.');

  // Soft-delete all existing products
  const existing = await db.products
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt)
    .toArray();
  for (const p of existing) {
    await db.products.update(p.id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
    await db.syncQueue.add({
      collection: 'products', documentId: p.id,
      operation: 'delete', data: { id: p.id, deletedAt: now }, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }

  await db.products.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'products', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }

  return { imported: items.length, skipped };
}

// ─── Services ─────────────────────────────────────────────────────────────────

export async function importServicesFromFile(file: File): Promise<{ imported: number; skipped: number }> {
  const rawRows = await parseFileToRows(file);
  const now = Date.now();
  const clinicId = await getClinicId();
  let skipped = 0;
  const items: ServiceLocal[] = [];

  for (const raw of rawRows) {
    if (isEmptyRow(raw)) continue;
    const r = normalizeRaw(raw, SERVICE_COL_MAP);
    const name = String(r['name'] ?? '').trim();
    const catNorm = normalizeValue(r['category']);
    const category = SERVICE_CAT_ES[catNorm] ?? 'other';
    const price = parseFloat(String(r['price'] ?? ''));

    if (!name || isNaN(price) || price < 0) { skipped++; continue; }

    items.push({
      id: crypto.randomUUID(),
      clinicId,
      name,
      category: category as ServiceLocal['category'],
      price,
      description: String(r['description'] ?? '').trim() || undefined,
      active: parseBool(r['active'], true),
      syncStatus: 'pending',
      updatedAt: now,
      createdAt: now,
    });
  }

  if (items.length === 0) throw new Error('No se encontraron filas válidas. Revisa el formato del archivo.');

  // Soft-delete all existing services
  const existing = await db.services
    .where('clinicId').equals(clinicId)
    .filter((s) => !s.deletedAt)
    .toArray();
  for (const s of existing) {
    await db.services.update(s.id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
    await db.syncQueue.add({
      collection: 'services', documentId: s.id,
      operation: 'delete', data: { id: s.id, deletedAt: now }, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }

  await db.services.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'services', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }

  return { imported: items.length, skipped };
}

// ─── Expenses (recurring) ─────────────────────────────────────────────────────

export async function importExpensesFromFile(file: File): Promise<{ imported: number; skipped: number }> {
  const rawRows = await parseFileToRows(file);
  const now = Date.now();
  const clinicId = await getClinicId();
  let skipped = 0;
  const items: FixedExpense[] = [];

  for (const raw of rawRows) {
    if (isEmptyRow(raw)) continue;
    const r = normalizeRaw(raw, EXPENSE_COL_MAP);
    const name = String(r['name'] ?? '').trim();
    const amount = parseFloat(String(r['amount'] ?? ''));
    const catNorm = normalizeValue(r['category']);
    const category = (EXPENSE_CAT_ES[catNorm] ?? 'other') as ExpenseCategory;
    const freqNorm = normalizeValue(r['frequency']);
    const frequency = (EXPENSE_FREQ_ES[freqNorm] ?? 'monthly') as ExpenseFrequency;
    const paymentDayRaw = parseInt(String(r['paymentDay'] ?? '1'), 10);
    const paymentDay = isNaN(paymentDayRaw) || paymentDayRaw < 1 || paymentDayRaw > 28 ? 1 : paymentDayRaw;

    if (!name || isNaN(amount) || amount <= 0) { skipped++; continue; }

    items.push({
      id: crypto.randomUUID(),
      clinicId,
      name,
      amount,
      category,
      frequency,
      paymentDay,
      nextDueDate: calculateNextDueDate(new Date().toISOString().slice(0, 10), frequency, paymentDay),
      expenseType: 'recurring',
      active: true,
      syncStatus: 'pending',
      updatedAt: now,
      createdAt: now,
    });
  }

  if (items.length === 0) throw new Error('No se encontraron filas válidas. Revisa el formato del archivo.');

  // Soft-delete all existing recurring expenses
  const existing = await db.fixedExpenses
    .where('clinicId').equals(clinicId)
    .filter((e) => !e.deletedAt && (e.expenseType === 'recurring' || !e.expenseType))
    .toArray();
  for (const e of existing) {
    await db.fixedExpenses.update(e.id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
    await db.syncQueue.add({
      collection: 'fixedExpenses', documentId: e.id,
      operation: 'delete', data: { id: e.id, deletedAt: now }, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }

  await db.fixedExpenses.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'fixedExpenses', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }

  return { imported: items.length, skipped };
}
