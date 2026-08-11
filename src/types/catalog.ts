import type { ProductCategory } from './inventory';

// ─── Catalog types ────────────────────────────────────────────────────────────

export type CatalogCategory =
  | 'antimicrobial'
  | 'antiparasitic'
  | 'antifungal'
  | 'reconstitutent'
  | 'analgesic'
  | 'diuretic'
  | 'expectorant'
  | 'ophthalmic'
  | 'otic'
  | 'other';

export type CatalogDosageForm =
  | 'tablet'
  | 'injectable'
  | 'oral_powder'
  | 'cream'
  | 'topical_solution'
  | 'ophthalmic_solution'
  | 'otic_suspension'
  | 'other';

export interface CatalogProduct {
  id: string;
  name: string;
  activeIngredient?: string;
  category: CatalogCategory;
  dosageForm?: CatalogDosageForm;
  presentations?: string[];
  supplier: string;
  registrationNumber?: string;
  /** ['dogs','cats'] | ['roosters','birds'] | ['dogs','cats','roosters','birds'] */
  species?: string[];
  /** Clinical characteristics / short description from the vademécum */
  description?: string;
  /** Route of administration — e.g. "Intramuscular o subcutánea", "Oral, toma directa" */
  administrationRoute?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── UI labels ────────────────────────────────────────────────────────────────

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  antimicrobial:  'Antimicrobiano',
  antiparasitic:  'Antiparasitario',
  antifungal:     'Antimicótico',
  reconstitutent: 'Reconstituyente',
  analgesic:      'Analgésico / Antiinflamatorio',
  diuretic:       'Diurético',
  expectorant:    'Expectorante',
  ophthalmic:     'Oftálmico',
  otic:           'Ótico',
  other:          'Otro',
};

export const CATALOG_DOSAGE_FORM_LABELS: Record<CatalogDosageForm, string> = {
  tablet:              'Tableta',
  injectable:          'Inyectable',
  oral_powder:         'Polvo oral',
  cream:               'Crema',
  topical_solution:    'Solución tópica',
  ophthalmic_solution: 'Solución oftálmica',
  otic_suspension:     'Suspensión ótica',
  other:               'Otro',
};

export const CATALOG_CATEGORY_COLORS: Record<CatalogCategory, string> = {
  antimicrobial:  'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40',
  antiparasitic:  'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/40',
  antifungal:     'text-pink-700 bg-pink-50 dark:text-pink-300 dark:bg-pink-950/40',
  reconstitutent: 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/40',
  analgesic:      'text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40',
  diuretic:       'text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/40',
  expectorant:    'text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-950/40',
  ophthalmic:     'text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40',
  otic:           'text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950/40',
  other:          'text-muted-foreground bg-muted',
};

// ─── Category mapping — CatalogCategory → ProductCategory (for import) ────────

export const CATALOG_TO_PRODUCT_CATEGORY: Record<CatalogCategory, ProductCategory> = {
  antimicrobial:  'medication',
  antiparasitic:  'antiparasitic',
  antifungal:     'medication',
  reconstitutent: 'medication',
  analgesic:      'medication',
  diuretic:       'medication',
  expectorant:    'medication',
  ophthalmic:     'medication',
  otic:           'medication',
  other:          'other',
};
