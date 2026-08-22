import type { ReportSummary } from '@/hooks/useReports';
import { PRODUCT_CATEGORIES } from '@/types/inventory';
import { SERVICE_CATEGORIES } from '@/types/service';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);

const INCOME_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consulta', vaccination: 'Vacuna', surgery: 'Cirugía',
  product: 'Producto', grooming: 'Estética', other: 'Otro',
};
const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
  check: 'Cheque', mixed: 'Mixto', other: 'Otro',
};

function tr(cells: string[], isHeader = false): string {
  const tag = isHeader ? 'th' : 'td';
  return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
}

function table(headers: string[], rows: string[][], caption?: string): string {
  return `
    <table>
      ${caption ? `<caption>${caption}</caption>` : ''}
      <thead>${tr(headers, true)}</thead>
      <tbody>${rows.map(r => tr(r)).join('')}</tbody>
    </table>`;
}

function section(title: string, content: string): string {
  return `<section><h2>${title}</h2>${content}</section>`;
}

export function generatePdfHtml(report: ReportSummary, clinicName = 'Pet\'s House'): string {
  const periodLabel = report.from === report.to ? report.from : `${report.from} — ${report.to}`;

  const kpiTable = table(
    ['Indicador', 'Valor'],
    [
      ['Ingresos totales', `<strong>${fmt(report.totalRevenue)}</strong>`],
      ['Ventas registradas', String(report.totalSalesCount)],
      ['Ticket promedio', fmt(report.avgTicket)],
      ['Gastos fijos', fmt(report.totalExpenses)],
      ['Colaboradores', fmt(report.totalCollaborators)],
      ['Balance neto', `<strong class="${report.netBalance >= 0 ? 'pos' : 'neg'}">${fmt(report.netBalance)}</strong>`],
    ],
  );

  const productTable = report.productStats.length > 0
    ? table(
        ['#', 'Producto', 'Categoría', 'Unidades', 'Ventas', 'Ingresos', '% del total'],
        report.productStats.map((p, i) => {
          const cat = PRODUCT_CATEGORIES[p.category as keyof typeof PRODUCT_CATEGORIES];
          const pct = report.totalRevenue > 0 ? ((p.totalRevenue / report.totalRevenue) * 100).toFixed(1) : '0';
          return [
            String(i + 1),
            p.name,
            `${cat?.emoji ?? ''} ${cat?.label ?? p.category}`,
            `${p.totalQty} ${p.unit}`,
            String(p.salesCount),
            fmt(p.totalRevenue),
            `${pct}%`,
          ];
        }),
      )
    : '<p class="empty">Sin ventas de productos en este período.</p>';

  const serviceTable = report.serviceStats.length > 0
    ? table(
        ['#', 'Servicio', 'Categoría', 'Aplicaciones', 'Ingresos', '% del total'],
        report.serviceStats.map((s, i) => {
          const cat = SERVICE_CATEGORIES[s.category as keyof typeof SERVICE_CATEGORIES];
          const pct = report.totalRevenue > 0 ? ((s.totalRevenue / report.totalRevenue) * 100).toFixed(1) : '0';
          return [
            String(i + 1),
            s.name,
            `${cat?.emoji ?? ''} ${cat?.label ?? s.category}`,
            String(s.totalCount),
            fmt(s.totalRevenue),
            `${pct}%`,
          ];
        }),
      )
    : '<p class="empty">Sin servicios vendidos en este período.</p>';

  const methodRows = Object.entries(report.byMethod)
    .sort(([, a], [, b]) => b - a)
    .map(([method, amount]) => [METHOD_LABELS[method] ?? method, fmt(amount)]);

  const typeRows = Object.entries(report.byType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, amount]) => [INCOME_TYPE_LABELS[type] ?? type, fmt(amount)]);

  const paymentTable = report.paymentRows.length > 0
    ? table(
        ['Fecha', 'Concepto', 'Paciente', 'Tipo', 'Método', 'Monto', 'Estado'],
        report.paymentRows.map(p => [
          p.date, p.concept, p.patientName, p.type, p.method, fmt(p.amount), p.status,
        ]),
      )
    : '<p class="empty">Sin pagos registrados en este período.</p>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte — ${clinicName} — ${periodLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #0f7d6e; }
  .clinic-name { font-size: 18px; font-weight: 700; color: #0f7d6e; }
  .report-meta { text-align: right; color: #555; font-size: 10px; line-height: 1.6; }
  h2 { font-size: 13px; font-weight: 700; color: #0f7d6e; margin: 20px 0 8px; border-left: 3px solid #0f7d6e; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
  caption { text-align: left; font-size: 10px; color: #777; margin-bottom: 4px; }
  thead th { background: #0f7d6e; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f7f7f7; }
  .pos { color: #166534; font-weight: 700; }
  .neg { color: #991b1b; font-weight: 700; }
  .empty { color: #777; font-style: italic; padding: 8px 0; font-size: 10px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  section { page-break-inside: avoid; }
  @media print {
    body { padding: 12px; }
    button, .no-print { display: none !important; }
    @page { margin: 15mm; size: A4; }
  }
</style>
</head>
<body>
<header>
  <div>
    <div class="clinic-name">🐾 ${clinicName}</div>
    <div style="font-size:11px;margin-top:4px;color:#555;">Reporte financiero</div>
  </div>
  <div class="report-meta">
    <div><strong>Período:</strong> ${periodLabel}</div>
    <div><strong>Generado:</strong> ${report.generatedAt}</div>
    <div>VetSystem</div>
  </div>
</header>

${section('Resumen ejecutivo', kpiTable)}

<div class="two-col">
  ${section('Ingresos por método de pago', methodRows.length ? table(['Método', 'Total'], methodRows) : '<p class="empty">Sin datos.</p>')}
  ${section('Ingresos por tipo', typeRows.length ? table(['Tipo', 'Total'], typeRows) : '<p class="empty">Sin datos.</p>')}
</div>

${section('Productos más vendidos', productTable)}
${section('Servicios más vendidos', serviceTable)}
${section('Detalle de pagos', paymentTable)}

<footer style="margin-top:24px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:right;">
  Generado por VetSystem · ${report.generatedAt}
</footer>

<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;
}

export function openPdfReport(report: ReportSummary, clinicName?: string): void {
  const html = generatePdfHtml(report, clinicName);
  const win  = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.');
    return;
  }
  win.document.write(html);
  win.document.close();
}
