'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import { PET_SPECIES } from '@/types/patient';
import { SERVICE_CATEGORIES } from '@/types/service';
import type { ContactFilter, MarketingContact, MarketingDataSource } from '@/types/marketing';
import { FILTER_TO_SPECIES } from '@/types/marketing';

const DAYS_MS = 24 * 60 * 60 * 1000;

// ─── Contact fetcher ──────────────────────────────────────────────────────────

export function useMarketingContacts(filter: ContactFilter) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    const owners = await db.owners
      .where('clinicId').equals(clinicId)
      .filter((o) => !o.deletedAt && !!o.phone?.trim())
      .toArray();

    const patients = await db.patients
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt)
      .toArray();

    const petsByOwner = new Map<string, typeof patients>();
    for (const p of patients) {
      if (!petsByOwner.has(p.ownerId)) petsByOwner.set(p.ownerId, []);
      petsByOwner.get(p.ownerId)!.push(p);
    }

    const consultations = await db.consultations
      .where('clinicId').equals(clinicId)
      .filter((c) => !c.deletedAt)
      .toArray();

    const lastVisitByOwner = new Map<string, number>();
    for (const c of consultations) {
      const prev = lastVisitByOwner.get(c.ownerId) ?? 0;
      if (c.date > prev) lastVisitByOwner.set(c.ownerId, c.date);
    }

    const pendingPayments = await db.payments
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt && p.status === 'pending')
      .toArray();

    const pendingByOwner = new Map<string, number>();
    for (const pay of pendingPayments) {
      const pet = patients.find((pt) => pt.id === pay.patientId);
      if (pet) {
        pendingByOwner.set(pet.ownerId, (pendingByOwner.get(pet.ownerId) ?? 0) + pay.amount);
      }
    }

    const now = Date.now();

    const contacts = owners.map((owner) => {
      const pets         = petsByOwner.get(owner.id) ?? [];
      const petNames     = pets.map((p) => p.name).join(', ') || '—';
      const speciesEmojis = [...new Set(pets.map((p) => PET_SPECIES[p.species]?.emoji ?? '🐾'))].join(' ');

      return {
        ownerId:       owner.id,
        ownerName:     owner.name,
        phone:         owner.phone!.trim(),
        petNames,
        species:       speciesEmojis,
        lastVisit:     lastVisitByOwner.get(owner.id),
        pendingAmount: pendingByOwner.get(owner.id),
        _pets:         pets,
      } as MarketingContact & { _pets: typeof patients };
    });

    const speciesKey = FILTER_TO_SPECIES[filter];
    const filtered = contacts.filter((c) => {
      if (speciesKey) return c._pets.some((p) => p.species === speciesKey);
      if (filter === 'no_visit_30')    return !c.lastVisit || now - c.lastVisit > 30 * DAYS_MS;
      if (filter === 'no_visit_60')    return !c.lastVisit || now - c.lastVisit > 60 * DAYS_MS;
      if (filter === 'pending_invoice') return !!c.pendingAmount && c.pendingAmount > 0;
      return true;
    });

    return filtered.map(({ _pets, ...clean }) => {
      void _pets;
      return clean as MarketingContact;
    });
  }, [filter]);

  return { contacts: result ?? [], loading: result === undefined };
}

// ─── Data sources (promotions, products, services) ────────────────────────────

export function useMarketingDataSources() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    const promotions = await db.promotions
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt && p.active)
      .toArray();

    const products = await db.products
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt && p.active && (p.salePrice ?? 0) > 0)
      .toArray();

    const services = await db.services
      .where('clinicId').equals(clinicId)
      .filter((s) => !s.deletedAt && s.active)
      .toArray();

    return { promotions, products, services };
  }, []);

  return {
    promotions: result?.promotions ?? [],
    products:   result?.products   ?? [],
    services:   result?.services   ?? [],
    loading:    result === undefined,
  };
}

// ─── Message generator from data source ───────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function generateMessageFromSource(source: MarketingDataSource, clinicName: string): string {
  if (source.type === 'promotion') {
    const p        = source.data;
    const savings  = p.originalTotal - p.total;
    const savingsPct = p.originalTotal > 0
      ? Math.round((savings / p.originalTotal) * 100)
      : 0;

    const itemLines = p.items.map((item) => {
      const discountLine =
        item.discountType === 'percentage' ? ` (-${item.discountValue}%)` :
        item.discountType === 'fixed'      ? ` (-${fmt(item.discountValue)})` :
        item.discountType === 'free'       ? ' (¡GRATIS!)' : '';
      return `• ${item.name}${discountLine} → *${fmt(item.finalUnitPrice)}*`;
    }).join('\n');

    const validity = (p.validFrom || p.validUntil)
      ? `\n⏳ Válido: ${p.validFrom ? fmtDate(p.validFrom) : ''} ${p.validUntil ? `hasta ${fmtDate(p.validUntil)}` : ''}`
      : '';

    return `Hola {{dueño}} 👋

🏷️ *PROMOCIÓN: ${p.name}*
${p.description ? `\n${p.description}\n` : ''}
${itemLines}

💰 Precio especial: *${fmt(p.total)}*${savings > 0 ? ` (ahorras ${fmt(savings)} — ${savingsPct}% OFF)` : ''}${validity}

¡Agenda tu cita para aprovechar esta oferta! 🐾
📍 *${clinicName}*`;
  }

  if (source.type === 'product') {
    const p = source.data;
    const priceStr = p.salePrice ? `*${fmt(p.salePrice)}*` : 'Consultar precio';
    const descLine = p.description ? `\n${p.description}\n` : '';
    const inStock  = p.currentStock > 0 ? '✅ En stock' : '⚠️ Consultar disponibilidad';

    return `Hola {{dueño}} 👋

📦 *${p.name}*${descLine}

💲 Precio: ${priceStr}
${inStock}

¿Te interesa? Escríbenos o visítanos.
📍 *${clinicName}*`;
  }

  if (source.type === 'service') {
    const s        = source.data;
    const catInfo  = SERVICE_CATEGORIES[s.category];
    const priceStr = s.price > 0 ? `*${fmt(s.price)}*` : 'Consultar precio';
    const descLine = s.description ? `\n${s.description}\n` : '';

    return `Hola {{dueño}} 👋

${catInfo.emoji} *${s.name}*${descLine}

💲 Precio: ${priceStr}

Agenda tu cita con nosotros. ¡Estamos para cuidar a {{mascota}}! 🐾
📍 *${clinicName}*`;
  }

  return '';
}

// ─── Message composer (variable substitution) ─────────────────────────────────

export function composeMessage(
  template: string,
  contact: MarketingContact,
  clinicName: string,
): string {
  return template
    .replace(/\{\{dueño\}\}/g, contact.ownerName.split(' ')[0])
    .replace(/\{\{mascota\}\}/g, contact.petNames.split(',')[0].trim())
    .replace(/\{\{clinica\}\}/g, clinicName)
    .replace(/\{\{especie\}\}/g, contact.species);
}

// ─── WhatsApp URL builder ─────────────────────────────────────────────────────
// Abstracted so future versions can swap to a real API call.

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = phone.replace(/[\s\-().]/g, '');
  const withCode   = normalized.startsWith('+') ? normalized.slice(1) :
                     normalized.startsWith('505') ? normalized :
                     `505${normalized}`;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}
