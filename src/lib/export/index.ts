'use client';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  sheetName = 'Datos',
): void {
  const rows = data.map((row) =>
    columns.reduce<Record<string, unknown>>((acc, col) => {
      acc[col.header] = row[col.key] ?? '';
      return acc;
    }, {})
  );

  const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map((c) => c.header) });
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export function exportToPdf(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  title: string,
  clinicName = "Pet's House",
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  const now   = new Date().toLocaleString('es-NI', { dateStyle: 'long', timeStyle: 'short' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(clinicName, 40, 40);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 40, 58);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(now, pageW - 40, 40, { align: 'right' });
  doc.setTextColor(0);

  autoTable(doc, {
    head:  [columns.map((c) => c.header)],
    body:  data.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
    startY: 72,
    styles:     { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 125, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 250, 249] },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${data.pageNumber} de ${doc.getNumberOfPages()}`,
        pageW - 40,
        doc.internal.pageSize.getHeight() - 15,
        { align: 'right' }
      );
      doc.setTextColor(0);
    },
  });

  doc.save(`${filename}.pdf`);
}
