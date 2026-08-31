'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import { PET_SPECIES } from '@/types/patient';
import type { ContactFilter, MarketingContact } from '@/types/marketing';
import { FILTER_TO_SPECIES } from '@/types/marketing';

const DAYS_MS = 24 * 60 * 60 * 1000;

export function useMarketingContacts(filter: ContactFilter) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    // Load owners with a phone number
    const owners = await db.owners
      .where('clinicId').equals(clinicId)
      .filter((o) => !o.deletedAt && !!o.phone?.trim())
      .toArray();

    // Load all active patients for this clinic
    const patients = await db.patients
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt)
      .toArray();

    // Build owner → patients map
    const petsByOwner = new Map<string, typeof patients>();
    for (const p of patients) {
      if (!petsByOwner.has(p.ownerId)) petsByOwner.set(p.ownerId, []);
      petsByOwner.get(p.ownerId)!.push(p);
    }

    // Last consultation per owner
    const consultations = await db.consultations
      .where('clinicId').equals(clinicId)
      .filter((c) => !c.deletedAt)
      .toArray();

    const lastVisitByOwner = new Map<string, number>();
    for (const c of consultations) {
      const prev = lastVisitByOwner.get(c.ownerId) ?? 0;
      if (c.date > prev) lastVisitByOwner.set(c.ownerId, c.date);
    }

    // Pending invoice amounts per owner
    const pendingPayments = await db.payments
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt && p.status === 'pending')
      .toArray();

    const pendingByOwner = new Map<string, number>();
    for (const pay of pendingPayments) {
      // payments don't have ownerId directly, resolve via patient
      const pet = patients.find((pt) => pt.id === pay.patientId);
      if (pet) {
        pendingByOwner.set(pet.ownerId, (pendingByOwner.get(pet.ownerId) ?? 0) + pay.amount);
      }
    }

    const now = Date.now();

    // Build contact list
    const contacts: MarketingContact[] = owners.map((owner) => {
      const pets     = petsByOwner.get(owner.id) ?? [];
      const petNames = pets.map((p) => p.name).join(', ') || '—';
      const speciesEmojis = [...new Set(pets.map((p) => PET_SPECIES[p.species]?.emoji ?? '🐾'))].join(' ');

      return {
        ownerId:       owner.id,
        ownerName:     owner.name,
        phone:         owner.phone!.trim(),
        petNames,
        species:       speciesEmojis,
        lastVisit:     lastVisitByOwner.get(owner.id),
        pendingAmount: pendingByOwner.get(owner.id),
        _pets:         pets, // internal, stripped below
      } as MarketingContact & { _pets: typeof patients };
    });

    // Apply filter
    const speciesKey = FILTER_TO_SPECIES[filter];
    const filtered = contacts.filter((c) => {
      const raw = c as MarketingContact & { _pets: typeof patients };
      if (speciesKey) {
        return raw._pets.some((p) => p.species === speciesKey);
      }
      if (filter === 'no_visit_30') {
        return !c.lastVisit || now - c.lastVisit > 30 * DAYS_MS;
      }
      if (filter === 'no_visit_60') {
        return !c.lastVisit || now - c.lastVisit > 60 * DAYS_MS;
      }
      if (filter === 'pending_invoice') {
        return !!c.pendingAmount && c.pendingAmount > 0;
      }
      return true; // 'all'
    });

    // Strip internal field
    return filtered.map(({ ...rest }) => {
      const { _pets, ...clean } = rest as typeof rest & { _pets: unknown };
      void _pets;
      return clean as MarketingContact;
    });
  }, [filter]);

  return {
    contacts: result ?? [],
    loading:  result === undefined,
  };
}

// ─── Message composer ─────────────────────────────────────────────────────────

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

// ─── Send via WhatsApp (wa.me link) ─────────────────────────────────────────
// Abstracted so future versions can swap to a real API call.

export function buildWhatsAppUrl(phone: string, message: string): string {
  // Normalize phone: strip spaces/dashes, ensure country code
  const normalized = phone.replace(/[\s\-().]/g, '');
  const withCode   = normalized.startsWith('+') ? normalized.slice(1) :
                     normalized.startsWith('505') ? normalized :
                     `505${normalized}`; // default to Nicaragua (+505)
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}
