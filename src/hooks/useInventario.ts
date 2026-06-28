'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ProductoLocal, MovimientoStockLocal, CategoriaProducto } from '@/types/inventario';
import type { ProductoFormData, AjusteStockFormData } from '@/lib/validations/inventario.schema';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista de productos activos. Filtra opcionalmente por categoría o búsqueda.
 */
export function useProductos(busqueda = '', categoria?: CategoriaProducto) {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    let productos = await db.products
      .where('clinicaId')
      .equals(clinicaId)
      .filter((p) => !p.deletedAt && p.activo)
      .toArray();

    if (categoria) {
      productos = productos.filter((p) => p.categoria === categoria);
    }

    const termino = busqueda.toLowerCase().trim();
    if (termino) {
      productos = productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(termino) ||
          (p.descripcion?.toLowerCase().includes(termino) ?? false) ||
          (p.proveedor?.toLowerCase().includes(termino) ?? false)
      );
    }

    return productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [busqueda, categoria]);

  return {
    productos: resultado ?? [],
    cargando:  resultado === undefined,
  };
}

/**
 * Productos con stock en o por debajo del mínimo.
 */
export function useAlertasStock() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    return db.products
      .where('clinicaId')
      .equals(clinicaId)
      .filter((p) => !p.deletedAt && p.activo && p.stockActual <= p.stockMinimo)
      .toArray();
  }, []);

  return {
    alertas:  resultado ?? [],
    cargando: resultado === undefined,
  };
}

/**
 * Un producto específico por ID.
 */
export function useProducto(id: string) {
  const resultado = useLiveQuery(async () => {
    const p = await db.products.get(id);
    return p?.deletedAt ? null : (p ?? null);
  }, [id]);

  return {
    producto: resultado ?? null,
    cargando: resultado === undefined,
  };
}

/**
 * Historial de movimientos de un producto, ordenados del más reciente.
 */
export function useMovimientosProducto(productoId: string) {
  const resultado = useLiveQuery(async () => {
    return db.movements
      .where('productoId')
      .equals(productoId)
      .reverse()
      .sortBy('creadoEn');
  }, [productoId]);

  return {
    movimientos: resultado ?? [],
    cargando:    resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un nuevo producto en el inventario.
 */
export async function crearProducto(datos: ProductoFormData): Promise<string> {
  const ahora     = Date.now();
  const productoId = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const nuevo: ProductoLocal = {
    id:               productoId,
    nombre:           datos.nombre,
    categoria:        datos.categoria,
    descripcion:      datos.descripcion      || undefined,
    stockActual:      datos.stockActual as number,
    stockMinimo:      datos.stockMinimo as number,
    unidad:           datos.unidad,
    precioVenta:      datos.precioVenta,
    precioCosto:      datos.precioCosto,
    fechaVencimiento: datos.fechaVencimiento || undefined,
    lote:             datos.lote             || undefined,
    proveedor:        datos.proveedor        || undefined,
    activo:           true,
    clinicaId:        clinicaId,
    creadoEn:         ahora,
    syncStatus:       'pending',
    updatedAt:        ahora,
  };

  await db.products.add(nuevo);

  // Registrar movimiento inicial si hay stock
  if (nuevo.stockActual > 0) {
    await registrarMovimiento({
      productoId,
      tipo:         'entrada',
      cantidad:     nuevo.stockActual,
      stockAntes:   0,
      stockDespues: nuevo.stockActual,
      motivo:       'Stock inicial',
    });
  }

  await encolarSync({ coleccion: 'productos', documentoId: productoId, operacion: 'create', datos: nuevo, intentos: 0, creadoEn: ahora });
  return productoId;
}

/**
 * Actualiza campos del producto.
 */
export async function actualizarProducto(
  id: string,
  cambios: Partial<Omit<ProductoLocal, 'id' | 'creadoEn' | 'clinicaId'>>
): Promise<void> {
  const ahora   = Date.now();
  const payload = { ...cambios, updatedAt: ahora, syncStatus: 'pending' as const };
  await db.products.update(id, payload);
  await encolarSync({ coleccion: 'productos', documentoId: id, operacion: 'update', datos: { id, ...payload }, intentos: 0, creadoEn: ahora });
}

/**
 * Registra una entrada, salida o ajuste de stock.
 * Actualiza `stockActual` del producto automáticamente.
 */
export async function ajustarStock(productoId: string, datos: AjusteStockFormData): Promise<void> {
  const producto = await db.products.get(productoId);
  if (!producto) throw new Error(`Producto ${productoId} no encontrado`);

  const cantidad     = datos.tipo === 'salida' ? -datos.cantidad : datos.cantidad as number;
  const stockAntes   = producto.stockActual;
  const stockDespues = Math.max(0, stockAntes + cantidad);

  await db.products.update(productoId, {
    stockActual: stockDespues,
    updatedAt:   Date.now(),
    syncStatus:  'pending',
  });

  await registrarMovimiento({
    productoId,
    tipo:         datos.tipo,
    cantidad:     datos.cantidad as number,
    stockAntes,
    stockDespues,
    motivo:       datos.motivo,
  });
}

/** Soft delete */
export async function eliminarProducto(id: string): Promise<void> {
  const ahora = Date.now();
  await db.products.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({ coleccion: 'productos', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ─────────────────────────────────────────────────────────────────────────────

async function registrarMovimiento(
  datos: Omit<MovimientoStockLocal, 'id' | 'clinicaId' | 'creadoEn' | 'syncStatus' | 'updatedAt'>
): Promise<void> {
  const ahora      = Date.now();
  const clinicaId  = await getClinicaId();
  const movimiento: MovimientoStockLocal = {
    id:           crypto.randomUUID(),
    clinicaId:    clinicaId,
    creadoEn:     ahora,
    syncStatus:   'pending',
    updatedAt:    ahora,
    ...datos,
  };
  await db.movements.add(movimiento);
  await encolarSync({ coleccion: 'movimientos', documentoId: movimiento.id, operacion: 'create', datos: movimiento, intentos: 0, creadoEn: ahora });
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}
