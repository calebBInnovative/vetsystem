import { addCatalogProduct, fetchCatalogProducts } from './catalog';
import type { CatalogProduct } from '@/types/catalog';

// All products extracted from the Riverfarma Pets 2025 vademécum PDF.
// Run once from /admin/catalog → "Cargar Riverfarma Pets".

const RIVERFARMA_PETS: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // ── Analgésicos y Antiinflamatorios ──────────────────────────────────────
  {
    name:               'Dolo-Vet Tabletas',
    activeIngredient:   'Ketorolaco trometamina 5 mg',
    category:           'analgesic',
    dosageForm:         'tablet',
    presentations:      ['caja 20 tabletas', 'exhibidor 25 carteras x4'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-004',
    species:            ['dogs', 'cats'],
  },

  // ── Antibióticos ──────────────────────────────────────────────────────────
  {
    name:               'Enrocilina Tabletas',
    activeIngredient:   'Enrofloxacina 50 mg',
    category:           'antimicrobial',
    dosageForm:         'tablet',
    presentations:      ['caja 20 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-074',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Sulfatrim',
    activeIngredient:   'Trimetoprim 4g + Sulfametoxazol 20g / 100ml',
    category:           'antimicrobial',
    dosageForm:         'injectable',
    presentations:      ['10 ml', '25 ml', '50 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-013',
    species:            ['dogs', 'cats'],
  },

  // ── Antimicóticos ─────────────────────────────────────────────────────────
  {
    name:               'Micofin Tabletas',
    activeIngredient:   'Terbinafina 100 mg',
    category:           'antifungal',
    dosageForm:         'tablet',
    presentations:      ['expedidor 25 carteras x4'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-106',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Micofin 1%',
    activeIngredient:   'Terbinafina clorhidrato 1g / 100ml',
    category:           'antifungal',
    dosageForm:         'topical_solution',
    presentations:      ['30 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-103',
    species:            ['dogs', 'cats'],
  },

  // ── Desparasitantes ───────────────────────────────────────────────────────
  {
    name:               'Benzamin B12',
    activeIngredient:   'Diminazeno aceturato 42mg + Antipirina 400mg + Vitamina B12 40mcg / ml',
    category:           'antiparasitic',
    dosageForm:         'injectable',
    presentations:      ['25 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-018',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Endovet CES Inyectable',
    activeIngredient:   'Ivermectina 2mg + Prazicuantel 60mg / ml',
    category:           'antiparasitic',
    dosageForm:         'injectable',
    presentations:      ['10 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-098',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Endovet CES Tabletas',
    activeIngredient:   'Ivermectina 2mg + Prazicuantel 50mg / tableta',
    category:           'antiparasitic',
    dosageForm:         'tablet',
    presentations:      ['caja 20 tabletas', 'expedidor 25 carteras x4'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-084',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Endovet Crema',
    activeIngredient:   'Ivermectina 4mg / g',
    category:           'antiparasitic',
    dosageForm:         'cream',
    presentations:      ['50 g'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-097',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Endovet Tabletas',
    activeIngredient:   'Ivermectina 2 mg / tableta',
    category:           'antiparasitic',
    dosageForm:         'tablet',
    presentations:      ['caja 20 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-081',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Imidofin Inyectable',
    activeIngredient:   'Imidocarb dipropionato 100mg / ml',
    category:           'antiparasitic',
    dosageForm:         'injectable',
    presentations:      ['10 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-096',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Imidofin Tabletas',
    activeIngredient:   'Imidocarb dipropionato 60mg / tableta',
    category:           'antiparasitic',
    dosageForm:         'tablet',
    presentations:      ['caja 20 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-099',
    species:            ['dogs', 'cats'],
  },

  // ── Diuréticos ────────────────────────────────────────────────────────────
  {
    name:               'Diuravet',
    activeIngredient:   'Furosemida 500mg / 10ml',
    category:           'diuretic',
    dosageForm:         'injectable',
    presentations:      ['10 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-009',
    species:            ['dogs', 'cats'],
  },

  // ── Expectorantes ─────────────────────────────────────────────────────────
  {
    name:               'Bronquivet NF',
    activeIngredient:   'Guayacol 10g + Carbocisteína 20g + Piroxicam 2g / 100ml',
    category:           'expectorant',
    dosageForm:         'injectable',
    presentations:      ['50 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-057',
    species:            ['dogs', 'cats'],
  },

  // ── Oftálmicos ────────────────────────────────────────────────────────────
  {
    name:               'Dolo-Vet Oftálmico',
    activeIngredient:   'Gentamicina 5mg + Ketorolaco 5mg / ml',
    category:           'ophthalmic',
    dosageForm:         'ophthalmic_solution',
    presentations:      ['caja 10 frascos x 10ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-090',
    species:            ['dogs', 'cats'],
  },

  // ── Óticos ───────────────────────────────────────────────────────────────
  {
    name:               'Dolo-Vet Ótico',
    activeIngredient:   'Gentamicina 5mg + Ketorolaco 5mg + Miconazol 20mg / ml',
    category:           'otic',
    dosageForm:         'otic_suspension',
    presentations:      ['caja 10 frascos x 10ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-091',
    species:            ['dogs', 'cats'],
  },

  // ── Reconstituyentes ─────────────────────────────────────────────────────
  {
    name:               'Electrólitos',
    activeIngredient:   'Bicarbonato sodio + Cloruro potasio + Cloruro sodio + Dextrosa + Sulfato magnesio',
    category:           'reconstitutent',
    dosageForm:         'oral_powder',
    presentations:      ['caja 50 sobres x5g', 'caja 10 sobres x100g', 'cubeta 5kg'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-005',
    species:            ['dogs', 'cats'],
  },
  {
    name:               'Vitamina B12 5500',
    activeIngredient:   'Cianocobalamina 5500 mcg / ml',
    category:           'reconstitutent',
    dosageForm:         'injectable',
    presentations:      ['30 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-110',
    species:            ['dogs', 'cats'],
  },
];

/** Seeds publicCatalog with all Riverfarma Pets products. Skips if any already exist from this supplier. */
export async function seedRiverfarmaPets(): Promise<{ added: number; skipped: boolean }> {
  const existing = await fetchCatalogProducts();
  const alreadyLoaded = existing.some((p) => p.supplier === 'Riverfarma Pets');
  if (alreadyLoaded) return { added: 0, skipped: true };

  const now = Date.now();
  let added = 0;
  for (const product of RIVERFARMA_PETS) {
    await addCatalogProduct({ ...product, createdAt: now, updatedAt: now });
    added++;
  }
  return { added, skipped: false };
}
