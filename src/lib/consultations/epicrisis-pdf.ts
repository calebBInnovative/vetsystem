import { differenceInMonths, differenceInYears, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '@/lib/db/database';
import { CONSULTATION_TYPES, type ConsultationLocal } from '@/types/consultation';
import { PET_SPECIES, PET_SEXES, type OwnerLocal, type PatientLocal } from '@/types/patient';
import type { SessionLocal } from '@/types/license';

/**
 * Epicrisis (clinical summary of a consultation) as a letter-size PDF the vet
 * downloads, prints or sends to the owner. Built from local data, so it works
 * offline. The layout follows a standard veterinary epicrisis; the narrative
 * sections live in NARRATIVE_SECTIONS so the order can follow a clinic's own format.
 */

/** Clinical text sections, in print order. Empty ones are left out. */
const NARRATIVE_SECTIONS: { title: string; value: (c: ConsultationLocal) => string | undefined }[] = [
  { title: 'Motivo de consulta',   value: (c) => c.reason },
  { title: 'Anamnesis',            value: (c) => c.anamnesis },
  { title: 'Examen físico',        value: (c) => c.physicalExam },
  { title: 'Diagnóstico',          value: (c) => c.diagnosis },
  { title: 'Tratamiento',          value: (c) => c.treatment },
  { title: 'Observaciones e indicaciones', value: (c) => c.observations },
];

const MARGIN = 48;
const BRAND: [number, number, number] = [15, 125, 110]; // #0f7d6e

function ageLabel(birthDate?: string, at = new Date()): string | undefined {
  if (!birthDate) return undefined;
  try {
    const born = parseISO(birthDate);
    const years = differenceInYears(at, born);
    if (years >= 1) return `${years} año${years !== 1 ? 's' : ''}`;
    const months = differenceInMonths(at, born);
    return `${months} mes${months !== 1 ? 'es' : ''}`;
  } catch {
    return undefined;
  }
}

function num(value: number | undefined, unit: string): string | undefined {
  return value === undefined || value === null || Number.isNaN(value) ? undefined : `${value} ${unit}`;
}

function fileSafe(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'paciente';
}

async function loadLogo(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // offline or blocked: the PDF goes without the logo
  }
}

export async function downloadEpicrisis(consultationId: string, session: SessionLocal | null): Promise<void> {
  const consultation = await db.consultations.get(consultationId);
  if (!consultation) throw new Error('Consultation not found');
  const [patient, owner] = await Promise.all([
    db.patients.get(consultation.patientId) as Promise<PatientLocal | undefined>,
    db.owners.get(consultation.ownerId) as Promise<OwnerLocal | undefined>,
  ]);

  // Loaded on demand: jsPDF is only needed when someone actually downloads one.
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const visitDate = new Date(consultation.date);
  let y = MARGIN;

  // ── Header: clinic ─────────────────────────────────────────────────────────
  // Only the clinic's own logo: /logo.jpeg is Pet's House's and must not appear on another clinic's records.
  const logo = session?.clinicLogoUrl ? await loadLogo(session.clinicLogoUrl) : null;
  if (logo) doc.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', MARGIN, y - 6, 46, 46);
  const textX = logo ? MARGIN + 58 : MARGIN;
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(20);
  doc.text(session?.clinicName || 'Clínica veterinaria', textX, y + 10);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  doc.text(['Clínica veterinaria · Nicaragua', session?.clinicTel ? `Tel. ${session.clinicTel}` : ''].filter(Boolean), textX, y + 25);

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...BRAND);
  doc.text('EPICRISIS', pageW - MARGIN, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  doc.text(`Emitida: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageW - MARGIN, y + 25, { align: 'right' });
  doc.text(`Ref.: ${consultation.id.slice(0, 8).toUpperCase()}`, pageW - MARGIN, y + 37, { align: 'right' });

  y += 52;
  doc.setDrawColor(...BRAND).setLineWidth(1.5).line(MARGIN, y, pageW - MARGIN, y);
  y += 14;

  // ── Patient, owner and visit ───────────────────────────────────────────────
  const pair = (label: string, value?: string) => [label, value?.trim() ? value : '—'];
  const species = patient ? PET_SPECIES[patient.species]?.label : undefined;
  const sex = patient ? PET_SEXES[patient.sex]?.label : undefined;
  const weight = consultation.weight ?? patient?.weight;

  const infoTable = (title: string, rows: string[][], x: number, width: number) => {
    autoTable(doc, {
      startY: y,
      margin: { left: x },
      tableWidth: width,
      head: [[{ content: title, colSpan: 2 }]],
      body: rows,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: { top: 2.5, bottom: 2.5, left: 6, right: 6 }, textColor: 30 },
      headStyles: { fillColor: [235, 245, 243], textColor: BRAND, fontStyle: 'bold', fontSize: 9.5 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: 90, cellWidth: 74 } },
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

  const half = (contentW - 14) / 2;
  const leftEnd = infoTable('Paciente', [
    pair('Nombre', patient?.name),
    pair('Especie', species),
    pair('Raza', patient?.breed),
    pair('Sexo', sex),
    pair('Edad', ageLabel(patient?.birthDate, visitDate)),
    pair('Color', patient?.color),
    pair('Peso', num(weight, 'kg')),
  ], MARGIN, half);
  const rightEnd = infoTable('Propietario', [
    pair('Nombre', owner?.name),
    pair('Teléfono', owner?.phone),
    pair('Correo', owner?.email),
    pair('Dirección', owner?.address),
  ], MARGIN + half + 14, half);
  y = Math.max(leftEnd, rightEnd) + 12;

  y = infoTable('Atención', [
    pair('Fecha', format(visitDate, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })),
    pair('Tipo', CONSULTATION_TYPES[consultation.type]?.label),
    pair('Veterinario', consultation.veterinarian),
  ], MARGIN, contentW) + 12;

  // ── Vital signs ────────────────────────────────────────────────────────────
  const vitals = [
    ['Peso', num(consultation.weight, 'kg')],
    ['Temperatura', num(consultation.temperature, '°C')],
    ['Frec. cardíaca', num(consultation.heartRate, 'lpm')],
    ['Frec. respiratoria', num(consultation.respiratoryRate, 'rpm')],
  ].filter(([, v]) => v) as string[][];
  if (vitals.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [[{ content: 'Signos vitales', colSpan: vitals.length }]],
      body: [vitals.map(([label, value]) => `${label}\n${value}`)],
      theme: 'grid',
      styles: { fontSize: 9, halign: 'center', cellPadding: 5, lineColor: [220, 225, 224], textColor: 30 },
      headStyles: { fillColor: [235, 245, 243], textColor: BRAND, fontStyle: 'bold', halign: 'left' },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  // ── Narrative sections ─────────────────────────────────────────────────────
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 44) { doc.addPage(); y = MARGIN; } // the footer sits at pageH - 24
  };
  for (const section of NARRATIVE_SECTIONS) {
    const text = section.value(consultation)?.trim();
    if (!text) continue;
    const lines = doc.setFont('helvetica', 'normal').setFontSize(10).splitTextToSize(text, contentW) as string[];
    ensureSpace(30 + Math.min(lines.length, 4) * 13);
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...BRAND);
    doc.text(section.title, MARGIN, y);
    y += 14;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
    for (const line of lines) {
      ensureSpace(13);
      doc.text(line, MARGIN, y);
      y += 13;
    }
    y += 8;
  }

  // ── Medications and services applied (no prices: this is a clinical record) ─
  if (consultation.items.length > 0) {
    ensureSpace(60);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Medicamentos y servicios aplicados', 'Cantidad']],
      body: consultation.items.map((item) => [item.description, String(item.quantity)]),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4, textColor: 30 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'center', cellWidth: 70 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  if (consultation.nextVisit) {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...BRAND).text('Próximo control', MARGIN, y);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30)
      .text(format(parseISO(consultation.nextVisit), "EEEE d 'de' MMMM 'de' yyyy", { locale: es }), MARGIN + 100, y);
    y += 20;
  }

  // ── Signature ──────────────────────────────────────────────────────────────
  // Pinned near the bottom of the page when there is room; a new page only if it really does not fit.
  // Needs ~55 pt above the footer (pageH - 24). Pinned near the bottom when there is room;
  // on a page of its own it goes near the top rather than alone at the bottom of a blank page.
  if (y + 55 > pageH - 34) {
    doc.addPage();
    y = MARGIN + 40;
  } else {
    y = Math.max(y + 30, pageH - MARGIN - 70);
  }
  const sigX = pageW / 2;
  doc.setDrawColor(120).setLineWidth(0.6).line(sigX - 110, y, sigX + 110, y);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30)
    .text(consultation.veterinarian?.trim() || 'Médico veterinario', sigX, y + 12, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text('Médico veterinario', sigX, y + 23, { align: 'center' });

  // ── Footer on every page ───────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150);
    doc.text(`${session?.clinicName || 'VetSystem'} · Epicrisis de ${patient?.name ?? 'paciente'}`, MARGIN, pageH - 24);
    doc.text(`Página ${i} de ${pages}`, pageW - MARGIN, pageH - 24, { align: 'right' });
  }

  doc.save(`Epicrisis-${fileSafe(patient?.name ?? 'paciente')}-${format(visitDate, 'yyyy-MM-dd')}.pdf`);
}
