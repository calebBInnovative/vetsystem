'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProducts } from '@/hooks/useInventory';
import { ProductoCard } from '@/components/inventory/ProductCard';
import { ProductoRow } from '@/components/inventory/ProductRow';
import { AlertasStock } from '@/components/inventory/StockAlerts';
import { BuscadorPacientes } from '@/components/patients/PatientSearch';
import { Button } from '@/components/ui/button';
import { PRODUCT_CATEGORIES, type ProductCategory } from '@/types/inventory';
import { Plus, Package, Loader2, LayoutList, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

type View = 'lista' | 'cards';

export default function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoria,   setCategoria]   = useState<ProductCategory | undefined>();
  const [view,        setView]        = useState<View>('lista');
  const { products, loading } = useProducts(searchQuery, categoria);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Cargando...' : `${products.length} producto${products.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/inventory/new">
          <Button className="gap-2">
            <Plus size={17} />
            <span className="hidden sm:inline">Nuevo Producto</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </Link>
      </div>

      {/* Alertas de stock bajo */}
      <AlertasStock />

      {/* Buscador */}
      <BuscadorPacientes
        onBuscar={setSearchQuery}
        placeholder="Buscar producto, proveedor..."
      />

      {/* Filtro por categoría + toggle de vista */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none flex-1 min-w-0">
          <button
            onClick={() => setCategoria(undefined)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0',
              !categoria
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            Todos
          </button>
          {(Object.entries(PRODUCT_CATEGORIES) as [ProductCategory, { label: string; emoji: string }][]).map(
            ([cat, { label, emoji }]) => (
              <button
                key={cat}
                onClick={() => setCategoria(cat === categoria ? undefined : cat)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                  categoria === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <span>{emoji}</span>
                {label}
              </button>
            )
          )}
        </div>

        {/* Toggle lista / cards */}
        <div className="flex shrink-0 rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setView('lista')}
            title="Vista lista"
            className={cn(
              'p-2 transition-colors',
              view === 'lista'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutList size={16} />
          </button>
          <button
            onClick={() => setView('cards')}
            title="Vista cards"
            className={cn(
              'p-2 transition-colors',
              view === 'cards'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState searchQuery={searchQuery} categoria={categoria} />
      ) : view === 'lista' ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {products.map((p) => (
            <ProductoRow key={p.id} producto={p} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductoCard key={p.id} producto={p} />
          ))}
        </div>
      )}

    </div>
  );
}

function EmptyState({ searchQuery, categoria }: { searchQuery: string; categoria?: string }) {
  if (searchQuery || categoria) {
    return (
      <div className="text-center py-24 space-y-2">
        <p className="text-4xl">🔍</p>
        <p className="font-semibold">Sin resultados</p>
        <p className="text-sm text-muted-foreground">
          No encontramos products con ese criterio
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-24 space-y-3">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Package className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="font-semibold text-lg">Inventario vacío</p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        Agrega medicamentos, vacunas y products para comenzar
      </p>
      <div className="pt-2">
        <Link href="/inventory/new">
          <Button size="lg" className="gap-2">
            <Plus size={17} />
            Agregar primer producto
          </Button>
        </Link>
      </div>
    </div>
  );
}
