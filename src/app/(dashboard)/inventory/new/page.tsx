'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductoForm } from '@/components/inventory/ProductForm';
import { CatalogImportPanel } from '@/components/catalog/CatalogImportPanel';
import { createProduct } from '@/hooks/useInventory';
import { type ProductoFormData } from '@/lib/validations/inventory.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, FileSpreadsheet, PencilLine, Download, Upload, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadProductTemplate } from '@/lib/inventory/productTemplate';

type Mode = 'select' | 'manual' | 'catalog' | 'excel';

// ─── Column definition for the Excel guide ────────────────────────────────────

const COLUMNS = [
  { name: 'Nombre',          required: true,  type: 'Texto',   example: 'Amoxicilina 500mg',  notes: 'Nombre del producto o medicamento' },
  { name: 'Categoría',       required: true,  type: 'Texto',   example: 'Medicamento',         notes: 'Ver lista de valores válidos abajo' },
  { name: 'Precio de venta', required: true,  type: 'Número',  example: '150',                 notes: 'Precio al público, sin símbolo ($)' },
  { name: 'Precio de costo', required: false, type: 'Número',  example: '80',                  notes: 'Costo de compra (opcional)' },
  { name: 'Stock actual',    required: false, type: 'Número',  example: '50',                  notes: 'Unidades disponibles ahora (default 0)' },
  { name: 'Stock mínimo',    required: false, type: 'Número',  example: '10',                  notes: 'Alerta cuando baje de este nivel' },
  { name: 'Unidad',          required: false, type: 'Texto',   example: 'Tableta',             notes: 'Ver lista de valores válidos abajo' },
  { name: 'Activo',          required: false, type: 'Sí / No', example: 'Sí',                  notes: 'Si no se indica, se asume Sí' },
] as const;

const VALID_CATEGORIES = [
  'Medicamento', 'Vacuna', 'Antiparasitario', 'Alimento',
  'Accesorio', 'Higiene', 'Cirugía', 'Laboratorio', 'Otro',
];

const VALID_UNITS = [
  'Unidad', 'Caja', 'Botella', 'Ampolleta', 'Tableta',
  'Dosis', 'mL', 'mg', 'kg', 'Gramo', 'Litro', 'Libra',
];

// ─── Excel import panel ───────────────────────────────────────────────────────

function ExcelPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="font-semibold text-sm">Importar desde Excel</p>
          <p className="text-xs text-muted-foreground">Descarga la plantilla, llénala y súbela en Importar / Exportar</p>
        </div>
      </div>

      {/* Download CTA */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <FileSpreadsheet size={20} className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">plantilla_productos.xlsx</p>
            <p className="text-xs text-muted-foreground">Incluye ejemplos y hoja de valores válidos</p>
          </div>
        </div>
        <Button className="gap-2 shrink-0" onClick={downloadProductTemplate}>
          <Download size={15} /> Descargar plantilla
        </Button>
      </div>

      {/* Column guide */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Columnas del archivo</p>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Columna</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Ejemplo</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Nota</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((col, i) => (
                <tr key={col.name} className={cn('border-b border-border last:border-0', i % 2 === 0 ? 'bg-background' : 'bg-muted/10')}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-xs">{col.name}</span>
                    {col.required && <span className="ml-1 text-red-500 text-[10px]">*</span>}
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{col.type}</span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{col.example}</code>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{col.notes}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground"><span className="text-red-500">*</span> Obligatorio</p>
      </div>

      {/* Valid values */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categorías válidas</p>
          <div className="flex flex-wrap gap-1.5">
            {VALID_CATEGORIES.map((c) => (
              <span key={c} className="px-2 py-1 rounded-lg bg-muted text-xs text-muted-foreground">{c}</span>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unidades válidas</p>
          <div className="flex flex-wrap gap-1.5">
            {VALID_UNITS.map((u) => (
              <span key={u} className="px-2 py-1 rounded-lg bg-muted text-xs text-muted-foreground">{u}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pasos para importar</p>
        <ol className="space-y-2">
          {[
            'Descarga la plantilla de arriba',
            'Llena las filas con tus productos (una por fila)',
            'Guarda el archivo y ve a Importar / Exportar para subirlo',
            'Revisa los errores en la tabla, corrígelos y confirma',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* CTA to import page */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-1">
          <CheckCircle2 size={13} className="text-primary shrink-0" />
          La plantilla ya incluye ejemplos y la hoja de valores válidos.
        </div>
        <Link href="/import">
          <Button variant="outline" className="gap-2 shrink-0">
            <Upload size={15} /> Ir a subir archivo
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Selection card ───────────────────────────────────────────────────────────

function SelectionCard({
  icon,
  title,
  description,
  recommended,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start gap-3 p-5 rounded-2xl border-2 text-left transition-all hover:shadow-md',
        recommended
          ? 'border-primary bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-card hover:border-primary/50',
      )}
    >
      {recommended && (
        <span className="absolute top-3 right-3 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          Recomendado
        </span>
      )}
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center',
        recommended ? 'bg-primary/15' : 'bg-muted',
      )}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewProductPage() {
  const router  = useRouter();
  const [mode, setMode]     = useState<Mode>('select');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (datos: ProductoFormData) => {
    setSaving(true);
    try {
      const id = await createProduct(datos);
      toast.success('Producto registrado', {
        description: `${datos.name} fue agregado al inventario.`,
      });
      router.push(`/inventory/${id}`);
    } catch {
      toast.error('Error al guardar', {
        description: 'No se pudo registrar el producto. Intenta de nuevo.',
      });
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {mode === 'select' ? (
          <Link href="/inventory">
            <Button variant="ghost" size="icon">
              <ArrowLeft size={18} />
            </Button>
          </Link>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setMode('select')}>
            <ArrowLeft size={18} />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold">Nuevo Producto</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mode === 'select'   ? 'Elige cómo agregar el producto a tu inventario'   : ''}
            {mode === 'manual'   ? 'Completa la información del producto'              : ''}
            {mode === 'catalog'  ? 'Selecciona productos del catálogo de proveedores'  : ''}
            {mode === 'excel'    ? 'Importar desde archivo Excel'                      : ''}
          </p>
        </div>
      </div>

      {/* Selection screen */}
      {mode === 'select' && (
        <div className="grid gap-4">
          <SelectionCard
            icon={<BookOpen size={24} className="text-primary" />}
            title="Desde catálogo de proveedores"
            description="Busca productos de Riverfarma Pets, Riverfarma Aves y otros proveedores. Incluye principio activo, vía de administración y más."
            recommended
            onClick={() => setMode('catalog')}
          />
          <SelectionCard
            icon={<PencilLine size={24} className="text-muted-foreground" />}
            title="Crear manualmente"
            description="Ingresa el nombre, categoría, precio y stock de un producto nuevo."
            onClick={() => setMode('manual')}
          />
          <SelectionCard
            icon={<FileSpreadsheet size={24} className="text-muted-foreground" />}
            title="Importar desde Excel"
            description="Carga un archivo .xlsx para importar varios productos a la vez."
            onClick={() => setMode('excel')}
          />
        </div>
      )}

      {/* Manual form */}
      {mode === 'manual' && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <ProductoForm onSubmit={handleSubmit} loading={saving} />
        </div>
      )}

      {/* Catalog import */}
      {mode === 'catalog' && (
        <CatalogImportPanel
          onClose={() => router.push('/inventory')}
        />
      )}

      {/* Excel import */}
      {mode === 'excel' && (
        <ExcelPanel onBack={() => setMode('select')} />
      )}
    </div>
  );
}
