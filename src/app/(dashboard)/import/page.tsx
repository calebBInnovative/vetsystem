'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Download, FileSpreadsheet, CheckCircle2,
  AlertCircle, ArrowLeft, Package, Stethoscope, ChevronRight,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { db, getClinicId } from '@/lib/db/database';
import type { SyncQueueItem } from '@/lib/db/database';
import type { ProductLocal } from '@/types/inventory';
import type { ServiceLocal } from '@/types/service';
import { CatalogImportPanel } from '@/components/catalog/CatalogImportPanel';

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

type ImportStep = 'upload' | 'table' | 'success';
type MainTab = 'import' | 'export';
type SubTab = 'products' | 'services' | 'catalog';

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

function downloadProductTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Nombre', 'Categoría', 'Precio de venta', 'Precio de costo', 'Stock actual', 'Stock mínimo', 'Unidad', 'Activo'],
    ['Amoxicilina 500mg',  'Medicamento', 150, 80,  50, 10, 'Tableta',    'Sí'],
    ['Vacuna Antirrábica', 'Vacuna',      120, 60,  30, 10, 'Ampolleta',  'Sí'],
    ['Royal Canin 3kg',    'Alimento',    450, 320, 15,  5, 'kg',         'Sí'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  const opts: (string | null)[][] = [
    ['CATEGORÍAS VÁLIDAS', '', 'UNIDADES VÁLIDAS'],
    ['Medicamento',    '', 'Unidad'],     ['Vacuna',      '', 'Caja'],
    ['Antiparasitario','', 'Botella'],    ['Alimento',    '', 'Ampolleta'],
    ['Accesorio',      '', 'Tableta'],    ['Higiene',     '', 'Dosis'],
    ['Cirugía',        '', 'mL'],         ['Laboratorio', '', 'mg'],
    ['Otro',           '', 'kg'],         [null,          '', 'Gramo'],
    [null,             '', 'Litro'],      [null,          '', 'Libra'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(opts);
  ws2['!cols'] = [{ wch: 18 }, { wch: 4 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Opciones_válidas');
  XLSX.writeFile(wb, 'plantilla_productos.xlsx');
}

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
        type={type} value={value} placeholder={placeholder} title={error}
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

  const validCount   = rows.filter((r) => Object.keys(r.fieldErrors).length === 0).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawRows = await parseFileToRows(file);
      setRows(rawToProductRows(rawRows));
      setStep('table');
    } catch {
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const count = await importProductRows(rows);
      setCount(count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al importar');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  const handleReset = useCallback(() => {
    setStep('upload'); setRows([]); setCount(0); setError(null);
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

  const validCount   = rows.filter((r) => Object.keys(r.fieldErrors).length === 0).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawRows = await parseFileToRows(file);
      setRows(rawToServiceRows(rawRows));
      setStep('table');
    } catch {
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const count = await importServiceRows(rows);
      setCount(count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al importar');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  const handleReset = useCallback(() => {
    setStep('upload'); setRows([]); setCount(0); setError(null);
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

// ─── Export panel ─────────────────────────────────────────────────────────────

function ExportPanel() {
  const [exportingProducts, setExportingProducts] = useState(false);
  const [exportingServices, setExportingServices] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExportProducts = useCallback(async () => {
    setExportingProducts(true); setMessage(null);
    try { await exportProducts(); setMessage({ type: 'success', text: 'Productos exportados correctamente.' }); }
    catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al exportar.' }); }
    finally { setExportingProducts(false); }
  }, []);

  const handleExportServices = useCallback(async () => {
    setExportingServices(true); setMessage(null);
    try { await exportServices(); setMessage({ type: 'success', text: 'Servicios exportados correctamente.' }); }
    catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al exportar.' }); }
    finally { setExportingServices(false); }
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Exporta tus datos en formato Excel compatible con la plantilla de importación. Puedes editar el archivo y volver a importarlo.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { label: 'Productos', sub: 'Inventario activo', desc: 'Nombre, categoría, precios, stock y unidad.', icon: <Package size={20} className="text-primary" />, loading: exportingProducts, onClick: handleExportProducts },
          { label: 'Servicios', sub: 'Catálogo activo',   desc: 'Nombre, categoría, precio y descripción.',   icon: <Stethoscope size={20} className="text-primary" />, loading: exportingServices, onClick: handleExportServices },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">{card.icon}</div>
              <div>
                <p className="font-semibold text-sm">{card.label}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{card.desc}</p>
            <Button className="w-full gap-2" variant="outline" disabled={card.loading} onClick={card.onClick}>
              {card.loading
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
                { id: 'products' as SubTab, label: 'Productos',  icon: <Package size={14} /> },
                { id: 'services' as SubTab, label: 'Servicios',  icon: <Stethoscope size={14} /> },
                { id: 'catalog'  as SubTab, label: 'Catálogo',   icon: <BookOpen size={14} /> },
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
                  {subTab === 'products' ? 'Productos' : subTab === 'services' ? 'Servicios' : 'Catálogo de proveedores'}
                </span>
              </div>
            </div>
            {subTab === 'products' && <ProductImportPanel />}
            {subTab === 'services' && <ServiceImportPanel />}
            {subTab === 'catalog'  && <CatalogImportPanel />}
          </>
        ) : (
          <ExportPanel />
        )}
      </div>
    </div>
  );
}
