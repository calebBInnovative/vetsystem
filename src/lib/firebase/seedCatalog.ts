import { addCatalogProduct, fetchCatalogProducts } from './catalog';
import type { CatalogProduct } from '@/types/catalog';

type SeedProduct = Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>;

// ─── Riverfarma Pets — vademécum 2025 ────────────────────────────────────────

const RIVERFARMA_PETS: SeedProduct[] = [
  {
    name:               'Dolo-Vet Tabletas',
    activeIngredient:   'Ketorolaco trometamina 5 mg / tableta',
    category:           'analgesic',
    dosageForm:         'tablet',
    presentations:      ['Caja 20 tabletas', 'Exhibidor 25 carteras x 4 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-004',
    species:            ['dogs', 'cats'],
    description:        'Analgésico no narcótico, antiinflamatorio no esteroidal y antipirético en tableta oral. Su principio activo, el ketorolaco de trometamina, pertenece al grupo de los ácidos carboxílicos.',
    administrationRoute: 'Oral, toma directa',
  },
  {
    name:               'Enrocilina Tabletas',
    activeIngredient:   'Enrofloxacina 50 mg / tableta',
    category:           'antimicrobial',
    dosageForm:         'tablet',
    presentations:      ['Caja 20 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-074',
    species:            ['dogs', 'cats'],
    description:        'Antibiótico bactericida de amplio espectro oral. Su principio activo, la enrofloxacina, pertenece al grupo de las fluoroquinolonas de tercera generación.',
    administrationRoute: 'Oral, toma directa',
  },
  {
    name:               'Sulfatrim',
    activeIngredient:   'Trimetoprim 4 g + Sulfametoxazol 20 g / 100 ml',
    category:           'antimicrobial',
    dosageForm:         'injectable',
    presentations:      ['10 ml', '25 ml', '50 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-013',
    species:            ['dogs', 'cats'],
    description:        'Antibiótico bactericida de amplio espectro en solución inyectable. Contiene sulfametoxazol (sulfonamida) y trimetoprim (diaminopirimidina).',
    administrationRoute: 'Intravenosa, intramuscular o subcutánea',
  },
  {
    name:               'Micofin Tabletas',
    activeIngredient:   'Terbinafina 100 mg / tableta',
    category:           'antifungal',
    dosageForm:         'tablet',
    presentations:      ['Expedidor 25 carteras x 4 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-106',
    species:            ['dogs', 'cats'],
    description:        'Antimicótico de amplio espectro oral. Su principio activo, la terbinafina, pertenece a los derivados de las alilaminas.',
    administrationRoute: 'Oral, toma directa',
  },
  {
    name:               'Micofin 1%',
    activeIngredient:   'Terbinafina clorhidrato 1 g / 100 ml',
    category:           'antifungal',
    dosageForm:         'topical_solution',
    presentations:      ['30 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-103',
    species:            ['dogs', 'cats'],
    description:        'Antimicótico de amplio espectro en solución tópica. Su principio activo, la terbinafina, pertenece a los derivados de las alilaminas.',
    administrationRoute: 'Tópica',
  },
  {
    name:               'Benzamin B12',
    activeIngredient:   'Diminazeno aceturato 42 mg + Antipirina 400 mg + Cianocobalamina 40 mcg / ml',
    category:           'antiparasitic',
    dosageForm:         'injectable',
    presentations:      ['25 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-018',
    species:            ['dogs', 'cats'],
    description:        'Antiparasitario hemático inyectable. La vitamina B12 favorece la formación de eritrocitos y la antipirina disminuye los estados febriles mejorando la condición física del animal.',
    administrationRoute: 'Intramuscular profunda (única vía)',
  },
  {
    name:               'Endovet CES Inyectable',
    activeIngredient:   'Ivermectina 2 mg + Prazicuantel 60 mg / ml',
    category:           'antiparasitic',
    dosageForm:         'injectable',
    presentations:      ['10 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-098',
    species:            ['dogs', 'cats'],
    description:        'Efectivo contra nematodos, cestodos, ácaros y garrapatas en fases larvarias y adulta. Alta efectividad en el tratamiento de sarnas localizadas y generalizadas. Activo contra dirofilariasis.',
    administrationRoute: 'Intramuscular o subcutánea',
  },
  {
    name:               'Endovet CES Tabletas',
    activeIngredient:   'Ivermectina 2 mg + Prazicuantel 50 mg / tableta',
    category:           'antiparasitic',
    dosageForm:         'tablet',
    presentations:      ['Caja 20 tabletas', 'Expedidor 25 carteras x 4 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-084',
    species:            ['dogs', 'cats'],
    description:        'Antihelmíntico efectivo con una sola dosis. Acción mantenida por más de tres semanas contra parásitos redondos y planos en fases larvarias y adulta. Activo contra dirofilariasis.',
    administrationRoute: 'Oral, toma directa',
  },
  {
    name:               'Endovet Crema',
    activeIngredient:   'Ivermectina 4 mg / g',
    category:           'antiparasitic',
    dosageForm:         'cream',
    presentations:      ['50 g'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-097',
    species:            ['dogs', 'cats'],
    description:        'Antiparásito acaricida de uso externo. No arde, aroma fresco y agradable, humecta la zona lesionada y coadyuva en la regeneración tisular.',
    administrationRoute: 'Tópica, separando el pelo para aplicar directamente sobre la piel',
  },
  {
    name:               'Endovet Tabletas',
    activeIngredient:   'Ivermectina 2 mg / tableta',
    category:           'antiparasitic',
    dosageForm:         'tablet',
    presentations:      ['Caja 20 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-081',
    species:            ['dogs', 'cats'],
    description:        'Antihelmíntico de amplio espectro. Efectivo además contra ectoparásitos. Su principio activo, la ivermectina, pertenece al grupo de las avermectinas.',
    administrationRoute: 'Oral, toma directa',
  },
  {
    name:               'Imidofin Inyectable',
    activeIngredient:   'Imidocarb dipropionato 100 mg / ml',
    category:           'antiparasitic',
    dosageForm:         'injectable',
    presentations:      ['10 ml', '100 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-096',
    species:            ['dogs', 'cats'],
    description:        'Antiparasitario hemático inyectable. Su principio activo, el imidocarb dipropionato, pertenece a los derivados de las carbanilidas.',
    administrationRoute: 'Intramuscular o subcutánea',
  },
  {
    name:               'Imidofin Tabletas',
    activeIngredient:   'Imidocarb dipropionato 60 mg / tableta',
    category:           'antiparasitic',
    dosageForm:         'tablet',
    presentations:      ['Caja 20 tabletas'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-099',
    species:            ['dogs', 'cats'],
    description:        'Antiparasitario hemático en tableta oral. Su principio activo, el imidocarb dipropionato, pertenece a los derivados de las carbanilidas.',
    administrationRoute: 'Oral, toma directa',
  },
  {
    name:               'Diuravet',
    activeIngredient:   'Furosemida 500 mg / 10 ml',
    category:           'diuretic',
    dosageForm:         'injectable',
    presentations:      ['10 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-009',
    species:            ['dogs', 'cats'],
    description:        'Diurético salurético en solución inyectable. Su principio activo, la furosemida, ejerce su efecto sobre el asa de Henle.',
    administrationRoute: 'Intravenosa o intramuscular',
  },
  {
    name:               'Bronquivet NF',
    activeIngredient:   'Guayacol 10 g + Carbocisteína 20 g + Piroxicam 2 g / 100 ml',
    category:           'expectorant',
    dosageForm:         'injectable',
    presentations:      ['50 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-057',
    species:            ['dogs', 'cats'],
    description:        'Expectorante, mucolítico, antiinflamatorio y analgésico en solución inyectable. Concentración idónea de ingredientes que confieren varios efectos terapéuticos en una sola aplicación.',
    administrationRoute: 'Intramuscular',
  },
  {
    name:               'Dolo-Vet Oftálmico',
    activeIngredient:   'Gentamicina 5 mg + Ketorolaco 5 mg / ml',
    category:           'ophthalmic',
    dosageForm:         'ophthalmic_solution',
    presentations:      ['Caja 10 frascos x 10 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-090',
    species:            ['dogs', 'cats'],
    description:        'Antibiótico bacteriostático de amplio espectro en solución oftálmica con efecto antiinflamatorio, analgésico local y antiprurítico.',
    administrationRoute: 'Instilación oftálmica',
  },
  {
    name:               'Dolo-Vet Ótico',
    activeIngredient:   'Gentamicina 5 mg + Ketorolaco 5 mg + Miconazol nitrato 20 mg / ml',
    category:           'otic',
    dosageForm:         'otic_suspension',
    presentations:      ['Caja 10 frascos x 10 ml'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-091',
    species:            ['dogs', 'cats'],
    description:        'Antibiótico bacteriostático de amplio espectro en suspensión ótica con efecto antimicótico, antiinflamatorio, analgésico local y antiprurítico.',
    administrationRoute: 'Tópica y ótica',
  },
  {
    name:               'Electrólitos',
    activeIngredient:   'Bicarbonato sodio + Cloruro potasio + Cloruro sodio + Dextrosa + Sulfato magnesio / 20 g',
    category:           'reconstitutent',
    dosageForm:         'oral_powder',
    presentations:      ['Caja 50 sobres x 5 g', 'Caja 10 sobres x 100 g', 'Cubeta 5 kg'],
    supplier:           'Riverfarma Pets',
    registrationNumber: 'Q-0524-005',
    species:            ['dogs', 'cats'],
    description:        'Reconstituyente electrolítico oral con los principales electrólitos para mantener el equilibrio hidroelectrolítico del organismo animal.',
    administrationRoute: 'Oral en el agua de bebida',
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
    description:        'Reconstituyente vitamínico en solución inyectable que aporta cianocobalamina (Vitamina B12) a los animales.',
    administrationRoute: 'Intramuscular',
  },
];

// ─── Riverfarma Aves ──────────────────────────────────────────────────────────

const RIVERFARMA_AVES: SeedProduct[] = [
  {
    name:               'Avierizol-Enro',
    activeIngredient:   'Enrofloxacina 200 mg / g',
    category:           'antimicrobial',
    dosageForm:         'oral_powder',
    presentations:      ['Caja 50 sobres x 5 g'],
    supplier:           'Riverfarma Aves',
    registrationNumber: 'Q-0524-076',
    species:            ['roosters', 'birds', 'pigs'],
    description:        'Antimicrobiano de amplio espectro. Actúa contra micoplasmas, gérmenes grampositivos y gramnegativos. Acción inmediata.',
    administrationRoute: 'Oral en el agua de bebida',
  },
];

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSupplier(
  products: SeedProduct[],
  supplierName: string,
): Promise<{ added: number; skipped: boolean }> {
  const existing = await fetchCatalogProducts();
  const alreadyLoaded = existing.some((p) => p.supplier === supplierName);
  if (alreadyLoaded) return { added: 0, skipped: true };

  const now = Date.now();
  for (const product of products) {
    await addCatalogProduct({ ...product, createdAt: now, updatedAt: now });
  }
  return { added: products.length, skipped: false };
}

export async function seedRiverfarmaPets(): Promise<{ added: number; skipped: boolean }> {
  return seedSupplier(RIVERFARMA_PETS, 'Riverfarma Pets');
}

export async function seedRiverfarmaAves(): Promise<{ added: number; skipped: boolean }> {
  return seedSupplier(RIVERFARMA_AVES, 'Riverfarma Aves');
}
