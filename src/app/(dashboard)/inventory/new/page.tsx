'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductoForm } from '@/components/inventory/ProductForm';
import { CatalogImportPanel } from '@/components/catalog/CatalogImportPanel';
import { createProduct } from '@/hooks/useInventory';
import { type ProductoFormData } from '@/lib/validations/inventory.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, FileSpreadsheet, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Mode = 'select' | 'manual' | 'catalog' | 'excel';

// ─── Excel import panel (reuses the shared upload flow) ───────────────────────

function ExcelPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="font-semibold text-sm">Importar desde Excel</p>
          <p className="text-xs text-muted-foreground">Carga un archivo .xlsx con tus productos</p>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 flex flex-col items-center gap-4 py-14 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet size={26} className="text-primary" />
        </div>
        <div>
          <p className="font-semibold">Importación masiva desde Excel</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Para importar varios productos a la vez con precio y stock, usa la sección de Importar / Exportar.
          </p>
        </div>
        <Link href="/import?tab=products">
          <Button className="gap-2">
            <FileSpreadsheet size={15} /> Ir a Importar / Exportar
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
