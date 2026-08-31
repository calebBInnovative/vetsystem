'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import { format, parseISO, eachDayOfInterval, eachMonthOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

export interface ReportProductStat {
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

export interface ReportServiceStat {
  serviceId:    string;
  name:         string;
  category:     string;
  totalRevenue: number;
  totalCount:   number;
}

export interface ReportCategoryStat {
  category:     string;
  label:        string;
  emoji:        string;
  totalRevenue: number;
  itemCount:    number;
}

export interface ReportDayStat {
  date:         string;  // YYYY-MM-DD
  label:        string;
  revenue:      number;
  salesCount:   number;
  isCurrent:    boolean;
}

export interface ReportPaymentRow {
  id:            string;
  date:          string;
  concept:       string;
  patientName:   string;
  type:          string;
  method:        string;
  amount:        number;
  status:        string;
}

export interface ReportExpenseRow {
  id:       string;
  date:     string;
  name:     string;
  category: string;
  amount:   number;
  notes?:   string;
}

export interface ReportCollaboratorRow {
  id:     string;
  date:   string;
  name:   string;
  role:   string;
  amount: number;
  notes?: string;
}

export interface ReportSummary {
  // KPIs
  totalRevenue:        number;
  totalSalesCount:     number;
  avgTicket:           number;
  totalExpenses:       number;
  totalCollaborators:  number;
  netBalance:          number;
  // Breakdowns
  productStats:        ReportProductStat[];
  serviceStats:        ReportServiceStat[];
  categoryStats:       ReportCategoryStat[];
  // Time series (days for ≤90-day ranges, months otherwise)
  timeSeries:          ReportDayStat[];
  // Payment detail
  paymentRows:         ReportPaymentRow[];
  // Expense detail
  expenseRows:         ReportExpenseRow[];
  collaboratorRows:    ReportCollaboratorRow[];
  byExpenseCategory:   Record<string, number>;
  // Method breakdown
  byMethod:            Record<string, number>;
  byType:              Record<string, number>;
  // Meta
  from:                string;
  to:                  string;
  generatedAt:         string;
}

export function useReportData(from: string, to: string) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    const [sales, payments, expensePayments, collaboratorPayments, allProducts, allServices, allFixedExpenses, allCollaborators] =
      await Promise.all([
        db.sales
          .where('clinicId').equals(clinicId)
          .filter(s => !s.deletedAt && s.status !== 'cancelled' && s.date >= from && s.date <= to)
          .toArray(),
        db.payments
          .where('clinicId').equals(clinicId)
          .filter(p => !p.deletedAt && p.date >= from && p.date <= to)
          .toArray(),
        db.expensePayments
          .where('clinicId').equals(clinicId)
          .filter(ep => !ep.deletedAt && ep.paymentDate >= from && ep.paymentDate <= to)
          .toArray(),
        db.collaboratorPayments
          .where('clinicId').equals(clinicId)
          .filter(cp => !cp.deletedAt && cp.paymentDate >= from && cp.paymentDate <= to)
          .toArray(),
        db.products.where('clinicId').equals(clinicId).filter(p => !p.deletedAt).toArray(),
        db.services.where('clinicId').equals(clinicId).filter(s => !s.deletedAt).toArray(),
        db.fixedExpenses.where('clinicId').equals(clinicId).filter(e => !e.deletedAt).toArray(),
        db.collaborators.where('clinicId').equals(clinicId).filter(c => !c.deletedAt).toArray(),
      ]);

    const fixedExpenseMap = new Map(allFixedExpenses.map(e => [e.id, e]));
    const collaboratorMap = new Map(allCollaborators.map(c => [c.id, c]));

    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const serviceMap = new Map(allServices.map(s => [s.id, s]));

    // Enrich payments with patient names
    const patientIds = [...new Set(payments.filter(p => p.patientId).map(p => p.patientId!))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patMap     = new Map(patients.filter(Boolean).map(p => [p!.id, p!.name]));

    // Aggregate product/service stats from sale items
    const productStats  = new Map<string, ReportProductStat>();
    const serviceStats  = new Map<string, ReportServiceStat>();
    const categoryStats = new Map<string, ReportCategoryStat>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const isService = item.itemType === 'service' || !!item.serviceId;

        if (isService) {
          const key = item.serviceId ?? item.productId ?? item.id;
          const svc = item.serviceId ? serviceMap.get(item.serviceId) : null;
          const cur = serviceStats.get(key);
          if (cur) {
            cur.totalRevenue += item.subtotal;
            cur.totalCount   += item.quantity;
          } else {
            serviceStats.set(key, {
              serviceId:    key,
              name:         item.description,
              category:     svc?.category ?? 'other',
              totalRevenue: item.subtotal,
              totalCount:   item.quantity,
            });
          }
          // Category rollup
          const catKey = `svc_${svc?.category ?? 'other'}`;
          const catCur = categoryStats.get(catKey);
          if (catCur) { catCur.totalRevenue += item.subtotal; catCur.itemCount += item.quantity; }
          else categoryStats.set(catKey, { category: catKey, label: svc?.category ?? 'other', emoji: '🩺', totalRevenue: item.subtotal, itemCount: item.quantity });
        } else if (item.productId) {
          const prod   = productMap.get(item.productId);
          const margin = prod?.costPrice != null && prod.salePrice != null && prod.salePrice > 0
            ? ((prod.salePrice - prod.costPrice) / prod.salePrice) * 100
            : undefined;
          const cur = productStats.get(item.productId);
          if (cur) {
            cur.totalRevenue += item.subtotal;
            cur.totalQty     += item.quantity;
            cur.salesCount   += 1;
          } else {
            productStats.set(item.productId, {
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
          // Category rollup
          const catKey = prod?.category ?? 'other';
          const catCur = categoryStats.get(catKey);
          if (catCur) { catCur.totalRevenue += item.subtotal; catCur.itemCount += item.quantity; }
          else categoryStats.set(catKey, { category: catKey, label: catKey, emoji: '📦', totalRevenue: item.subtotal, itemCount: item.quantity });
        }
      }
    }

    const sortedProducts = Array.from(productStats.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    const sortedServices = Array.from(serviceStats.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    const sortedCategories = Array.from(categoryStats.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // KPI aggregations
    const totalRevenue       = sales.reduce((s, sale) => s + sale.total, 0);
    const totalExpenses      = expensePayments.reduce((s, ep) => s + ep.amount, 0);
    const totalCollaborators = collaboratorPayments.reduce((s, cp) => s + cp.amount, 0);

    // Expense detail rows
    const expenseRows: ReportExpenseRow[] = expensePayments
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map(ep => {
        const parent = fixedExpenseMap.get(ep.fixedExpenseId);
        return { id: ep.id, date: ep.paymentDate, name: parent?.name ?? '—', category: parent?.category ?? 'other', amount: ep.amount, notes: ep.notes };
      });

    const collaboratorRows: ReportCollaboratorRow[] = collaboratorPayments
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map(cp => {
        const collab = collaboratorMap.get(cp.collaboratorId);
        return { id: cp.id, date: cp.paymentDate, name: collab?.name ?? '—', role: collab?.role ?? '—', amount: cp.amount, notes: cp.notes };
      });

    const byExpenseCategory = expensePayments.reduce<Record<string, number>>((acc, ep) => {
      const cat = fixedExpenseMap.get(ep.fixedExpenseId)?.category ?? 'other';
      acc[cat] = (acc[cat] ?? 0) + ep.amount;
      return acc;
    }, {});

    // Payment method + type breakdown from payments table
    const byMethod: Record<string, number> = {};
    const byType:   Record<string, number> = {};
    for (const p of payments.filter(p => p.status === 'paid')) {
      byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] ?? 0) + p.amount;
      byType[p.type]            = (byType[p.type]            ?? 0) + p.amount;
    }

    // Time series — use days for ranges ≤ 93 days, months otherwise
    const start = parseISO(from);
    const end   = parseISO(to);
    const daysDiff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const today    = format(new Date(), 'yyyy-MM-dd');
    const currentMonth = format(new Date(), 'yyyy-MM');

    let timeSeries: ReportDayStat[];
    if (daysDiff <= 93) {
      const byDay = new Map<string, { revenue: number; salesCount: number }>();
      for (const sale of sales) {
        const cur = byDay.get(sale.date) ?? { revenue: 0, salesCount: 0 };
        byDay.set(sale.date, { revenue: cur.revenue + sale.total, salesCount: cur.salesCount + 1 });
      }
      timeSeries = eachDayOfInterval({ start, end }).map(d => {
        const key  = format(d, 'yyyy-MM-dd');
        const data = byDay.get(key) ?? { revenue: 0, salesCount: 0 };
        return {
          date:       key,
          label:      daysDiff <= 7 ? format(d, 'EEE', { locale: es }) : format(d, 'd'),
          revenue:    data.revenue,
          salesCount: data.salesCount,
          isCurrent:  key === today,
        };
      });
    } else {
      const byMonth = new Map<string, { revenue: number; salesCount: number }>();
      for (const sale of sales) {
        const key = sale.date.slice(0, 7);
        const cur = byMonth.get(key) ?? { revenue: 0, salesCount: 0 };
        byMonth.set(key, { revenue: cur.revenue + sale.total, salesCount: cur.salesCount + 1 });
      }
      timeSeries = eachMonthOfInterval({ start, end }).map(m => {
        const key  = format(m, 'yyyy-MM');
        const data = byMonth.get(key) ?? { revenue: 0, salesCount: 0 };
        return {
          date:       key,
          label:      format(m, 'MMM', { locale: es }),
          revenue:    data.revenue,
          salesCount: data.salesCount,
          isCurrent:  key === currentMonth,
        };
      });
    }

    // Payment rows for detail table
    const INCOME_TYPE_LABELS: Record<string, string> = {
      consultation: 'Consulta', vaccination: 'Vacuna', surgery: 'Cirugía',
      product: 'Producto', grooming: 'Estética', other: 'Otro',
    };
    const METHOD_LABELS: Record<string, string> = {
      cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
      check: 'Cheque', mixed: 'Mixto', other: 'Otro',
    };
    const STATUS_LABELS: Record<string, string> = {
      paid: 'Pagado', pending: 'Pendiente', cancelled: 'Cancelado', refunded: 'Reembolsado',
    };

    const paymentRows: ReportPaymentRow[] = payments
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(p => ({
        id:          p.id,
        date:        p.date,
        concept:     p.concept,
        patientName: p.patientId ? (patMap.get(p.patientId) ?? '—') : '—',
        type:        INCOME_TYPE_LABELS[p.type]   ?? p.type,
        method:      METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
        amount:      p.amount,
        status:      STATUS_LABELS[p.status]      ?? p.status,
      }));

    return {
      totalRevenue,
      totalSalesCount:    sales.length,
      avgTicket:          sales.length > 0 ? totalRevenue / sales.length : 0,
      totalExpenses,
      totalCollaborators,
      netBalance:         totalRevenue - totalExpenses - totalCollaborators,
      productStats:       sortedProducts,
      serviceStats:       sortedServices,
      categoryStats:      sortedCategories,
      timeSeries,
      paymentRows,
      expenseRows,
      collaboratorRows,
      byExpenseCategory,
      byMethod,
      byType,
      from,
      to,
      generatedAt: format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es }),
    } satisfies ReportSummary;
  }, [from, to]);

  return { report: result ?? null, loading: result === undefined };
}
