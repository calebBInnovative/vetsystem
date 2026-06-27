'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';
import { crearVenta } from '@/hooks/useVentas';
import { DescuentoInput } from '@/components/common/DescuentoInput';
import { CATEGORIAS_PRODUCTO, type CategoriaProducto, type ProductoLocal } from '@/types/inventario';
import { METODOS_PAGO_VENTA, type MetodoPagoVenta, type VentaItem } from '@/types/venta';
import { PacienteSelector } from '@/components/common/PacienteSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  CheckCircle2, X, Loader2, ChevronRight,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

// ─── Cart item type ───────────────────────────────────────────────────────────

interface CartItem {
  productoId:     string;
  descripcion:    string;
  precioUnitario: number;
  cantidad:       number;
  subtotal:       number;
  stockDisponible:number;
}

// ─── Producto card ────────────────────────────────────────────────────────────

function ProductoBtn({ producto, onAgregar }: { producto: ProductoLocal; onAgregar: () => void }) {
  const cat      = CATEGORIAS_PRODUCTO[producto.categoria];
  const sinStock = producto.stockActual === 0;

  return (
    <button
      type="button"
      disabled={sinStock}
      onClick={onAgregar}
      className={cn(
        'flex items-center gap-3 w-full rounded-xl border p-3 text-left transition-all',
        sinStock
          ? 'border-border opacity-40 cursor-not-allowed'
          : 'border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]'
      )}
    >
      <span className="text-2xl shrink-0">{cat.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{producto.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {sinStock ? 'Sin stock' : `Stock: ${producto.stockActual}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold">{fmt(producto.precioVenta ?? 0)}</p>
        <Plus size={13} className="text-primary ml-auto mt-0.5" />
      </div>
    </button>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Vista = 'productos' | 'carrito';
type Paso  = 'cart' | 'cobrar' | 'exito';

export default function VentasPage() {
  const [busqueda,   setBusqueda]   = useState('');
  const [categoria,  setCategoria]  = useState<CategoriaProducto | undefined>();
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [vista,      setVista]      = useState<Vista>('productos');
  const [paso,       setPaso]       = useState<Paso>('cart');
  const [metodo,     setMetodo]     = useState<MetodoPagoVenta>('efectivo');
  const [descuento,  setDescuento]  = useState('0');
  const [pacienteId, setPacienteId] = useState('');
  const [notas,      setNotas]      = useState('');
  const [procesando,  setProcesando]  = useState(false);
  const [facturaId,   setFacturaId]   = useState('');
  const router = useRouter();

  // Productos desde Dexie — reactivo
  const productos = useLiveQuery(async () => {
    let q = db.products
      .where('clinicaId').equals(process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets')
      .filter((p) => !!p.activo && !p.deletedAt);

    if (categoria) q = q.filter((p) => p.categoria === categoria);

    const res = await q.toArray();
    if (busqueda.trim()) {
      const t = busqueda.toLowerCase();
      return res.filter((p) => p.nombre.toLowerCase().includes(t));
    }
    return res.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [busqueda, categoria]) ?? [];

  // Totales
  const subtotal    = useMemo(() => cart.reduce((s, i) => s + i.subtotal, 0), [cart]);
  const descuentoN  = Math.max(0, Number(descuento) || 0);
  const total       = Math.max(0, subtotal - descuentoN);
  const totalItems  = cart.reduce((s, i) => s + i.cantidad, 0);

  // ── Cart operations ─────────────────────────────────────────────────────────

  function agregar(prod: ProductoLocal) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productoId === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        const item = next[idx];
        if (item.cantidad >= item.stockDisponible) return prev;
        const nueva = item.cantidad + 1;
        next[idx] = { ...item, cantidad: nueva, subtotal: nueva * item.precioUnitario };
        return next;
      }
      return [...prev, {
        productoId:      prod.id,
        descripcion:     prod.nombre,
        precioUnitario:  prod.precioVenta ?? 0,
        cantidad:        1,
        subtotal:        prod.precioVenta ?? 0,
        stockDisponible: prod.stockActual,
      }];
    });
    // En móvil, ir al carrito si acaba de agregar el primer item
    if (cart.length === 0) setVista('productos');
  }

  function cambiarCantidad(productoId: string, delta: number) {
    setCart((prev) => prev
      .map((i) => {
        if (i.productoId !== productoId) return i;
        const nueva = Math.max(1, Math.min(i.stockDisponible, i.cantidad + delta));
        return { ...i, cantidad: nueva, subtotal: nueva * i.precioUnitario };
      })
    );
  }

  function eliminar(productoId: string) {
    setCart((prev) => prev.filter((i) => i.productoId !== productoId));
  }

  function limpiarVenta() {
    setCart([]);
    setDescuento('0');
    setPacienteId('');
    setNotas('');
    setMetodo('efectivo');
    setPaso('cart');
    setVista('productos');
    setFacturaId('');
  }

  // ── Cobrar ──────────────────────────────────────────────────────────────────

  async function handleCobrar() {
    if (cart.length === 0 || procesando) return;
    setProcesando(true);
    try {
      const items: VentaItem[] = cart.map((i) => ({
        id:             crypto.randomUUID(),
        productoId:     i.productoId,
        descripcion:    i.descripcion,
        cantidad:       i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal:       i.subtotal,
      }));
      const ventaId = await crearVenta({ items, subtotal, descuento: descuentoN, total, metodoPago: metodo, pacienteId: pacienteId || undefined, notas: notas || undefined });
      // Recuperar facturaId que se generó dentro de la transacción
      const venta = await db.sales.get(ventaId);
      if (venta?.facturaId) setFacturaId(venta.facturaId);
      setPaso('exito');
    } finally {
      setProcesando(false);
    }
  }

  // ── Panel carrito ────────────────────────────────────────────────────────────

  function PanelCarrito() {
    if (paso === 'exito') {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <CheckCircle2 size={56} className="text-green-500" />
          <p className="text-xl font-bold">¡Venta registrada!</p>
          <p className="text-sm text-muted-foreground">{fmt(total)} · {METODOS_PAGO_VENTA[metodo].label}</p>
          <div className="flex flex-col gap-2 w-full mt-2">
            {facturaId && (
              <Button variant="outline" className="w-full gap-2" onClick={() => router.push(`/facturas/${facturaId}`)}>
                Ver factura / recibo
              </Button>
            )}
            <Button className="w-full" onClick={limpiarVenta}>
              Nueva venta
            </Button>
          </div>
        </div>
      );
    }

    if (paso === 'cobrar') {
      return (
        <div className="flex flex-col gap-4">
          {/* Resumen compacto */}
          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
            {cart.map((i) => (
              <div key={i.productoId} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[60%]">{i.descripcion} ×{i.cantidad}</span>
                <span className="font-medium">{fmt(i.subtotal)}</span>
              </div>
            ))}
            {descuentoN > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400 pt-1 border-t border-border">
                <span>Descuento</span><span>−{fmt(descuentoN)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
              <span>Total</span><span className="text-primary">{fmt(total)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Método de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(METODOS_PAGO_VENTA) as [MetodoPagoVenta, { label: string; emoji: string }][]).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetodo(key)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    metodo === key
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <span>{info.emoji}</span>{info.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cliente opcional */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Cliente <span className="text-muted-foreground font-normal">(opcional)</span></p>
            <PacienteSelector value={pacienteId || undefined} onChange={setPacienteId} placeholder="Asociar a paciente..." />
          </div>

          {/* Notas */}
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Notas de la venta (opcional)…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPaso('cart')} disabled={procesando}>
              ← Volver
            </Button>
            <Button className="flex-1 gap-2" onClick={handleCobrar} disabled={procesando || total <= 0}>
              {procesando ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirmar cobro
            </Button>
          </div>
        </div>
      );
    }

    // ── Paso: cart ──────────────────────────────────────────────────────────────
    return (
      <div className="flex flex-col gap-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <ShoppingCart size={40} className="opacity-30 mb-3" />
            <p className="text-sm">El carrito está vacío</p>
            <p className="text-xs mt-1">Agrega productos desde el catálogo</p>
          </div>
        ) : (
          <>
            {/* Items */}
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.productoId} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.descripcion}</p>
                    <p className="text-xs text-muted-foreground">{fmt(item.precioUnitario)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => cambiarCantidad(item.productoId, -1)}
                      className="w-6 h-6 rounded-lg border border-border flex items-center justify-center hover:bg-muted/40 transition-colors">
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.cantidad}</span>
                    <button type="button" onClick={() => cambiarCantidad(item.productoId, 1)}
                      disabled={item.cantidad >= item.stockDisponible}
                      className="w-6 h-6 rounded-lg border border-border flex items-center justify-center hover:bg-muted/40 transition-colors disabled:opacity-40">
                      <Plus size={11} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold w-16 text-right shrink-0">{fmt(item.subtotal)}</span>
                  <button type="button" onClick={() => eliminar(item.productoId)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Descuento */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Descuento</label>
              <DescuentoInput
                subtotal={subtotal}
                value={descuentoN}
                onChange={(monto) => setDescuento(String(monto))}
              />
            </div>

            {/* Total */}
            <div className="rounded-xl bg-muted/40 p-3 space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {descuentoN > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                  <span>Descuento</span><span>−{fmt(descuentoN)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
                <span>Total</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>

            <Button className="w-full gap-2 h-11 text-base" onClick={() => setPaso('cobrar')}>
              Cobrar <ChevronRight size={16} />
            </Button>

            <button type="button" onClick={limpiarVenta}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors text-center">
              Vaciar carrito
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 sm:-m-6 flex flex-col">

      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <div className="flex-1">
          <h1 className="font-bold text-base">Venta rápida</h1>
          <p className="text-xs text-muted-foreground">Productos · Sin necesidad de paciente</p>
        </div>
        {/* Mobile: toggle carrito */}
        <button
          type="button"
          onClick={() => setVista(vista === 'carrito' ? 'productos' : 'carrito')}
          className="lg:hidden relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-sm font-medium"
        >
          <ShoppingCart size={15} />
          {totalItems > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Panel izquierdo: catálogo ─────────────────────────── */}
        <div className={cn(
          'flex-1 flex flex-col overflow-hidden',
          vista === 'carrito' ? 'hidden lg:flex' : 'flex'
        )}>
          {/* Busqueda + filtro */}
          <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => setCategoria(undefined)}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-xl text-xs font-medium border transition-colors',
                  !categoria ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                Todos
              </button>
              {(Object.entries(CATEGORIAS_PRODUCTO) as [CategoriaProducto, { label: string; emoji: string }][]).map(([cat, info]) => (
                <button
                  key={cat}
                  onClick={() => setCategoria(cat === categoria ? undefined : cat)}
                  className={cn(
                    'shrink-0 flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-medium border transition-colors',
                    categoria === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {info.emoji} {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de productos */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {productos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                <p className="text-3xl mb-2">📦</p>
                <p className="text-sm">{busqueda ? 'Sin resultados' : 'No hay productos en esta categoría'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {productos.map((prod) => (
                  <ProductoBtn key={prod.id} producto={prod} onAgregar={() => agregar(prod)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Panel derecho: carrito ────────────────────────────── */}
        <div className={cn(
          'w-full lg:w-80 border-l border-border bg-card flex flex-col overflow-hidden shrink-0',
          vista === 'productos' ? 'hidden lg:flex' : 'flex'
        )}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <p className="font-semibold text-sm">
              {paso === 'cobrar' ? 'Confirmar cobro' : paso === 'exito' ? 'Venta completada' : `Carrito${totalItems > 0 ? ` (${totalItems})` : ''}`}
            </p>
            {paso !== 'exito' && cart.length > 0 && paso === 'cart' && (
              <span className="text-xs text-muted-foreground">{fmt(total)}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <PanelCarrito />
          </div>
        </div>
      </div>
    </div>
  );
}
