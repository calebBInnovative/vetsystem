import type { PetSpecies } from './patient';
import type { PromotionLocal } from './promotion';
import type { ProductLocal } from './inventory';
import type { ServiceLocal } from './service';

// ─── Data source (selected promotion / product / service) ────────────────────

export type MarketingDataSource =
  | { type: 'promotion'; data: PromotionLocal }
  | { type: 'product';   data: ProductLocal   }
  | { type: 'service';   data: ServiceLocal   };

// Template IDs that require picking a data source from the DB
export const TEMPLATE_NEEDS_SOURCE: Record<string, 'promotion' | 'product' | 'service' | null> = {
  promo:    'promotion',
  product:  'product',
  vaccine:  'service',
  reminder: null,
  custom:   null,
};

// ─── Message template ────────────────────────────────────────────────────────

export interface MessageTemplate {
  id: string;
  label: string;
  emoji: string;
  body: string; // may contain {{dueño}}, {{mascota}}, {{clinica}}, {{especie}}
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'promo',
    label: 'Promoción',
    emoji: '🏷️',
    body: 'Hola {{dueño}} 👋\n\n¡Tenemos una promoción especial para {{mascota}}!\n\nEn *Pet\'s House* queremos cuidar a tus mascotas con lo mejor. Escríbenos para más información.\n\n📍 Pet\'s House — Catarina, Nicaragua',
  },
  {
    id: 'reminder',
    label: 'Recordatorio',
    emoji: '📅',
    body: 'Hola {{dueño}} 😊\n\n¿Cómo está {{mascota}}? Queremos recordarte que es importante mantener los controles veterinarios al día.\n\nAgenda tu cita con nosotros en *Pet\'s House*. ¡Estamos para atenderlos!\n\n📍 Pet\'s House — Catarina, Nicaragua',
  },
  {
    id: 'product',
    label: 'Producto',
    emoji: '📦',
    body: 'Hola {{dueño}} 🐾\n\nEn *Pet\'s House* tenemos productos de calidad para {{mascota}}. Alimentos, accesorios y más.\n\n¡Visítanos o escríbenos para más información!\n\n📍 Pet\'s House — Catarina, Nicaragua',
  },
  {
    id: 'vaccine',
    label: 'Vacunación',
    emoji: '💉',
    body: 'Hola {{dueño}} 👋\n\n¿{{mascota}} tiene sus vacunas al día? En *Pet\'s House* ofrecemos el plan completo de vacunación para tu mascota.\n\nContáctanos y agenda tu cita hoy.\n\n📍 Pet\'s House — Catarina, Nicaragua',
  },
  {
    id: 'custom',
    label: 'Personalizado',
    emoji: '✍️',
    body: 'Hola {{dueño}} 👋\n\n',
  },
];

// ─── Contact filter ──────────────────────────────────────────────────────────

export type ContactFilter =
  | 'all'
  | 'species_dog'
  | 'species_cat'
  | 'species_bird'
  | 'species_rabbit'
  | 'species_other'
  | 'no_visit_30'
  | 'no_visit_60'
  | 'pending_invoice';

export const CONTACT_FILTERS: Record<ContactFilter, { label: string; emoji: string; description: string }> = {
  all:           { label: 'Todos los clientes',   emoji: '👥', description: 'Todos los dueños con teléfono registrado' },
  species_dog:   { label: 'Dueños de perros',     emoji: '🐕', description: 'Clientes cuya mascota es perro' },
  species_cat:   { label: 'Dueños de gatos',      emoji: '🐈', description: 'Clientes cuya mascota es gato' },
  species_bird:  { label: 'Dueños de aves',       emoji: '🐦', description: 'Clientes cuya mascota es ave' },
  species_rabbit:{ label: 'Dueños de conejos',    emoji: '🐇', description: 'Clientes cuya mascota es conejo' },
  species_other: { label: 'Otras especies',       emoji: '🐾', description: 'Reptiles, roedores, etc.' },
  no_visit_30:   { label: 'Sin visita 30+ días',  emoji: '⏰', description: 'Clientes sin consulta en el último mes' },
  no_visit_60:   { label: 'Sin visita 60+ días',  emoji: '⚠️', description: 'Clientes sin consulta en los últimos 2 meses' },
  pending_invoice:{ label: 'Facturas pendientes', emoji: '💰', description: 'Clientes con pagos pendientes' },
};

// Species filter mapping
export const FILTER_TO_SPECIES: Partial<Record<ContactFilter, PetSpecies>> = {
  species_dog:    'dog',
  species_cat:    'cat',
  species_bird:   'bird',
  species_rabbit: 'rabbit',
  species_other:  'other',
};

// ─── Contact entry (resolved from Dexie) ─────────────────────────────────────

export interface MarketingContact {
  ownerId:     string;
  ownerName:   string;
  phone:       string;  // raw phone, may need formatting
  petNames:    string;  // comma-joined pet names
  species:     string;  // comma-joined species emojis
  lastVisit?:  number;  // ms timestamp of last consultation
  pendingAmount?: number;
}
