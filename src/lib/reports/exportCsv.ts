import type { ReportSummary } from '@/hooks/useReports';
import { PRODUCT_CATEGORIES } from '@/types/inventory';
import { SERVICE_CATEGORIES } from '@/types/service';

const fmt = (n: number) => n.toFixed(2);

function csvRow(cells: (string | number)[]): string {
  return cells.map(c => {
    const s = String(c);
    // Escape cells that contain commas, quotes, or newlines
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',');
}

function section(title: string): string {
  return `\n${title}\n`;
}

export function generateCsvContent(report: ReportSummary): string {
  const lines: string[] = [];
  const periodLabel = report.from === report.to ? report.from : `${report.from} - ${report.to}`;

  // Header
  lines.push(csvRow(['REPORTE FINANCIERO — VetSystem']));
  lines.push(csvRow([`Período:,${periodLabel}`]));
  lines.push(csvRow([`Generado:,${report.generatedAt}`]));
  lines.push('');

  // Summary KPIs
  lines.push(section('RESUMEN EJECUTIVO'));
  lines.push(csvRow(['Indicador', 'Valor (NIO)']));
  lines.push(csvRow(['Ingresos totales', fmt(report.totalRevenue)]));
  lines.push(csvRow(['Ventas registradas', report.totalSalesCount]));
  lines.push(csvRow(['Ticket promedio', fmt(report.avgTicket)]));
  lines.push(csvRow(['Gastos fijos', fmt(report.totalExpenses)]));
  lines.push(csvRow(['Colaboradores', fmt(report.totalCollaborators)]));
  lines.push(csvRow(['Balance neto', fmt(report.netBalance)]));
  lines.push('');

  // Method breakdown
  lines.push(section('INGRESOS POR MÉTODO DE PAGO'));
  lines.push(csvRow(['Método', 'Total (NIO)']));
  const METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
    check: 'Cheque', mixed: 'Mixto', other: 'Otro',
  };
  for (const [method, amount] of Object.entries(report.byMethod).sort(([,a],[,b]) => b-a)) {
    lines.push(csvRow([METHOD_LABELS[method] ?? method, fmt(amount)]));
  }
  lines.push('');

  // Type breakdown
  lines.push(section('INGRESOS POR TIPO'));
  lines.push(csvRow(['Tipo', 'Total (NIO)']));
  const INCOME_TYPE_LABELS: Record<string, string> = {
    consultation: 'Consulta', vaccination: 'Vacuna', surgery: 'Cirugía',
    product: 'Producto', grooming: 'Estética', other: 'Otro',
  };
  for (const [type, amount] of Object.entries(report.byType).sort(([,a],[,b]) => b-a)) {
    lines.push(csvRow([INCOME_TYPE_LABELS[type] ?? type, fmt(amount)]));
  }
  lines.push('');

  // Daily/monthly time series
  lines.push(section('TENDENCIA DE INGRESOS'));
  lines.push(csvRow(['Fecha', 'Ingresos (NIO)', 'Ventas']));
  for (const d of report.timeSeries) {
    lines.push(csvRow([d.date, fmt(d.revenue), d.salesCount]));
  }
  lines.push('');

  // Products
  lines.push(section('PRODUCTOS MÁS VENDIDOS'));
  lines.push(csvRow(['#', 'Producto', 'Categoría', 'Unidades vendidas', 'N° ventas', 'Ingresos (NIO)', '% del total', 'Precio costo (NIO)', 'Margen (%)']));
  report.productStats.forEach((p, i) => {
    const cat = PRODUCT_CATEGORIES[p.category as keyof typeof PRODUCT_CATEGORIES];
    const pct = report.totalRevenue > 0 ? ((p.totalRevenue / report.totalRevenue) * 100).toFixed(1) : '0';
    lines.push(csvRow([
      i + 1,
      p.name,
      cat?.label ?? p.category,
      `${p.totalQty} ${p.unit}`,
      p.salesCount,
      fmt(p.totalRevenue),
      `${pct}%`,
      p.costPrice != null ? fmt(p.costPrice) : '',
      p.margin != null ? p.margin.toFixed(1) : '',
    ]));
  });
  if (report.productStats.length === 0) lines.push(csvRow(['Sin datos']));
  lines.push('');

  // Services
  lines.push(section('SERVICIOS MÁS VENDIDOS'));
  lines.push(csvRow(['#', 'Servicio', 'Categoría', 'Aplicaciones', 'Ingresos (NIO)', '% del total']));
  report.serviceStats.forEach((s, i) => {
    const cat = SERVICE_CATEGORIES[s.category as keyof typeof SERVICE_CATEGORIES];
    const pct = report.totalRevenue > 0 ? ((s.totalRevenue / report.totalRevenue) * 100).toFixed(1) : '0';
    lines.push(csvRow([
      i + 1,
      s.name,
      cat?.label ?? s.category,
      s.totalCount,
      fmt(s.totalRevenue),
      `${pct}%`,
    ]));
  });
  if (report.serviceStats.length === 0) lines.push(csvRow(['Sin datos']));
  lines.push('');

  // Payment detail
  lines.push(section('DETALLE DE PAGOS'));
  lines.push(csvRow(['Fecha', 'Concepto', 'Paciente', 'Tipo', 'Método de pago', 'Monto (NIO)', 'Estado']));
  for (const p of report.paymentRows) {
    lines.push(csvRow([p.date, p.concept, p.patientName, p.type, p.method, fmt(p.amount), p.status]));
  }
  if (report.paymentRows.length === 0) lines.push(csvRow(['Sin datos']));

  return lines.join('\n');
}

export function downloadCsv(report: ReportSummary): void {
  const content  = generateCsvContent(report);
  const BOM      = '﻿'; // UTF-8 BOM for Excel compatibility
  const blob     = new Blob([BOM + content], { type: 'text/csv;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const periodLabel = report.from === report.to ? report.from : `${report.from}_${report.to}`;
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `reporte_${periodLabel}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
