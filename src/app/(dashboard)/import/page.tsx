'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Download, FileSpreadsheet, CheckCircle2,
  AlertCircle, ArrowLeft, Package, Stethoscope, ChevronRight,
  BookOpen, RotateCcw, Save, Receipt, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { db, getClinicId } from '@/lib/db/database';
import type { SyncQueueItem } from '@/lib/db/database';
import type { ProductLocal } from '@/types/inventory';
import type { ServiceLocal } from '@/types/service';
import type { InvoiceLocal } from '@/types/invoice';
import { INVOICE_STATUSES, INVOICE_PAYMENT_METHODS, type InvoiceStatus, type InvoicePaymentMethod } from '@/types/invoice';
import type { FixedExpense, ExpenseCategory, ExpenseFrequency } from '@/types/expense';
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES, calculateNextDueDate } from '@/types/expense';
import { CatalogImportPanel } from '@/components/catalog/CatalogImportPanel';
import { downloadProductTemplate } from '@/lib/inventory/productTemplate';

// ─── Valid value lists ────────────────────────────────────────────────────────

const VALID_PRODUCT_CATEGORIES = [
  'medication', 'vaccine', 'antiparasitic', 'food',
  'accessory', 'hygiene', 'surgery', 'laboratory', 'other',
] as const;

const VALID_MEASUREMENT_UNITS = [
  'unit', 'box', 'bottle', 'ampoule', 'tablet',
  'dose', 'ml', 'mg', 'kg', 'gram', 'liter', 'pound',
] as const;

const VALID_SERVICE_CATEGORIES = [
  'consultation', 'vaccination', 'surgery', 'deworming',
  'grooming', 'laboratory', 'emergency', 'other',
] as const;

type ValidProductCategory = typeof VALID_PRODUCT_CATEGORIES[number];
type ValidMeasurementUnit = typeof VALID_MEASUREMENT_UNITS[number];
type ValidServiceCategory = typeof VALID_SERVICE_CATEGORIES[number];

// ─── Spanish labels ───────────────────────────────────────────────────────────

const PRODUCT_CATEGORY_LABELS: Record<ValidProductCategory, string> = {
  medication: 'Medicamento', vaccine: 'Vacuna', antiparasitic: 'Antiparasitario',
  food: 'Alimento', accessory: 'Accesorio', hygiene: 'Higiene',
  surgery: 'Cirugía', laboratory: 'Laboratorio', other: 'Otro',
};

const UNIT_LABELS: Record<ValidMeasurementUnit, string> = {
  unit: 'Unidad', box: 'Caja', bottle: 'Botella', ampoule: 'Ampolleta',
  tablet: 'Tableta', dose: 'Dosis', ml: 'mL', mg: 'mg',
  kg: 'kg', gram: 'Gramo', liter: 'Litro', pound: 'Libra',
};

const SERVICE_CATEGORY_LABELS: Record<ValidServiceCategory, string> = {
  consultation: 'Consulta', vaccination: 'Vacunación', surgery: 'Cirugía',
  deworming: 'Desparasitación', grooming: 'Estética', laboratory: 'Laboratorio',
  emergency: 'Emergencia', other: 'Otro',
};

// ─── Column header maps (Spanish / English → internal key) ───────────────────

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeRaw(raw: Record<string, unknown>, colMap: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const nk = normalizeKey(key);
    result[colMap[nk] ?? key] = val;
  }
  return result;
}

function normalizeValue(val: unknown): string {
  return String(val ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const PRODUCT_COL_MAP: Record<string, string> = {
  'nombre': 'name',
  'categoria': 'category',
  'precio de venta': 'salePrice',
  'precio venta': 'salePrice',
  'precio de costo': 'costPrice',
  'precio costo': 'costPrice',
  'stock actual': 'currentStock',
  'stock minimo': 'minStock',
  'unidad': 'unit',
  'activo': 'active',
  // English fallback (backward compat)
  'name': 'name', 'category': 'category', 'saleprice': 'salePrice',
  'costprice': 'costPrice', 'currentstock': 'currentStock',
  'minstock': 'minStock', 'unit': 'unit', 'active': 'active',
};

const SERVICE_COL_MAP: Record<string, string> = {
  'nombre': 'name',
  'categoria': 'category',
  'precio': 'price',
  'descripcion': 'description',
  'activo': 'active',
  'name': 'name', 'category': 'category', 'price': 'price',
  'description': 'description', 'active': 'active',
};

// ─── Reverse value maps (Spanish label → English key) ─────────────────────────

const PRODUCT_CAT_ES: Record<string, ValidProductCategory> = {
  'medicamento': 'medication',    'medication': 'medication',
  'vacuna': 'vaccine',            'vaccine': 'vaccine',
  'antiparasitario': 'antiparasitic', 'antiparasitic': 'antiparasitic',
  'alimento': 'food',             'food': 'food',
  'accesorio': 'accessory',       'accessory': 'accessory',
  'higiene': 'hygiene',           'hygiene': 'hygiene',
  'cirugia': 'surgery',           'surgery': 'surgery',
  'laboratorio': 'laboratory',    'laboratory': 'laboratory',
  'otro': 'other',                'other': 'other',
};

const UNIT_ES: Record<string, ValidMeasurementUnit> = {
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
  'litro': 'liter', 'litros': 'liter', 'liter': 'liter', 'l': 'liter',
  'libra': 'pound', 'libras': 'pound', 'pound': 'pound', 'lb': 'pound',
};

const SERVICE_CAT_ES: Record<string, ValidServiceCategory> = {
  'consulta': 'consultation',         'consultation': 'consultation',
  'vacunacion': 'vaccination',        'vaccination': 'vaccination',
  'cirugia': 'surgery',               'surgery': 'surgery',
  'desparasitacion': 'deworming',     'deworming': 'deworming',
  'estetica': 'grooming',             'grooming': 'grooming',
  'laboratorio': 'laboratory',        'laboratory': 'laboratory',
  'emergencia': 'emergency',          'emergency': 'emergency',
  'otro': 'other',                    'other': 'other',
};

// ─── Invoice + expense valid values ──────────────────────────────────────────

const VALID_INVOICE_STATUSES   = ['paid', 'pending', 'partially_paid', 'cancelled'] as const;
const VALID_INVOICE_METHODS    = ['cash', 'card', 'transfer', 'mixed'] as const;
const VALID_EXPENSE_CATEGORIES = ['rent', 'services', 'payroll', 'insurance', 'maintenance', 'other'] as const;
const VALID_EXPENSE_FREQUENCIES = ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;

const INVOICE_STATUS_ES: Record<string, InvoiceStatus> = {
  'pagado': 'paid',            'paid': 'paid',
  'pendiente': 'pending',      'pending': 'pending',
  'parcial': 'partially_paid', 'parcialmente pagado': 'partially_paid', 'partially_paid': 'partially_paid',
  'cancelado': 'cancelled',    'cancelled': 'cancelled',
};

const INVOICE_METHOD_ES: Record<string, InvoicePaymentMethod> = {
  'efectivo': 'cash',       'cash': 'cash',
  'tarjeta': 'card',        'card': 'card',
  'transferencia': 'transfer', 'transfer': 'transfer',
  'mixto': 'mixed',         'mixed': 'mixed',
};

const EXPENSE_CAT_ES: Record<string, ExpenseCategory> = {
  'alquiler': 'rent',       'rent': 'rent',
  'servicios': 'services',  'services': 'services',
  'nomina': 'payroll',      'nómina': 'payroll', 'payroll': 'payroll',
  'seguro': 'insurance',    'insurance': 'insurance',
  'mantenimiento': 'maintenance', 'maintenance': 'maintenance',
  'otro': 'other',          'other': 'other',
};

const EXPENSE_FREQ_ES: Record<string, ExpenseFrequency> = {
  'mensual': 'monthly',     'monthly': 'monthly',
  'bimestral': 'bimonthly', 'bimonthly': 'bimonthly',
  'trimestral': 'quarterly', 'quarterly': 'quarterly',
  'semestral': 'semiannual', 'semiannual': 'semiannual',
  'anual': 'annual',        'annual': 'annual',
};

const INVOICE_COL_MAP: Record<string, string> = {
  'fecha': 'date', 'date': 'date',
  'descripcion': 'description', 'descripción': 'description', 'description': 'description',
  'cantidad': 'quantity', 'quantity': 'quantity',
  'precio unitario': 'unitPrice', 'precio': 'unitPrice', 'unitprice': 'unitPrice',
  'descuento': 'discount', 'discount': 'discount',
  'metodo de pago': 'paymentMethod', 'método de pago': 'paymentMethod', 'paymentmethod': 'paymentMethod',
  'estado': 'status', 'status': 'status',
  'notas': 'notes', 'notes': 'notes',
};

const EXPENSE_COL_MAP: Record<string, string> = {
  'nombre': 'name', 'name': 'name',
  'monto': 'amount', 'amount': 'amount',
  'categoria': 'category', 'categoría': 'category', 'category': 'category',
  'frecuencia': 'frequency', 'frequency': 'frequency',
  'dia de pago': 'paymentDay', 'día de pago': 'paymentDay', 'paymentday': 'paymentDay',
};

// ─── Row types ────────────────────────────────────────────────────────────────

type ProductField = 'name' | 'category' | 'salePrice' | 'costPrice' | 'currentStock' | 'minimumStock' | 'unit' | 'active';
type ServiceField = 'name' | 'category' | 'price' | 'description' | 'active';

interface ProductRow {
  rowNum: number;
  name: string;
  category: string;
  salePrice: string;
  costPrice: string;
  currentStock: string;
  minimumStock: string;
  unit: string;
  active: string;
  fieldErrors: Partial<Record<ProductField, string>>;
}

interface ServiceRow {
  rowNum: number;
  name: string;
  category: string;
  price: string;
  description: string;
  active: string;
  fieldErrors: Partial<Record<ServiceField, string>>;
}

interface InvoiceImportRow {
  rowNum: number;
  date: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  paymentMethod: string;
  status: string;
  notes: string;
  fieldErrors: Partial<Record<'date' | 'description' | 'quantity' | 'unitPrice' | 'paymentMethod' | 'status', string>>;
}

interface ExpenseImportRow {
  rowNum: number;
  name: string;
  amount: string;
  category: string;
  frequency: string;
  paymentDay: string;
  fieldErrors: Partial<Record<'name' | 'amount' | 'category' | 'frequency' | 'paymentDay', string>>;
}

type ImportStep = 'upload' | 'table' | 'success';
type MainTab = 'import' | 'export';
type SubTab = 'products' | 'services' | 'catalog' | 'invoices' | 'expenses';

// ─── Validation ───────────────────────────────────────────────────────────────

function validateProductRow(row: ProductRow): Partial<Record<ProductField, string>> {
  const errors: Partial<Record<ProductField, string>> = {};

  if (!row.name.trim()) errors.name = 'Requerido';

  if (!row.category) {
    errors.category = 'Requerido';
  } else if (!VALID_PRODUCT_CATEGORIES.includes(row.category as ValidProductCategory)) {
    errors.category = 'Categoría inválida';
  }

  const sp = parseFloat(row.salePrice);
  if (!row.salePrice.trim() || isNaN(sp) || sp < 0) {
    errors.salePrice = 'Número mayor o igual a 0 requerido';
  }

  if (row.costPrice.trim()) {
    const cp = parseFloat(row.costPrice);
    if (isNaN(cp) || cp < 0) errors.costPrice = 'Debe ser mayor o igual a 0';
  }

  if (row.currentStock.trim()) {
    const cs = parseFloat(row.currentStock);
    if (isNaN(cs) || cs < 0) errors.currentStock = 'Debe ser mayor o igual a 0';
  }

  if (row.minimumStock.trim()) {
    const ms = parseFloat(row.minimumStock);
    if (isNaN(ms) || ms < 0) errors.minimumStock = 'Debe ser mayor o igual a 0';
  }

  if (row.unit && !VALID_MEASUREMENT_UNITS.includes(row.unit as ValidMeasurementUnit)) {
    errors.unit = 'Unidad inválida';
  }

  return errors;
}

function validateServiceRow(row: ServiceRow): Partial<Record<ServiceField, string>> {
  const errors: Partial<Record<ServiceField, string>> = {};

  if (!row.name.trim()) errors.name = 'Requerido';

  if (!row.category) {
    errors.category = 'Requerido';
  } else if (!VALID_SERVICE_CATEGORIES.includes(row.category as ValidServiceCategory)) {
    errors.category = 'Categoría inválida';
  }

  const p = parseFloat(row.price);
  if (!row.price.trim() || isNaN(p) || p < 0) {
    errors.price = 'Número mayor o igual a 0 requerido';
  }

  return errors;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseBoolStr(val: unknown, defaultVal = true): string {
  if (val === undefined || val === null || val === '') return defaultVal ? 'true' : 'false';
  const s = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'si', 'sí'].includes(s)) return 'true';
  if (['false', '0', 'no'].includes(s)) return 'false';
  return defaultVal ? 'true' : 'false';
}

async function parseFileToRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
}

function rawToProductRows(rawRows: Record<string, unknown>[]): ProductRow[] {
  return rawRows
    .filter((raw) => !Object.values(raw).every((v) => v === undefined || v === null || v === ''))
    .map((raw, i) => {
      const r = normalizeRaw(raw, PRODUCT_COL_MAP);
      const catNorm  = normalizeValue(r['category']);
      const unitNorm = normalizeValue(r['unit']);
      const row: ProductRow = {
        rowNum:       i + 2,
        name:         String(r['name']         ?? '').trim(),
        category:     PRODUCT_CAT_ES[catNorm]  ?? catNorm,
        salePrice:    String(r['salePrice']    ?? '').trim(),
        costPrice:    String(r['costPrice']    ?? '').trim(),
        currentStock: String(r['currentStock'] ?? '').trim(),
        minimumStock: String(r['minStock']     ?? '').trim(),
        unit:         UNIT_ES[unitNorm]        ?? unitNorm,
        active:       parseBoolStr(r['active'], true),
        fieldErrors:  {},
      };
      row.fieldErrors = validateProductRow(row);
      return row;
    });
}

function rawToServiceRows(rawRows: Record<string, unknown>[]): ServiceRow[] {
  return rawRows
    .filter((raw) => !Object.values(raw).every((v) => v === undefined || v === null || v === ''))
    .map((raw, i) => {
      const r = normalizeRaw(raw, SERVICE_COL_MAP);
      const catNorm = normalizeValue(r['category']);
      const row: ServiceRow = {
        rowNum:      i + 2,
        name:        String(r['name']        ?? '').trim(),
        category:    SERVICE_CAT_ES[catNorm] ?? catNorm,
        price:       String(r['price']       ?? '').trim(),
        description: String(r['description'] ?? '').trim(),
        active:      parseBoolStr(r['active'], true),
        fieldErrors: {},
      };
      row.fieldErrors = validateServiceRow(row);
      return row;
    });
}

// ─── Template generators ──────────────────────────────────────────────────────

function downloadServiceTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Nombre', 'Categoría', 'Precio', 'Descripción', 'Activo'],
    ['Consulta general',       'Consulta',    300, 'Revisión clínica general',      'Sí'],
    ['Vacunación antirrábica', 'Vacunación',  250, 'Incluye vacuna y certificado',  'Sí'],
    ['Baño y corte',           'Estética',    400, 'Servicio de estética completo', 'Sí'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 35 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Servicios');

  const opts: (string | null)[][] = [
    ['CATEGORÍAS VÁLIDAS'],
    ['Consulta'], ['Vacunación'], ['Cirugía'], ['Desparasitación'],
    ['Estética'], ['Laboratorio'], ['Emergencia'], ['Otro'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(opts);
  ws2['!cols'] = [{ wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Opciones_válidas');
  XLSX.writeFile(wb, 'plantilla_servicios.xlsx');
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function exportProducts() {
  const clinicId = await getClinicId();
  const products = await db.products
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt && p.active !== false)
    .toArray();
  const rows = products.map((p) => ({
    name: p.name, category: p.category,
    salePrice: p.salePrice ?? '', costPrice: p.costPrice ?? '',
    currentStock: p.currentStock, minStock: p.minimumStock,
    unit: p.unit, active: p.active,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['name', 'category', 'salePrice', 'costPrice', 'currentStock', 'minStock', 'unit', 'active'],
  });
  ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, `productos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportServices() {
  const clinicId = await getClinicId();
  const services = await db.services
    .where('clinicId').equals(clinicId)
    .filter((s) => !s.deletedAt && s.active !== false)
    .toArray();
  const rows = services.map((s) => ({
    name: s.name, category: s.category, price: s.price,
    description: s.description ?? '', active: s.active,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['name', 'category', 'price', 'description', 'active'],
  });
  ws['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 10 }, { wch: 35 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Servicios');
  XLSX.writeFile(wb, `servicios_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Import into Dexie ────────────────────────────────────────────────────────

async function importProductRows(rows: ProductRow[]): Promise<number> {
  const valid = rows.filter((r) => Object.keys(r.fieldErrors).length === 0);
  if (valid.length === 0) return 0;
  const now = Date.now();
  const clinicId = await getClinicId();
  const items: ProductLocal[] = valid.map((row) => ({
    id:           crypto.randomUUID(),
    clinicId,
    name:         row.name.trim(),
    category:     row.category as ValidProductCategory,
    salePrice:    row.salePrice.trim() ? parseFloat(row.salePrice) : undefined,
    costPrice:    row.costPrice.trim() ? parseFloat(row.costPrice) : undefined,
    currentStock: row.currentStock.trim() ? parseFloat(row.currentStock) : 0,
    minimumStock: row.minimumStock.trim() ? parseFloat(row.minimumStock) : 0,
    unit:         (row.unit || 'unit') as ValidMeasurementUnit,
    active:       row.active !== 'false',
    syncStatus:   'pending' as const,
    updatedAt:    now,
    createdAt:    now,
  }));
  await db.products.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'products', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }
  return items.length;
}

async function importServiceRows(rows: ServiceRow[]): Promise<number> {
  const valid = rows.filter((r) => Object.keys(r.fieldErrors).length === 0);
  if (valid.length === 0) return 0;
  const now = Date.now();
  const clinicId = await getClinicId();
  const items: ServiceLocal[] = valid.map((row) => ({
    id:          crypto.randomUUID(),
    clinicId,
    name:        row.name.trim(),
    category:    row.category as ValidServiceCategory,
    price:       parseFloat(row.price),
    description: row.description.trim() || undefined,
    active:      row.active !== 'false',
    syncStatus:  'pending' as const,
    updatedAt:   now,
    createdAt:   now,
  }));
  await db.services.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'services', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }
  return items.length;
}

// ─── Invoice validation / parsing / import ────────────────────────────────────

function validateInvoiceRow(row: InvoiceImportRow): InvoiceImportRow['fieldErrors'] {
  const errors: InvoiceImportRow['fieldErrors'] = {};
  if (!row.date.trim()) errors.date = 'Requerido';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date.trim())) errors.date = 'Formato YYYY-MM-DD';
  if (!row.description.trim()) errors.description = 'Requerido';
  const qty = parseFloat(row.quantity);
  if (!row.quantity.trim() || isNaN(qty) || qty <= 0) errors.quantity = 'Mayor que 0';
  const price = parseFloat(row.unitPrice);
  if (!row.unitPrice.trim() || isNaN(price) || price < 0) errors.unitPrice = 'Número ≥ 0 requerido';
  if (!VALID_INVOICE_METHODS.includes(row.paymentMethod as typeof VALID_INVOICE_METHODS[number]))
    errors.paymentMethod = 'Método inválido';
  if (!VALID_INVOICE_STATUSES.includes(row.status as typeof VALID_INVOICE_STATUSES[number]))
    errors.status = 'Estado inválido';
  return errors;
}

function rawToInvoiceRows(rawRows: Record<string, unknown>[]): InvoiceImportRow[] {
  return rawRows
    .filter((raw) => !Object.values(raw).every((v) => v === undefined || v === null || v === ''))
    .map((raw, i) => {
      const r    = normalizeRaw(raw, INVOICE_COL_MAP);
      const meth = normalizeValue(r['paymentMethod']);
      const stat = normalizeValue(r['status']);
      const row: InvoiceImportRow = {
        rowNum:        i + 2,
        date:          String(r['date']          ?? '').trim(),
        description:   String(r['description']   ?? '').trim(),
        quantity:      String(r['quantity']       ?? '1').trim(),
        unitPrice:     String(r['unitPrice']      ?? '').trim(),
        discount:      String(r['discount']       ?? '0').trim(),
        paymentMethod: INVOICE_METHOD_ES[meth]   ?? meth,
        status:        INVOICE_STATUS_ES[stat]   ?? stat,
        notes:         String(r['notes']          ?? '').trim(),
        fieldErrors:   {},
      };
      row.fieldErrors = validateInvoiceRow(row);
      return row;
    });
}

async function importInvoiceRows(rows: InvoiceImportRow[]): Promise<number> {
  const valid = rows.filter((r) => Object.keys(r.fieldErrors).length === 0);
  if (valid.length === 0) return 0;
  const now = Date.now();
  const clinicId = await getClinicId();
  const counter = await db.invoices.where('clinicId').equals(clinicId).count();
  const items: InvoiceLocal[] = valid.map((row, idx) => {
    const qty      = parseFloat(row.quantity);
    const price    = parseFloat(row.unitPrice);
    const disc     = parseFloat(row.discount) || 0;
    const subtotal = qty * price;
    const total    = Math.max(0, subtotal - disc);
    const num      = String(counter + idx + 1).padStart(4, '0');
    return {
      id:            crypto.randomUUID(),
      clinicId,
      number:        `FAC-${new Date(row.date).getFullYear()}-${num}`,
      date:          row.date.trim(),
      items: [{
        id:          crypto.randomUUID(),
        description: row.description.trim(),
        quantity:    qty,
        unitPrice:   price,
        subtotal:    subtotal,
        type:        'service' as const,
      }],
      subtotal,
      discount:      disc,
      total,
      paymentMethod: row.paymentMethod as InvoicePaymentMethod,
      status:        row.status as InvoiceStatus,
      amountPaid:    row.status === 'paid' ? total : 0,
      notes:         row.notes || undefined,
      syncStatus:    'pending' as const,
      updatedAt:     now,
      createdAt:     now,
    };
  });
  await db.invoices.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'invoices', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }
  return items.length;
}

// ─── Expense validation / parsing / import ────────────────────────────────────

function validateExpenseRow(row: ExpenseImportRow): ExpenseImportRow['fieldErrors'] {
  const errors: ExpenseImportRow['fieldErrors'] = {};
  if (!row.name.trim()) errors.name = 'Requerido';
  const amt = parseFloat(row.amount);
  if (!row.amount.trim() || isNaN(amt) || amt <= 0) errors.amount = 'Mayor que 0';
  if (!VALID_EXPENSE_CATEGORIES.includes(row.category as typeof VALID_EXPENSE_CATEGORIES[number]))
    errors.category = 'Categoría inválida';
  if (!VALID_EXPENSE_FREQUENCIES.includes(row.frequency as typeof VALID_EXPENSE_FREQUENCIES[number]))
    errors.frequency = 'Frecuencia inválida';
  const day = parseInt(row.paymentDay, 10);
  if (!row.paymentDay.trim() || isNaN(day) || day < 1 || day > 28) errors.paymentDay = 'Día 1–28';
  return errors;
}

function rawToExpenseRows(rawRows: Record<string, unknown>[]): ExpenseImportRow[] {
  return rawRows
    .filter((raw) => !Object.values(raw).every((v) => v === undefined || v === null || v === ''))
    .map((raw, i) => {
      const r    = normalizeRaw(raw, EXPENSE_COL_MAP);
      const cat  = normalizeValue(r['category']);
      const freq = normalizeValue(r['frequency']);
      const row: ExpenseImportRow = {
        rowNum:     i + 2,
        name:       String(r['name']       ?? '').trim(),
        amount:     String(r['amount']     ?? '').trim(),
        category:   EXPENSE_CAT_ES[cat]   ?? cat,
        frequency:  EXPENSE_FREQ_ES[freq] ?? freq,
        paymentDay: String(r['paymentDay'] ?? '').trim(),
        fieldErrors: {},
      };
      row.fieldErrors = validateExpenseRow(row);
      return row;
    });
}

async function importExpenseRows(rows: ExpenseImportRow[]): Promise<number> {
  const valid = rows.filter((r) => Object.keys(r.fieldErrors).length === 0);
  if (valid.length === 0) return 0;
  const now = Date.now();
  const clinicId = await getClinicId();
  const items = valid.map((row) => {
    const day = parseInt(row.paymentDay, 10);
    const freq = row.frequency as ExpenseFrequency;
    return {
      id:          crypto.randomUUID(),
      clinicId,
      name:        row.name.trim(),
      amount:      parseFloat(row.amount),
      category:    row.category as ExpenseCategory,
      frequency:   freq,
      paymentDay:  day,
      nextDueDate: calculateNextDueDate(new Date().toISOString().slice(0, 10), freq, day),
      active:      true,
      syncStatus:  'pending' as const,
      updatedAt:   now,
      createdAt:   now,
    };
  });
  await db.fixedExpenses.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'fixedExpenses', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }
  return items.length;
}

// ─── Invoice + expense template download ──────────────────────────────────────

function downloadInvoiceTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Fecha', 'Descripción', 'Cantidad', 'Precio unitario', 'Descuento', 'Método de pago', 'Estado', 'Notas'],
    ['2026-08-01', 'Consulta general', 1, 300, 0, 'Efectivo', 'Pagado', ''],
    ['2026-08-05', 'Vacuna antirrábica', 1, 250, 50, 'Tarjeta', 'Pendiente', 'Recordar proxima dosis'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
  const opts: string[][] = [
    ['ESTADOS VÁLIDOS', '', 'MÉTODOS DE PAGO'],
    ['Pagado',   '', 'Efectivo'],
    ['Pendiente','', 'Tarjeta'],
    ['Parcial',  '', 'Transferencia'],
    ['Cancelado','', 'Mixto'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(opts);
  ws2['!cols'] = [{ wch: 14 }, { wch: 4 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Opciones_válidas');
  XLSX.writeFile(wb, 'plantilla_facturas.xlsx');
}

function downloadExpenseTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Nombre', 'Monto', 'Categoría', 'Frecuencia', 'Día de pago'],
    ['Alquiler local',   1500, 'Alquiler',     'Mensual',   1],
    ['Agua y luz',        200, 'Servicios',    'Mensual',  15],
    ['Salario asistente',3000, 'Nómina',       'Mensual',  28],
    ['Seguro local',      800, 'Seguro',       'Semestral', 5],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
  const opts: string[][] = [
    ['CATEGORÍAS', '', 'FRECUENCIAS'],
    ['Alquiler',      '', 'Mensual'],
    ['Servicios',     '', 'Bimestral'],
    ['Nómina',        '', 'Trimestral'],
    ['Seguro',        '', 'Semestral'],
    ['Mantenimiento', '', 'Anual'],
    ['Otro',          '', ''],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(opts);
  ws2['!cols'] = [{ wch: 14 }, { wch: 4 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Opciones_válidas');
  XLSX.writeFile(wb, 'plantilla_gastos.xlsx');
}

// ─── Invoice + expense export ─────────────────────────────────────────────────

async function exportInvoices() {
  const clinicId = await getClinicId();
  const invoices = await db.invoices
    .where('clinicId').equals(clinicId)
    .filter((inv) => !inv.deletedAt)
    .toArray();
  invoices.sort((a, b) => a.date.localeCompare(b.date));
  const rows = invoices.map((inv) => ({
    'Número':         inv.number,
    'Fecha':          inv.date,
    'Descripción':    inv.items.map((it) => `${it.description} ×${it.quantity}`).join(' | '),
    'Subtotal':       inv.subtotal,
    'Descuento':      inv.discount,
    'Total':          inv.total,
    'Método de pago': INVOICE_PAYMENT_METHODS[inv.paymentMethod]?.label ?? inv.paymentMethod,
    'Estado':         INVOICE_STATUSES[inv.status]?.label ?? inv.status,
    'Monto pagado':   inv.amountPaid,
    'Notas':          inv.notes ?? '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
  XLSX.writeFile(wb, `facturas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportExpenses() {
  const clinicId = await getClinicId();
  const [expenses, payments] = await Promise.all([
    db.fixedExpenses.where('clinicId').equals(clinicId).filter((e) => !e.deletedAt).toArray(),
    db.expensePayments.where('clinicId').equals(clinicId).filter((p) => !p.deletedAt).toArray(),
  ]);
  const expenseMap = new Map((expenses as FixedExpense[]).map((e) => [e.id, e.name]));
  const wb = XLSX.utils.book_new();

  // Sheet 1: recurring expense definitions
  const expRows = (expenses as FixedExpense[]).map((e) => ({
    'Nombre':        e.name,
    'Monto':         e.amount,
    'Categoría':     EXPENSE_CATEGORIES[e.category as ExpenseCategory] ?? e.category,
    'Frecuencia':    EXPENSE_FREQUENCIES[e.frequency as ExpenseFrequency] ?? e.frequency,
    'Día de pago':   e.paymentDay,
    'Próximo pago':  e.nextDueDate,
    'Activo':        e.active ? 'Sí' : 'No',
  }));
  const ws1 = XLSX.utils.json_to_sheet(expRows);
  ws1['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Gastos fijos');

  // Sheet 2: payment history
  const payRows = payments.map((p) => ({
    'Gasto':          expenseMap.get(p.fixedExpenseId) ?? p.fixedExpenseId,
    'Fecha de pago':  p.paymentDate,
    'Monto pagado':   p.amount,
    'Notas':          p.notes ?? '',
  }));
  const ws2 = XLSX.utils.json_to_sheet(payRows.length > 0 ? payRows : [{ 'Gasto': '', 'Fecha de pago': '', 'Monto pagado': '', 'Notas': '' }]);
  ws2['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Historial de pagos');

  XLSX.writeFile(wb, `gastos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Draft persistence ────────────────────────────────────────────────────────

const PRODUCT_DRAFT_KEY  = 'vetsys-import-draft-products';
const SERVICE_DRAFT_KEY  = 'vetsys-import-draft-services';
const INVOICE_DRAFT_KEY  = 'vetsys-import-draft-invoices';
const EXPENSE_DRAFT_KEY  = 'vetsys-import-draft-expenses';

interface ImportDraftPayload<T> {
  rows: T[];
  savedAt: number;
}

function saveDraft<T>(key: string, rows: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ rows, savedAt: Date.now() }));
  } catch { /* storage full */ }
}

function loadDraft<T>(key: string): ImportDraftPayload<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ImportDraftPayload<T>) : null;
  } catch { return null; }
}

function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function formatTimeAgo(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1)  return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h} hora${h !== 1 ? 's' : ''}`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d !== 1 ? 's' : ''}`;
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleDragOver  = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleChange    = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  }, [onFile]);

  return (
    <div
      role="button" tabIndex={0} aria-label="Zona de arrastre"
      className={cn(
        'border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none',
        isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
      )}
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
    >
      <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', isDragging ? 'bg-primary/10' : 'bg-muted')}>
        <Upload size={26} className={isDragging ? 'text-primary' : 'text-muted-foreground'} />
      </div>
      <div className="text-center">
        <p className="font-medium text-sm">
          Arrastra tu archivo aquí o{' '}
          <span className="text-primary underline underline-offset-2">haz clic para seleccionar</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls o .csv</p>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleChange} />
    </div>
  );
}

// ─── Editable cell components ─────────────────────────────────────────────────

const BASE = 'w-full px-2 py-1.5 text-sm rounded border bg-transparent focus:outline-none focus:ring-1 transition-colors';
const OK   = 'border-transparent hover:border-border focus:border-primary focus:ring-primary/20';
const ERR  = 'border-red-400 bg-red-50/60 dark:bg-red-950/30 focus:ring-red-400/30';

function TextCell({ value, error, placeholder, type = 'text', onChange }: {
  value: string; error?: string; placeholder?: string;
  type?: 'text' | 'number'; onChange: (v: string) => void;
}) {
  return (
    <div>
      <input
        type="text"
        inputMode={type === 'number' ? 'numeric' : 'text'}
        value={value}
        placeholder={placeholder}
        title={error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(BASE, error ? ERR : OK)}
      />
      {error && <p className="text-[10px] leading-tight text-red-500 mt-0.5 px-0.5">{error}</p>}
    </div>
  );
}

function SelectCell({ value, error, options, placeholder = '— Seleccionar —', onChange }: {
  value: string; error?: string; placeholder?: string;
  options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <select
        value={value} title={error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(BASE, error ? ERR : OK, 'cursor-pointer')}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-[10px] leading-tight text-red-500 mt-0.5 px-0.5">{error}</p>}
    </div>
  );
}

// ─── Select option lists ──────────────────────────────────────────────────────

const PRODUCT_CAT_OPTS = VALID_PRODUCT_CATEGORIES.map((v) => ({ value: v, label: PRODUCT_CATEGORY_LABELS[v] }));
const UNIT_OPTS        = VALID_MEASUREMENT_UNITS.map((v)   => ({ value: v, label: UNIT_LABELS[v] }));
const SERVICE_CAT_OPTS = VALID_SERVICE_CATEGORIES.map((v)  => ({ value: v, label: SERVICE_CATEGORY_LABELS[v] }));
const ACTIVE_OPTS      = [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }];

// ─── Product editable table ───────────────────────────────────────────────────

function ProductTable({ rows, onChange }: { rows: ProductRow[]; onChange: (r: ProductRow[]) => void }) {
  const updateRow = useCallback((idx: number, field: ProductField, value: string) => {
    onChange(rows.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      updated.fieldErrors = validateProductRow(updated);
      return updated;
    }));
  }, [rows, onChange]);

  const deleteRow = useCallback((idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  }, [rows, onChange]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border text-left">
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-10">#</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[160px]">Nombre <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[140px]">Categoría <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px]">Precio venta <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px]">Precio costo</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[90px]">Stock actual</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[90px]">Stock mínimo</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px]">Unidad</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[75px]">Activo</th>
            <th className="px-2 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const hasError = Object.keys(row.fieldErrors).length > 0;
            return (
              <tr key={idx} className={cn(
                'border-b border-border last:border-0 align-top',
                hasError ? 'bg-red-50/30 dark:bg-red-950/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
              )}>
                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                    hasError
                      ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {hasError ? '!' : row.rowNum}
                  </span>
                </td>
                <td className="px-2 py-2"><TextCell value={row.name} error={row.fieldErrors.name} placeholder="Nombre" onChange={(v) => updateRow(idx, 'name', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.category} error={row.fieldErrors.category} options={PRODUCT_CAT_OPTS} onChange={(v) => updateRow(idx, 'category', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.salePrice} error={row.fieldErrors.salePrice} placeholder="0.00" type="number" onChange={(v) => updateRow(idx, 'salePrice', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.costPrice} error={row.fieldErrors.costPrice} placeholder="0.00" type="number" onChange={(v) => updateRow(idx, 'costPrice', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.currentStock} error={row.fieldErrors.currentStock} placeholder="0" type="number" onChange={(v) => updateRow(idx, 'currentStock', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.minimumStock} error={row.fieldErrors.minimumStock} placeholder="0" type="number" onChange={(v) => updateRow(idx, 'minimumStock', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.unit} error={row.fieldErrors.unit} options={UNIT_OPTS} placeholder="Unidad" onChange={(v) => updateRow(idx, 'unit', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.active} options={ACTIVE_OPTS} onChange={(v) => updateRow(idx, 'active', v)} /></td>
                <td className="px-2 py-2 text-center">
                  <button onClick={() => deleteRow(idx)} title="Eliminar fila" className="text-muted-foreground hover:text-red-500 text-base leading-none transition-colors">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Service editable table ───────────────────────────────────────────────────

function ServiceTable({ rows, onChange }: { rows: ServiceRow[]; onChange: (r: ServiceRow[]) => void }) {
  const updateRow = useCallback((idx: number, field: ServiceField, value: string) => {
    onChange(rows.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      updated.fieldErrors = validateServiceRow(updated);
      return updated;
    }));
  }, [rows, onChange]);

  const deleteRow = useCallback((idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  }, [rows, onChange]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border text-left">
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-10">#</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[160px]">Nombre <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[140px]">Categoría <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px]">Precio <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[200px]">Descripción</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[75px]">Activo</th>
            <th className="px-2 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const hasError = Object.keys(row.fieldErrors).length > 0;
            return (
              <tr key={idx} className={cn(
                'border-b border-border last:border-0 align-top',
                hasError ? 'bg-red-50/30 dark:bg-red-950/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
              )}>
                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                    hasError
                      ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {hasError ? '!' : row.rowNum}
                  </span>
                </td>
                <td className="px-2 py-2"><TextCell value={row.name} error={row.fieldErrors.name} placeholder="Nombre" onChange={(v) => updateRow(idx, 'name', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.category} error={row.fieldErrors.category} options={SERVICE_CAT_OPTS} onChange={(v) => updateRow(idx, 'category', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.price} error={row.fieldErrors.price} placeholder="0.00" type="number" onChange={(v) => updateRow(idx, 'price', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.description} placeholder="Descripción opcional" onChange={(v) => updateRow(idx, 'description', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.active} options={ACTIVE_OPTS} onChange={(v) => updateRow(idx, 'active', v)} /></td>
                <td className="px-2 py-2 text-center">
                  <button onClick={() => deleteRow(idx)} title="Eliminar fila" className="text-muted-foreground hover:text-red-500 text-base leading-none transition-colors">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Invoice + expense select option lists ────────────────────────────────────

const INVOICE_STATUS_OPTS = VALID_INVOICE_STATUSES.map((v) => ({ value: v, label: (INVOICE_STATUSES as Record<string, { label: string }>)[v]?.label ?? v }));
const INVOICE_METHOD_OPTS = VALID_INVOICE_METHODS.map((v)  => ({ value: v, label: (INVOICE_PAYMENT_METHODS as Record<string, { label: string }>)[v]?.label ?? v }));
const EXPENSE_CAT_OPTS    = VALID_EXPENSE_CATEGORIES.map((v) => ({ value: v, label: EXPENSE_CATEGORIES[v as ExpenseCategory] ?? v }));
const EXPENSE_FREQ_OPTS   = VALID_EXPENSE_FREQUENCIES.map((v) => ({ value: v, label: EXPENSE_FREQUENCIES[v as ExpenseFrequency] ?? v }));

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ validCount, invalidCount, total }: { validCount: number; invalidCount: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium">
        <CheckCircle2 size={14} />
        {validCount} listo{validCount !== 1 ? 's' : ''}
      </span>
      {invalidCount > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-medium">
          <AlertCircle size={14} />
          {invalidCount} con error{invalidCount !== 1 ? 'es' : ''} — corrígelos o elimínalos
        </span>
      )}
      <span className="text-xs text-muted-foreground ml-auto">{total} fila{total !== 1 ? 's' : ''} en total</span>
    </div>
  );
}

// ─── Product import panel ─────────────────────────────────────────────────────

function ProductImportPanel() {
  const [step, setStep]           = useState<ImportStep>('upload');
  const [rows, setRows]           = useState<ProductRow[]>([]);
  const [importedCount, setCount] = useState(0);
  const [isLoading, setLoading]   = useState(false);
  const [importError, setError]   = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [lastSaved, setLastSaved]   = useState<number | null>(null);

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft<ProductRow>(PRODUCT_DRAFT_KEY);
    if (draft && draft.rows.length > 0) {
      const revalidated = draft.rows.map((row) => ({ ...row, fieldErrors: validateProductRow(row) }));
      setRows(revalidated);
      setStep('table');
      setRestoredAt(draft.savedAt);
      setLastSaved(draft.savedAt);
    }
  }, []);

  // Autosave whenever rows change while editing
  useEffect(() => {
    if (step !== 'table' || rows.length === 0) return;
    saveDraft(PRODUCT_DRAFT_KEY, rows);
    setLastSaved(Date.now());
  }, [rows, step]);

  const validCount   = rows.filter((r) => Object.keys(r.fieldErrors).length === 0).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawRows = await parseFileToRows(file);
      const parsed = rawToProductRows(rawRows);
      setRows(parsed);
      setStep('table');
      setRestoredAt(null);
    } catch {
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const count = await importProductRows(rows);
      clearDraft(PRODUCT_DRAFT_KEY);
      setCount(count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al importar');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  const handleReset = useCallback(() => {
    clearDraft(PRODUCT_DRAFT_KEY);
    setStep('upload'); setRows([]); setCount(0); setError(null);
    setRestoredAt(null); setLastSaved(null);
  }, []);

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">¡Importación exitosa!</p>
          <p className="text-muted-foreground mt-1">
            {importedCount} producto{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} correctamente
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="gap-2">
          <Upload size={16} /> Importar más
        </Button>
      </div>
    );
  }

  if (step === 'table') {
    return (
      <div className="space-y-4">
        {/* Restored session banner */}
        {restoredAt !== null && (
          <div className="flex items-center gap-2.5 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-2.5">
            <RotateCcw size={14} className="shrink-0" />
            <span>
              <span className="font-semibold">Sesión anterior restaurada</span>
              {' · '}{rows.length} fila{rows.length !== 1 ? 's' : ''}{' · '}guardada {formatTimeAgo(restoredAt)}
            </span>
            <button onClick={handleReset} className="ml-auto text-xs underline opacity-70 hover:opacity-100 whitespace-nowrap shrink-0">
              Descartar y empezar de nuevo
            </button>
          </div>
        )}

        <SummaryBar validCount={validCount} invalidCount={invalidCount} total={rows.length} />
        <ProductTable rows={rows} onChange={setRows} />

        {importError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3">
            <AlertCircle size={16} className="shrink-0" /> {importError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <ArrowLeft size={15} /> Volver
          </Button>
          <Button className="gap-2" disabled={validCount === 0 || invalidCount > 0 || isLoading} onClick={handleConfirm}>
            {isLoading
              ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Importando…</>
              : <><CheckCircle2 size={15} /> Importar {validCount} producto{validCount !== 1 ? 's' : ''}</>}
          </Button>
          {invalidCount > 0 && (
            <p className="text-xs text-muted-foreground">Corrige o elimina las filas con errores para continuar</p>
          )}
          {lastSaved !== null && invalidCount === 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Save size={11} /> Guardado automáticamente · {formatTimeAgo(lastSaved)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 text-sm text-muted-foreground max-w-lg">
          <p>Sube un archivo <span className="font-medium text-foreground">.xlsx</span> con los productos. Descarga la plantilla para ver el formato.</p>
          <p className="text-xs">
            Columnas: <code className="bg-muted px-1 rounded">Nombre</code> · <code className="bg-muted px-1 rounded">Categoría</code> · <code className="bg-muted px-1 rounded">Precio de venta</code> · <code className="bg-muted px-1 rounded">Precio de costo</code> · <code className="bg-muted px-1 rounded">Stock actual</code> · <code className="bg-muted px-1 rounded">Stock mínimo</code> · <code className="bg-muted px-1 rounded">Unidad</code> · <code className="bg-muted px-1 rounded">Activo</code>
          </p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" onClick={downloadProductTemplate}>
          <Download size={15} /> Descargar plantilla
        </Button>
      </div>
      <DropZone onFile={handleFile} />
    </div>
  );
}

// ─── Service import panel ─────────────────────────────────────────────────────

function ServiceImportPanel() {
  const [step, setStep]           = useState<ImportStep>('upload');
  const [rows, setRows]           = useState<ServiceRow[]>([]);
  const [importedCount, setCount] = useState(0);
  const [isLoading, setLoading]   = useState(false);
  const [importError, setError]   = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [lastSaved, setLastSaved]   = useState<number | null>(null);

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft<ServiceRow>(SERVICE_DRAFT_KEY);
    if (draft && draft.rows.length > 0) {
      const revalidated = draft.rows.map((row) => ({ ...row, fieldErrors: validateServiceRow(row) }));
      setRows(revalidated);
      setStep('table');
      setRestoredAt(draft.savedAt);
      setLastSaved(draft.savedAt);
    }
  }, []);

  // Autosave whenever rows change while editing
  useEffect(() => {
    if (step !== 'table' || rows.length === 0) return;
    saveDraft(SERVICE_DRAFT_KEY, rows);
    setLastSaved(Date.now());
  }, [rows, step]);

  const validCount   = rows.filter((r) => Object.keys(r.fieldErrors).length === 0).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawRows = await parseFileToRows(file);
      const parsed = rawToServiceRows(rawRows);
      setRows(parsed);
      setStep('table');
      setRestoredAt(null);
    } catch {
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const count = await importServiceRows(rows);
      clearDraft(SERVICE_DRAFT_KEY);
      setCount(count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al importar');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  const handleReset = useCallback(() => {
    clearDraft(SERVICE_DRAFT_KEY);
    setStep('upload'); setRows([]); setCount(0); setError(null);
    setRestoredAt(null); setLastSaved(null);
  }, []);

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">¡Importación exitosa!</p>
          <p className="text-muted-foreground mt-1">
            {importedCount} servicio{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} correctamente
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="gap-2">
          <Upload size={16} /> Importar más
        </Button>
      </div>
    );
  }

  if (step === 'table') {
    return (
      <div className="space-y-4">
        {/* Restored session banner */}
        {restoredAt !== null && (
          <div className="flex items-center gap-2.5 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-2.5">
            <RotateCcw size={14} className="shrink-0" />
            <span>
              <span className="font-semibold">Sesión anterior restaurada</span>
              {' · '}{rows.length} fila{rows.length !== 1 ? 's' : ''}{' · '}guardada {formatTimeAgo(restoredAt)}
            </span>
            <button onClick={handleReset} className="ml-auto text-xs underline opacity-70 hover:opacity-100 whitespace-nowrap shrink-0">
              Descartar y empezar de nuevo
            </button>
          </div>
        )}

        <SummaryBar validCount={validCount} invalidCount={invalidCount} total={rows.length} />
        <ServiceTable rows={rows} onChange={setRows} />

        {importError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3">
            <AlertCircle size={16} className="shrink-0" /> {importError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <ArrowLeft size={15} /> Volver
          </Button>
          <Button className="gap-2" disabled={validCount === 0 || invalidCount > 0 || isLoading} onClick={handleConfirm}>
            {isLoading
              ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Importando…</>
              : <><CheckCircle2 size={15} /> Importar {validCount} servicio{validCount !== 1 ? 's' : ''}</>}
          </Button>
          {invalidCount > 0 && (
            <p className="text-xs text-muted-foreground">Corrige o elimina las filas con errores para continuar</p>
          )}
          {lastSaved !== null && invalidCount === 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Save size={11} /> Guardado automáticamente · {formatTimeAgo(lastSaved)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 text-sm text-muted-foreground max-w-lg">
          <p>Sube un archivo <span className="font-medium text-foreground">.xlsx</span> con los servicios. Descarga la plantilla para ver el formato.</p>
          <p className="text-xs">
            Columnas: <code className="bg-muted px-1 rounded">Nombre</code> · <code className="bg-muted px-1 rounded">Categoría</code> · <code className="bg-muted px-1 rounded">Precio</code> · <code className="bg-muted px-1 rounded">Descripción</code> · <code className="bg-muted px-1 rounded">Activo</code>
          </p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" onClick={downloadServiceTemplate}>
          <Download size={15} /> Descargar plantilla
        </Button>
      </div>
      <DropZone onFile={handleFile} />
    </div>
  );
}

// ─── Invoice editable table ───────────────────────────────────────────────────

type InvoiceField = keyof Omit<InvoiceImportRow, 'rowNum' | 'fieldErrors'>;

function InvoiceTable({ rows, onChange }: { rows: InvoiceImportRow[]; onChange: (r: InvoiceImportRow[]) => void }) {
  const updateRow = useCallback((idx: number, field: InvoiceField, value: string) => {
    onChange(rows.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      updated.fieldErrors = validateInvoiceRow(updated);
      return updated;
    }));
  }, [rows, onChange]);

  const deleteRow = useCallback((idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  }, [rows, onChange]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border text-left">
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-10">#</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[120px]">Fecha <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[180px]">Descripción <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[90px]">Cantidad <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px]">Precio unit. <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[90px]">Descuento</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[130px]">Método pago <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[120px]">Estado <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[150px]">Notas</th>
            <th className="px-2 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const hasError = Object.keys(row.fieldErrors).length > 0;
            return (
              <tr key={idx} className={cn(
                'border-b border-border last:border-0 align-top',
                hasError ? 'bg-red-50/30 dark:bg-red-950/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
              )}>
                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                    hasError ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground',
                  )}>
                    {hasError ? '!' : row.rowNum}
                  </span>
                </td>
                <td className="px-2 py-2"><TextCell value={row.date} error={row.fieldErrors.date} placeholder="YYYY-MM-DD" onChange={(v) => updateRow(idx, 'date', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.description} error={row.fieldErrors.description} placeholder="Descripción" onChange={(v) => updateRow(idx, 'description', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.quantity} error={row.fieldErrors.quantity} placeholder="1" type="number" onChange={(v) => updateRow(idx, 'quantity', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.unitPrice} error={row.fieldErrors.unitPrice} placeholder="0.00" type="number" onChange={(v) => updateRow(idx, 'unitPrice', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.discount} placeholder="0" type="number" onChange={(v) => updateRow(idx, 'discount', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.paymentMethod} error={row.fieldErrors.paymentMethod} options={INVOICE_METHOD_OPTS} onChange={(v) => updateRow(idx, 'paymentMethod', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.status} error={row.fieldErrors.status} options={INVOICE_STATUS_OPTS} onChange={(v) => updateRow(idx, 'status', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.notes} placeholder="Opcional" onChange={(v) => updateRow(idx, 'notes', v)} /></td>
                <td className="px-2 py-2 text-center">
                  <button onClick={() => deleteRow(idx)} title="Eliminar fila" className="text-muted-foreground hover:text-red-500 text-base leading-none transition-colors">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Expense editable table ───────────────────────────────────────────────────

type ExpenseField = keyof Omit<ExpenseImportRow, 'rowNum' | 'fieldErrors'>;

function ExpenseTable({ rows, onChange }: { rows: ExpenseImportRow[]; onChange: (r: ExpenseImportRow[]) => void }) {
  const updateRow = useCallback((idx: number, field: ExpenseField, value: string) => {
    onChange(rows.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      updated.fieldErrors = validateExpenseRow(updated);
      return updated;
    }));
  }, [rows, onChange]);

  const deleteRow = useCallback((idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  }, [rows, onChange]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border text-left">
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-10">#</th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[180px]">Nombre <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px]">Monto <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[140px]">Categoría <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[130px]">Frecuencia <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-medium text-muted-foreground min-w-[100px]">Día de pago <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const hasError = Object.keys(row.fieldErrors).length > 0;
            return (
              <tr key={idx} className={cn(
                'border-b border-border last:border-0 align-top',
                hasError ? 'bg-red-50/30 dark:bg-red-950/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
              )}>
                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                    hasError ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground',
                  )}>
                    {hasError ? '!' : row.rowNum}
                  </span>
                </td>
                <td className="px-2 py-2"><TextCell value={row.name} error={row.fieldErrors.name} placeholder="Nombre" onChange={(v) => updateRow(idx, 'name', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.amount} error={row.fieldErrors.amount} placeholder="0.00" type="number" onChange={(v) => updateRow(idx, 'amount', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.category} error={row.fieldErrors.category} options={EXPENSE_CAT_OPTS} onChange={(v) => updateRow(idx, 'category', v)} /></td>
                <td className="px-2 py-2"><SelectCell value={row.frequency} error={row.fieldErrors.frequency} options={EXPENSE_FREQ_OPTS} onChange={(v) => updateRow(idx, 'frequency', v)} /></td>
                <td className="px-2 py-2"><TextCell value={row.paymentDay} error={row.fieldErrors.paymentDay} placeholder="1–28" type="number" onChange={(v) => updateRow(idx, 'paymentDay', v)} /></td>
                <td className="px-2 py-2 text-center">
                  <button onClick={() => deleteRow(idx)} title="Eliminar fila" className="text-muted-foreground hover:text-red-500 text-base leading-none transition-colors">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Invoice import panel ─────────────────────────────────────────────────────

function InvoiceImportPanel() {
  const [step, setStep]           = useState<ImportStep>('upload');
  const [rows, setRows]           = useState<InvoiceImportRow[]>([]);
  const [importedCount, setCount] = useState(0);
  const [isLoading, setLoading]   = useState(false);
  const [importError, setError]   = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [lastSaved, setLastSaved]   = useState<number | null>(null);

  useEffect(() => {
    const draft = loadDraft<InvoiceImportRow>(INVOICE_DRAFT_KEY);
    if (draft && draft.rows.length > 0) {
      setRows(draft.rows.map((row) => ({ ...row, fieldErrors: validateInvoiceRow(row) })));
      setStep('table');
      setRestoredAt(draft.savedAt);
      setLastSaved(draft.savedAt);
    }
  }, []);

  useEffect(() => {
    if (step !== 'table' || rows.length === 0) return;
    saveDraft(INVOICE_DRAFT_KEY, rows);
    setLastSaved(Date.now());
  }, [rows, step]);

  const validCount   = rows.filter((r) => Object.keys(r.fieldErrors).length === 0).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawRows = await parseFileToRows(file);
      setRows(rawToInvoiceRows(rawRows));
      setStep('table');
      setRestoredAt(null);
    } catch {
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const count = await importInvoiceRows(rows);
      clearDraft(INVOICE_DRAFT_KEY);
      setCount(count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al importar');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  const handleReset = useCallback(() => {
    clearDraft(INVOICE_DRAFT_KEY);
    setStep('upload'); setRows([]); setCount(0); setError(null);
    setRestoredAt(null); setLastSaved(null);
  }, []);

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">¡Importación exitosa!</p>
          <p className="text-muted-foreground mt-1">
            {importedCount} factura{importedCount !== 1 ? 's' : ''} importada{importedCount !== 1 ? 's' : ''} correctamente
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="gap-2">
          <Upload size={16} /> Importar más
        </Button>
      </div>
    );
  }

  if (step === 'table') {
    return (
      <div className="space-y-4">
        {restoredAt !== null && (
          <div className="flex items-center gap-2.5 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-2.5">
            <RotateCcw size={14} className="shrink-0" />
            <span>
              <span className="font-semibold">Sesión anterior restaurada</span>
              {' · '}{rows.length} fila{rows.length !== 1 ? 's' : ''}{' · '}guardada {formatTimeAgo(restoredAt)}
            </span>
            <button onClick={handleReset} className="ml-auto text-xs underline opacity-70 hover:opacity-100 whitespace-nowrap shrink-0">
              Descartar y empezar de nuevo
            </button>
          </div>
        )}
        <SummaryBar validCount={validCount} invalidCount={invalidCount} total={rows.length} />
        <InvoiceTable rows={rows} onChange={setRows} />
        {importError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3">
            <AlertCircle size={16} className="shrink-0" /> {importError}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <ArrowLeft size={15} /> Volver
          </Button>
          <Button className="gap-2" disabled={validCount === 0 || invalidCount > 0 || isLoading} onClick={handleConfirm}>
            {isLoading
              ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Importando…</>
              : <><CheckCircle2 size={15} /> Importar {validCount} factura{validCount !== 1 ? 's' : ''}</>}
          </Button>
          {invalidCount > 0 && <p className="text-xs text-muted-foreground">Corrige o elimina las filas con errores para continuar</p>}
          {lastSaved !== null && invalidCount === 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Save size={11} /> Guardado automáticamente · {formatTimeAgo(lastSaved)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 text-sm text-muted-foreground max-w-lg">
          <p>Sube un archivo <span className="font-medium text-foreground">.xlsx</span> con facturas. Descarga la plantilla para ver el formato.</p>
          <p className="text-xs">
            Columnas: <code className="bg-muted px-1 rounded">Fecha</code> · <code className="bg-muted px-1 rounded">Descripción</code> · <code className="bg-muted px-1 rounded">Cantidad</code> · <code className="bg-muted px-1 rounded">Precio unitario</code> · <code className="bg-muted px-1 rounded">Descuento</code> · <code className="bg-muted px-1 rounded">Método de pago</code> · <code className="bg-muted px-1 rounded">Estado</code> · <code className="bg-muted px-1 rounded">Notas</code>
          </p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" onClick={downloadInvoiceTemplate}>
          <Download size={15} /> Descargar plantilla
        </Button>
      </div>
      <DropZone onFile={handleFile} />
    </div>
  );
}

// ─── Expense import panel ─────────────────────────────────────────────────────

function ExpenseImportPanel() {
  const [step, setStep]           = useState<ImportStep>('upload');
  const [rows, setRows]           = useState<ExpenseImportRow[]>([]);
  const [importedCount, setCount] = useState(0);
  const [isLoading, setLoading]   = useState(false);
  const [importError, setError]   = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [lastSaved, setLastSaved]   = useState<number | null>(null);

  useEffect(() => {
    const draft = loadDraft<ExpenseImportRow>(EXPENSE_DRAFT_KEY);
    if (draft && draft.rows.length > 0) {
      setRows(draft.rows.map((row) => ({ ...row, fieldErrors: validateExpenseRow(row) })));
      setStep('table');
      setRestoredAt(draft.savedAt);
      setLastSaved(draft.savedAt);
    }
  }, []);

  useEffect(() => {
    if (step !== 'table' || rows.length === 0) return;
    saveDraft(EXPENSE_DRAFT_KEY, rows);
    setLastSaved(Date.now());
  }, [rows, step]);

  const validCount   = rows.filter((r) => Object.keys(r.fieldErrors).length === 0).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawRows = await parseFileToRows(file);
      setRows(rawToExpenseRows(rawRows));
      setStep('table');
      setRestoredAt(null);
    } catch {
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const count = await importExpenseRows(rows);
      clearDraft(EXPENSE_DRAFT_KEY);
      setCount(count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al importar');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  const handleReset = useCallback(() => {
    clearDraft(EXPENSE_DRAFT_KEY);
    setStep('upload'); setRows([]); setCount(0); setError(null);
    setRestoredAt(null); setLastSaved(null);
  }, []);

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">¡Importación exitosa!</p>
          <p className="text-muted-foreground mt-1">
            {importedCount} gasto{importedCount !== 1 ? 's' : ''} fijo{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} correctamente
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="gap-2">
          <Upload size={16} /> Importar más
        </Button>
      </div>
    );
  }

  if (step === 'table') {
    return (
      <div className="space-y-4">
        {restoredAt !== null && (
          <div className="flex items-center gap-2.5 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-2.5">
            <RotateCcw size={14} className="shrink-0" />
            <span>
              <span className="font-semibold">Sesión anterior restaurada</span>
              {' · '}{rows.length} fila{rows.length !== 1 ? 's' : ''}{' · '}guardada {formatTimeAgo(restoredAt)}
            </span>
            <button onClick={handleReset} className="ml-auto text-xs underline opacity-70 hover:opacity-100 whitespace-nowrap shrink-0">
              Descartar y empezar de nuevo
            </button>
          </div>
        )}
        <SummaryBar validCount={validCount} invalidCount={invalidCount} total={rows.length} />
        <ExpenseTable rows={rows} onChange={setRows} />
        {importError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3">
            <AlertCircle size={16} className="shrink-0" /> {importError}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <ArrowLeft size={15} /> Volver
          </Button>
          <Button className="gap-2" disabled={validCount === 0 || invalidCount > 0 || isLoading} onClick={handleConfirm}>
            {isLoading
              ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Importando…</>
              : <><CheckCircle2 size={15} /> Importar {validCount} gasto{validCount !== 1 ? 's' : ''}</>}
          </Button>
          {invalidCount > 0 && <p className="text-xs text-muted-foreground">Corrige o elimina las filas con errores para continuar</p>}
          {lastSaved !== null && invalidCount === 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Save size={11} /> Guardado automáticamente · {formatTimeAgo(lastSaved)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 text-sm text-muted-foreground max-w-lg">
          <p>Sube un archivo <span className="font-medium text-foreground">.xlsx</span> con gastos fijos recurrentes. Descarga la plantilla para ver el formato.</p>
          <p className="text-xs">
            Columnas: <code className="bg-muted px-1 rounded">Nombre</code> · <code className="bg-muted px-1 rounded">Monto</code> · <code className="bg-muted px-1 rounded">Categoría</code> · <code className="bg-muted px-1 rounded">Frecuencia</code> · <code className="bg-muted px-1 rounded">Día de pago</code>
          </p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" onClick={downloadExpenseTemplate}>
          <Download size={15} /> Descargar plantilla
        </Button>
      </div>
      <DropZone onFile={handleFile} />
    </div>
  );
}

// ─── Export panel ─────────────────────────────────────────────────────────────

function ExportPanel() {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handle = useCallback(async (key: string, fn: () => Promise<void>, successText: string) => {
    setLoadingKey(key); setMessage(null);
    try { await fn(); setMessage({ type: 'success', text: successText }); }
    catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al exportar.' }); }
    finally { setLoadingKey(null); }
  }, []);

  const cards = [
    { key: 'products', label: 'Productos', sub: 'Inventario activo',    desc: 'Nombre, categoría, precios, stock y unidad.',    icon: <Package size={20} className="text-primary" />,     fn: exportProducts,  success: 'Productos exportados correctamente.' },
    { key: 'services', label: 'Servicios', sub: 'Catálogo activo',      desc: 'Nombre, categoría, precio y descripción.',        icon: <Stethoscope size={20} className="text-primary" />, fn: exportServices,  success: 'Servicios exportados correctamente.' },
    { key: 'invoices', label: 'Facturas',  sub: 'Historial de facturas', desc: 'Número, fecha, ítems, totales, método y estado.', icon: <Receipt size={20} className="text-primary" />,     fn: exportInvoices,  success: 'Facturas exportadas correctamente.' },
    { key: 'expenses', label: 'Gastos',    sub: 'Gastos fijos + pagos',  desc: 'Gastos recurrentes e historial de pagos.',        icon: <Wallet size={20} className="text-primary" />,      fn: exportExpenses,  success: 'Gastos exportados correctamente.' },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Exporta tus datos en formato Excel compatible con la plantilla de importación. Puedes editar el archivo y volver a importarlo.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">{card.icon}</div>
              <div>
                <p className="font-semibold text-sm">{card.label}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{card.desc}</p>
            <Button className="w-full gap-2" variant="outline" disabled={loadingKey !== null} onClick={() => handle(card.key, card.fn, card.success)}>
              {loadingKey === card.key
                ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Exportando…</>
                : <><Download size={15} /> Exportar {card.label}</>}
            </Button>
          </div>
        ))}
      </div>
      {message && (
        <div className={cn('flex items-center gap-2 text-sm rounded-lg px-4 py-3',
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
        )}>
          {message.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
          {message.text}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [mainTab, setMainTab] = useState<MainTab>('import');
  const [subTab,  setSubTab]  = useState<SubTab>('products');

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Importar / Exportar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Carga productos y servicios desde Excel o descarga tus datos para editarlos externamente.
        </p>
      </div>

      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted">
        {([
          { id: 'import' as MainTab, label: 'Importar', icon: <Upload size={15} /> },
          { id: 'export' as MainTab, label: 'Exportar', icon: <Download size={15} /> },
        ]).map((tab) => (
          <button key={tab.id} onClick={() => setMainTab(tab.id)} className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            mainTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-6">
        {mainTab === 'import' ? (
          <>
            <div className="flex items-center gap-1 pb-2 border-b border-border flex-wrap">
              {([
                { id: 'products' as SubTab, label: 'Productos', icon: <Package size={14} /> },
                { id: 'services' as SubTab, label: 'Servicios', icon: <Stethoscope size={14} /> },
                { id: 'catalog'  as SubTab, label: 'Catálogo',  icon: <BookOpen size={14} /> },
                { id: 'invoices' as SubTab, label: 'Facturas',  icon: <Receipt size={14} /> },
                { id: 'expenses' as SubTab, label: 'Gastos',    icon: <Wallet size={14} /> },
              ]).map((tab) => (
                <button key={tab.id} onClick={() => setSubTab(tab.id)} className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  subTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}>
                  {tab.icon} {tab.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <FileSpreadsheet size={13} />
                <span>Importar</span>
                <ChevronRight size={12} />
                <span className="text-foreground font-medium">
                  {subTab === 'products' ? 'Productos' : subTab === 'services' ? 'Servicios' : subTab === 'catalog' ? 'Catálogo de proveedores' : subTab === 'invoices' ? 'Facturas' : 'Gastos fijos'}
                </span>
              </div>
            </div>
            {subTab === 'products' && <ProductImportPanel />}
            {subTab === 'services' && <ServiceImportPanel />}
            {subTab === 'catalog'  && <CatalogImportPanel />}
            {subTab === 'invoices' && <InvoiceImportPanel />}
            {subTab === 'expenses' && <ExpenseImportPanel />}
          </>
        ) : (
          <ExportPanel />
        )}
      </div>
    </div>
  );
}
