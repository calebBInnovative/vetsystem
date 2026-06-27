import type { FacturaCompleta } from '@/types/factura';
import type { SessionLocal } from '@/types/licencia';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtR(n: number) {
  return n.toFixed(2).replace('.', ',') + ' C$';
}
function fmtQ(n: number) {
  return n.toFixed(2).replace('.', ',');
}
function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const ROLE_LABEL: Record<string, string> = {
  master:      'Master',
  admin:       'Administrador',
  veterinario: 'Veterinario',
  recepcion:   'Recepción',
};

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHtml(factura: FacturaCompleta, session: SessionLocal | null): string {
  const clinicName   = session?.clinicName ?? 'House of Pets';
  const roleLabel    = ROLE_LABEL[session?.role ?? ''] ?? '';
  // Only the part before @ — e.g. "caleb" from "caleb@example.com"
  const emailAlias   = session?.email?.split('@')[0] ?? '';
  const atendidoPor  = [roleLabel, emailAlias].filter(Boolean).join(' ');

  const metodos: Record<string, string> = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta',
    transferencia: 'Transferencia', mixto: 'Mixto',
  };

  const montoCobrado = factura.montoPagado > 0 ? factura.montoPagado : factura.total;
  const saldoPend    = factura.estado === 'parcialmente_pagada'
    ? factura.total - factura.montoPagado : 0;

  // ── Items ──
  const itemsHtml = factura.items.map((item) => `
    <div class="item">
      <div class="item-row">
        <span class="item-name">${escHtml(item.descripcion.toUpperCase())}</span>
        <span class="item-total">${fmtR(item.subtotal)}</span>
      </div>
      <div class="item-detail">
        ${fmtQ(item.cantidad)}&nbsp;&nbsp;x&nbsp;&nbsp;${fmtR(item.precioUnitario)} / ${item.tipo === 'producto' ? 'Unidades' : 'Servicio'}
      </div>
    </div>
  `).join('');

  // ── Paciente / dueño ──
  const pacienteHtml = (factura.nombrePaciente || factura.nombreDueno) ? `
    <div class="center info-block">
      ${factura.nombrePaciente ? `<div>Paciente: <strong>${escHtml(factura.nombrePaciente)}</strong>${factura.especiePaciente ? ` (${escHtml(factura.especiePaciente)})` : ''}</div>` : ''}
      ${factura.nombreDueno    ? `<div>Due&ntilde;o: <strong>${escHtml(factura.nombreDueno)}</strong>${factura.telefonoDueno ? ` &middot; ${escHtml(factura.telefonoDueno)}` : ''}</div>` : ''}
    </div>
    <div class="dash"></div>
  ` : '';

  const descuentoHtml = factura.descuento > 0
    ? `<div class="row small"><span>Descuento</span><span>- ${fmtR(factura.descuento)}</span></div>` : '';

  const saldoHtml = factura.estado === 'parcialmente_pagada'
    ? `<div class="row small"><span>Saldo pendiente</span><span>${fmtR(saldoPend)}</span></div>` : '';

  const notasHtml = factura.notas
    ? `<div class="dash"></div><div class="notas">${escHtml(factura.notas)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Recibo ${escHtml(factura.numero)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm 5mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    color: #000;
    background: #fff;
    width: 70mm;
  }

  /* ── Layout helpers ── */
  .center { text-align: center; }
  .dash   { border-top: 1px dashed #000; margin: 10px 0; }
  .gap-sm { height: 5px; }
  .gap-md { height: 10px; }

  /* ── Header ── */
  img.logo {
    display: block;
    width: 58px; height: 58px;
    object-fit: cover;
    border-radius: 50%;
    margin: 0 auto 7px;
  }
  .clinic-name {
    font-weight: bold;
    font-size: 14px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .clinic-sub {
    font-size: 10px;
    line-height: 1.8;
    color: #333;
  }

  /* ── Atendido por ── */
  .attended {
    font-size: 10px;
    letter-spacing: 0.3px;
  }

  /* ── Paciente ── */
  .info-block {
    font-size: 10px;
    line-height: 1.8;
  }

  /* ── Items ── */
  .items-section { margin: 4px 0; }
  .item          { margin-bottom: 9px; }
  .item-row      { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
  .item-name     { font-weight: bold; font-size: 11px; flex: 1; }
  .item-total    { white-space: nowrap; font-weight: bold; font-size: 11px; }
  .item-detail   { font-size: 9.5px; color: #444; margin-top: 1px; padding-left: 2px; }

  /* ── Totales ── */
  .row           { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .row.total     { font-weight: bold; font-size: 13px; margin-top: 2px; margin-bottom: 6px; }
  .row.metodo    { font-size: 10.5px; }
  .row.descuento { font-size: 10px; color: #333; }
  .row.saldo     { font-size: 10px; }

  /* ── Orden y fecha ── */
  .orden-block {
    text-align: center;
    margin-top: 4px;
  }
  .orden-num  { font-weight: bold; font-size: 11px; letter-spacing: 0.4px; }
  .orden-date { font-size: 10px; color: #444; margin-top: 2px; }

  /* ── Notas ── */
  .notas { font-size: 10px; white-space: pre-wrap; color: #333; }

  /* ── Footer ── */
  .footer {
    text-align: center;
    font-size: 9px;
    color: #666;
    letter-spacing: 0.3px;
    margin-top: 2px;
  }
</style>
</head>
<body>

  <!-- 1. Logo + datos de clínica -->
  <div class="center">
    <img class="logo" src="/logo.jpeg" alt="logo" />
    <div class="gap-sm"></div>
    <div class="clinic-name">${escHtml(clinicName)}</div>
    <div class="clinic-sub">Clínica Veterinaria · Nicaragua</div>
    ${session?.clinicTel ? `<div class="clinic-sub">Tel: ${escHtml(session.clinicTel)}</div>` : ''}
  </div>

  <div class="dash"></div>

  <!-- 2. Atendido por -->
  ${atendidoPor ? `
  <div class="center attended">Atendido por ${escHtml(atendidoPor)}</div>
  <div class="gap-md"></div>
  ` : ''}

  <!-- 3. Paciente / dueño (si aplica) -->
  ${pacienteHtml}

  <!-- 4. Items -->
  <div class="items-section">
    ${itemsHtml}
  </div>

  ${descuentoHtml}

  <div class="dash"></div>

  <!-- 5. Totales -->
  <div class="row total">
    <span>TOTAL</span>
    <span>${fmtR(factura.total)}</span>
  </div>
  <div class="row metodo">
    <span>${escHtml(metodos[factura.metodoPago] ?? factura.metodoPago)}</span>
    <span>${fmtR(montoCobrado)}</span>
  </div>
  ${saldoHtml}

  <div class="dash"></div>

  <!-- 6. Orden y fecha -->
  <div class="orden-block">
    <div class="orden-num">Orden&nbsp;#&nbsp;${escHtml(factura.numero)}</div>
    <div class="orden-date">${fmtFecha(factura.fecha)}</div>
  </div>

  ${notasHtml}

  <div class="dash"></div>
  <div class="footer">Con la tecnolog&iacute;a de VetSystem</div>
  <div class="gap-md"></div>

  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Exportado ─────────────────────────────────────────────────────────────────

export function printRecibo(factura: FacturaCompleta, session: SessionLocal | null): void {
  // Abrir pestaña/ventana sin restricciones de tamaño — el @page controla el papel
  const win = window.open('', '_blank');
  if (!win) {
    window.print();
    return;
  }
  win.document.write(buildHtml(factura, session));
  win.document.close();
}
