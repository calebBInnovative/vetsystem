'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import {
  format, parseISO, getDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  subDays, subWeeks, subMonths, subYears,
  eachDayOfInterval, eachMonthOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';

export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year';

export interface ProductStat {
  productId:    string;
  name:         string;
  category:     string;
  unit:         string;
  totalRevenue: number;
  totalQty:     number;
  salesCount:   number;
  costPrice?:   number;
  margin?:      number;
}

export interface ServiceStat {
  serviceId:    string;
  name:         string;
  category:     string;
  totalRevenue: number;
  totalCount:   number;
}

export interface PeriodPoint {
  label:      string;
  date:       string;
  revenue:    number;
  salesCount: number;
  isCurrent:  boolean;
}

export interface AnalyticsInsight {
  type:        'success' | 'warning' | 'info' | 'tip';
  icon:        string;
  title:       string;
  description: string;
}

export interface FinancialAnalytics {
  totalRevenue:     number;
  prevRevenue:      number;
  growthPct:        number;
  transactionCount: number;
  avgPerSale:       number;
  timeSeries:       PeriodPoint[];
  topProducts:      ProductStat[];
  worstProducts:    ProductStat[];
  topServices:      ServiceStat[];
  insights:         AnalyticsInsight[];
  bestDayName:      string | null;
  periodLabel:      string;
  start:            string;
  end:              string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPeriodRange(dateStr: string, period: AnalyticsPeriod) {
  const date = parseISO(dateStr);
  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  if (period === 'day') {
    start = date;
    end = date;
    prevStart = subDays(date, 1);
    prevEnd = subDays(date, 1);
  } else if (period === 'week') {
    start = startOfWeek(date, { weekStartsOn: 1 });
    end = endOfWeek(date, { weekStartsOn: 1 });
    prevStart = subWeeks(start, 1);
    prevEnd = subWeeks(end, 1);
  } else if (period === 'month') {
    start = startOfMonth(date);
    end = endOfMonth(date);
    prevStart = startOfMonth(subMonths(date, 1));
    prevEnd = endOfMonth(subMonths(date, 1));
  } else {
    start = startOfYear(date);
    end = endOfYear(date);
    prevStart = startOfYear(subYears(date, 1));
    prevEnd = endOfYear(subYears(date, 1));
  }

  return {
    start:     format(start, 'yyyy-MM-dd'),
    end:       format(end, 'yyyy-MM-dd'),
    prevStart: format(prevStart, 'yyyy-MM-dd'),
    prevEnd:   format(prevEnd, 'yyyy-MM-dd'),
  };
}

export function getPeriodLabel(dateStr: string, period: AnalyticsPeriod): string {
  const date = parseISO(dateStr);
  const today = format(new Date(), 'yyyy-MM-dd');

  if (period === 'day') {
    if (dateStr === today) return 'Hoy';
    if (dateStr === format(subDays(new Date(), 1), 'yyyy-MM-dd')) return 'Ayer';
    return format(date, "d 'de' MMMM", { locale: es });
  }
  if (period === 'week') {
    const s = startOfWeek(date, { weekStartsOn: 1 });
    const e = endOfWeek(date, { weekStartsOn: 1 });
    const sm = format(s, 'MMM', { locale: es });
    const em = format(e, 'MMM', { locale: es });
    if (sm === em) return `${format(s, 'd')}–${format(e, "d MMM", { locale: es })}`;
    return `${format(s, "d MMM", { locale: es })} – ${format(e, "d MMM", { locale: es })}`;
  }
  if (period === 'month') {
    return format(date, "MMMM yyyy", { locale: es });
  }
  return format(date, 'yyyy');
}

// ─────────────────────────────────────────────────────────────────────────────
// Time series builder
// ─────────────────────────────────────────────────────────────────────────────

function buildTimeSeries(
  sales: Array<{ date: string; total: number }>,
  period: AnalyticsPeriod,
  start: string,
  end: string,
): PeriodPoint[] {
  const today        = format(new Date(), 'yyyy-MM-dd');
  const currentMonth = format(new Date(), 'yyyy-MM');

  if (period === 'year') {
    const months = eachMonthOfInterval({ start: parseISO(start), end: parseISO(end) });
    const byMonth = new Map<string, { revenue: number; salesCount: number }>();
    for (const sale of sales) {
      const key = sale.date.slice(0, 7);
      const cur = byMonth.get(key) ?? { revenue: 0, salesCount: 0 };
      byMonth.set(key, { revenue: cur.revenue + sale.total, salesCount: cur.salesCount + 1 });
    }
    return months.map(m => {
      const key  = format(m, 'yyyy-MM');
      const data = byMonth.get(key) ?? { revenue: 0, salesCount: 0 };
      return {
        label:      format(m, 'MMM', { locale: es }),
        date:       key,
        revenue:    data.revenue,
        salesCount: data.salesCount,
        isCurrent:  key === currentMonth,
      };
    });
  }

  const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
  const byDay = new Map<string, { revenue: number; salesCount: number }>();
  for (const sale of sales) {
    const cur = byDay.get(sale.date) ?? { revenue: 0, salesCount: 0 };
    byDay.set(sale.date, { revenue: cur.revenue + sale.total, salesCount: cur.salesCount + 1 });
  }
  return days.map(d => {
    const key  = format(d, 'yyyy-MM-dd');
    const data = byDay.get(key) ?? { revenue: 0, salesCount: 0 };
    const label = period === 'week'
      ? format(d, 'EEEEE', { locale: es }) // single-letter day
      : format(d, 'd');
    return {
      label,
      date:       key,
      revenue:    data.revenue,
      salesCount: data.salesCount,
      isCurrent:  key === today,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights generator
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);

function generateInsights(params: {
  totalRevenue:  number;
  prevRevenue:   number;
  growthPct:     number;
  topProducts:   ProductStat[];
  worstProducts: ProductStat[];
  topServices:   ServiceStat[];
  bestDayName:   string | null;
  period:        AnalyticsPeriod;
}): AnalyticsInsight[] {
  const { totalRevenue, prevRevenue, growthPct, topProducts, worstProducts, topServices, bestDayName, period } = params;
  const out: AnalyticsInsight[] = [];

  if (totalRevenue === 0) {
    out.push({
      type: 'info', icon: '📭',
      title: 'Sin ventas en este período',
      description: 'No se encontraron ventas registradas. Asegúrate de registrar ventas desde el módulo "Vender" para ver el análisis aquí.',
    });
    return out;
  }

  // Revenue trend vs previous period
  if (prevRevenue > 0) {
    if (growthPct >= 20) {
      out.push({
        type: 'success', icon: '🚀',
        title: `Ingresos +${growthPct.toFixed(0)}% respecto al período anterior`,
        description: `Pasaste de ${fmt(prevRevenue)} a ${fmt(totalRevenue)}. Excelente momento para reforzar el stock de tus productos más vendidos y fidelizar a tus clientes frecuentes.`,
      });
    } else if (growthPct > 2) {
      out.push({
        type: 'success', icon: '📈',
        title: `Crecimiento sostenido (+${growthPct.toFixed(0)}%)`,
        description: `Tus ingresos siguen creciendo. Analiza qué cambios realizaste en este período para repetirlos de forma consistente.`,
      });
    } else if (growthPct < -20) {
      out.push({
        type: 'warning', icon: '⚠️',
        title: `Caída de ingresos del ${Math.abs(growthPct).toFixed(0)}%`,
        description: `Los ingresos bajaron de ${fmt(prevRevenue)} a ${fmt(totalRevenue)}. Revisa si hay productos sin stock, servicios que no se ofrecen o si es una temporada baja esperada.`,
      });
    } else if (growthPct < -5) {
      out.push({
        type: 'info', icon: '📉',
        title: `Ingresos ${Math.abs(growthPct).toFixed(0)}% menores al período anterior`,
        description: `Una pequeña baja puede ser normal. Si la tendencia persiste, considera activar promociones o comunicar tus servicios en redes sociales.`,
      });
    }
  } else {
    out.push({
      type: 'info', icon: '📊',
      title: 'Primer período con datos completos',
      description: `Se registraron ${fmt(totalRevenue)} en ventas. A partir del próximo período podrás ver comparaciones de crecimiento.`,
    });
  }

  // Star product
  if (topProducts.length > 0) {
    const top = topProducts[0];
    const pct = Math.round((top.totalRevenue / totalRevenue) * 100);
    out.push({
      type: 'success', icon: '⭐',
      title: `"${top.name}" es tu producto estrella`,
      description: `Representa el ${pct}% de los ingresos totales (${fmt(top.totalRevenue)}). Mantén buen stock y considera ofrecerlo en combo con productos relacionados para aumentar el ticket promedio.`,
    });
  }

  // Star service
  if (topServices.length > 0) {
    const top = topServices[0];
    const pct = Math.round((top.totalRevenue / totalRevenue) * 100);
    out.push({
      type: 'info', icon: '🩺',
      title: `Servicio líder: "${top.name}"`,
      description: `Genera ${fmt(top.totalRevenue)} (${pct}% del total). Asegura disponibilidad constante y promuévelo como una fortaleza diferenciadora de la clínica.`,
    });
  }

  // Low margin alert
  const lowMarginProduct = topProducts.find(p => p.margin !== undefined && p.margin < 20 && p.totalRevenue > 0);
  if (lowMarginProduct) {
    out.push({
      type: 'warning', icon: '💰',
      title: `Margen bajo en "${lowMarginProduct.name}" (${lowMarginProduct.margin?.toFixed(0)}% ganancia)`,
      description: `Estás vendiendo con un margen muy reducido. Considera ajustar el precio de venta, buscar otro proveedor o evaluar si vale la pena seguir ofreciendo este producto.`,
    });
  }

  // Best day of week insight
  if (bestDayName && (period === 'month' || period === 'week')) {
    out.push({
      type: 'tip', icon: '📅',
      title: `Los ${bestDayName} generan más ventas`,
      description: `Refuerza tu equipo y asegura stock completo los ${bestDayName}. Para los días más tranquilos, considera publicaciones en redes o descuentos especiales para animarlos.`,
    });
  }

  // Slow mover
  if (worstProducts.length > 0 && topProducts.length >= 2) {
    const slow = worstProducts[0];
    const topRevenue = topProducts[0].totalRevenue;
    if (slow.totalRevenue < topRevenue * 0.05) {
      out.push({
        type: 'tip', icon: '💡',
        title: `"${slow.name}" tiene ventas muy bajas`,
        description: `Solo generó ${fmt(slow.totalRevenue)}. Prueba incluirlo en una promoción, colocarlo en un lugar más visible, o revisa si el precio está en línea con el mercado.`,
      });
    }
  }

  // Only services, no products
  if (topProducts.length === 0 && topServices.length > 0) {
    out.push({
      type: 'tip', icon: '📦',
      title: 'Oportunidad: venta de productos',
      description: `Este período solo hay ingresos por servicios. La venta de medicamentos, accesorios y alimentos puede agregar un 20–40% más de ingresos. Regístralos en "Vender".`,
    });
  }

  return out.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────

export function useFinancialAnalytics(period: AnalyticsPeriod, referenceDate: string) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    const { start, end, prevStart, prevEnd } = getPeriodRange(referenceDate, period);

    const [sales, prevSales, allProducts, allServices] = await Promise.all([
      db.sales
        .where('clinicId').equals(clinicId)
        .filter(s => !s.deletedAt && s.status !== 'cancelled' && s.date >= start && s.date <= end)
        .toArray(),
      db.sales
        .where('clinicId').equals(clinicId)
        .filter(s => !s.deletedAt && s.status !== 'cancelled' && s.date >= prevStart && s.date <= prevEnd)
        .toArray(),
      db.products.where('clinicId').equals(clinicId).filter(p => !p.deletedAt).toArray(),
      db.services.where('clinicId').equals(clinicId).filter(s => !s.deletedAt).toArray(),
    ]);

    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const serviceMap = new Map(allServices.map(s => [s.id, s]));

    const productStatsMap = new Map<string, ProductStat>();
    const serviceStatsMap = new Map<string, ServiceStat>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const isService = item.itemType === 'service' || !!item.serviceId;

        if (isService) {
          const key = item.serviceId ?? item.productId ?? item.id;
          const svc = item.serviceId ? serviceMap.get(item.serviceId) : null;
          const cur = serviceStatsMap.get(key);
          if (cur) {
            cur.totalRevenue += item.subtotal;
            cur.totalCount   += item.quantity;
          } else {
            serviceStatsMap.set(key, {
              serviceId:    key,
              name:         item.description,
              category:     svc?.category ?? 'other',
              totalRevenue: item.subtotal,
              totalCount:   item.quantity,
            });
          }
        } else if (item.productId) {
          const prod = productMap.get(item.productId);
          const margin = prod?.costPrice != null && prod.salePrice != null && prod.salePrice > 0
            ? ((prod.salePrice - prod.costPrice) / prod.salePrice) * 100
            : undefined;
          const cur = productStatsMap.get(item.productId);
          if (cur) {
            cur.totalRevenue += item.subtotal;
            cur.totalQty     += item.quantity;
            cur.salesCount   += 1;
          } else {
            productStatsMap.set(item.productId, {
              productId:    item.productId,
              name:         item.description,
              category:     prod?.category ?? 'other',
              unit:         prod?.unit ?? 'unit',
              totalRevenue: item.subtotal,
              totalQty:     item.quantity,
              salesCount:   1,
              costPrice:    prod?.costPrice,
              margin,
            });
          }
        }
      }
    }

    const sortedProducts = Array.from(productStatsMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    const sortedServices = Array.from(serviceStatsMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

    const totalRevenue = sales.reduce((s, sale) => s + sale.total, 0);
    const prevRevenue  = prevSales.reduce((s, sale) => s + sale.total, 0);
    const growthPct    = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    // Best day of week
    const ES_DAY_NAMES = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];
    const dayRevenue = Array(7).fill(0) as number[];
    for (const sale of sales) {
      dayRevenue[getDay(parseISO(sale.date))] += sale.total;
    }
    const maxDayRev  = Math.max(...dayRevenue);
    const bestDayIdx = maxDayRev > 0 ? dayRevenue.indexOf(maxDayRev) : -1;
    const bestDayName = bestDayIdx >= 0 ? ES_DAY_NAMES[bestDayIdx] : null;

    const topProducts   = sortedProducts.slice(0, 6);
    const worstProducts = sortedProducts.length > 1 ? [...sortedProducts].reverse().slice(0, 3) : [];

    const insights = generateInsights({
      totalRevenue, prevRevenue, growthPct,
      topProducts,
      worstProducts,
      topServices: sortedServices.slice(0, 6),
      bestDayName,
      period,
    });

    return {
      totalRevenue,
      prevRevenue,
      growthPct,
      transactionCount: sales.length,
      avgPerSale:       sales.length > 0 ? totalRevenue / sales.length : 0,
      timeSeries:       buildTimeSeries(sales, period, start, end),
      topProducts,
      worstProducts,
      topServices: sortedServices.slice(0, 6),
      insights,
      bestDayName,
      periodLabel: getPeriodLabel(referenceDate, period),
      start,
      end,
    } satisfies FinancialAnalytics;
  }, [period, referenceDate]);

  return { analytics: result ?? null, loading: result === undefined };
}
