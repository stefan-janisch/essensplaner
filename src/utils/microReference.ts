import type { MicroNutrients, NutritionProfile } from '../types/index.js';

/**
 * DGE/RDA daily reference values for the 13 background micronutrients, used by the monthly
 * report to flag possible deficiencies. All micros are treated as "more is better" (the report
 * is deficiency-focused). Values are adult references; gender-specific where the DGE differs.
 * `hint` is a short German food suggestion shown in the deficiency list.
 */
export type MicroKeyName = keyof MicroNutrients;

export type MicroRef = {
  key: MicroKeyName;
  label: string;
  unit: string;
  /** Daily reference; a number, or per-gender { f, m }. */
  reference: number | { f: number; m: number };
  hint: string;
};

export const MICRO_REFERENCES: MicroRef[] = [
  { key: 'vitaminA_ug', label: 'Vitamin A', unit: 'µg', reference: { f: 700, m: 850 }, hint: 'Karotten, Süßkartoffel, Leber, Spinat' },
  { key: 'vitaminC_mg', label: 'Vitamin C', unit: 'mg', reference: { f: 95, m: 110 }, hint: 'Paprika, Zitrusfrüchte, Brokkoli, Beeren' },
  { key: 'vitaminD_ug', label: 'Vitamin D', unit: 'µg', reference: 20, hint: 'Fetter Fisch, Eier, Sonnenlicht/Supplement' },
  { key: 'vitaminE_mg', label: 'Vitamin E', unit: 'mg', reference: { f: 12, m: 14 }, hint: 'Nüsse, Pflanzenöle, Samen' },
  { key: 'vitaminB12_ug', label: 'Vitamin B12', unit: 'µg', reference: 4, hint: 'Fleisch, Fisch, Eier, Milchprodukte' },
  { key: 'folate_ug', label: 'Folat', unit: 'µg', reference: 300, hint: 'Hülsenfrüchte, grünes Blattgemüse, Vollkorn' },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg', reference: 1000, hint: 'Milchprodukte, Grünkohl, Mandeln, Tofu' },
  { key: 'magnesium_mg', label: 'Magnesium', unit: 'mg', reference: { f: 300, m: 350 }, hint: 'Vollkorn, Nüsse, Hülsenfrüchte, dunkle Schokolade' },
  { key: 'iron_mg', label: 'Eisen', unit: 'mg', reference: { f: 15, m: 10 }, hint: 'Rotes Fleisch, Hülsenfrüchte, Vollkorn (mit Vitamin C)' },
  { key: 'zinc_mg', label: 'Zink', unit: 'mg', reference: { f: 8, m: 11 }, hint: 'Fleisch, Käse, Kürbiskerne, Hülsenfrüchte' },
  { key: 'selenium_ug', label: 'Selen', unit: 'µg', reference: { f: 60, m: 70 }, hint: 'Paranüsse, Fisch, Eier, Fleisch' },
  { key: 'potassium_mg', label: 'Kalium', unit: 'mg', reference: 4000, hint: 'Banane, Kartoffel, Hülsenfrüchte, Gemüse' },
  { key: 'omega3_g', label: 'Omega-3', unit: 'g', reference: 2, hint: 'Fetter Fisch, Leinsamen, Walnüsse, Rapsöl' },
];

/** Resolve each micro's reference value for a given profile (gender), falling back to male values. */
export function getMicroReference(profile: NutritionProfile | null): Record<MicroKeyName, number> {
  const isFemale = profile?.gender === 'f';
  const out = {} as Record<MicroKeyName, number>;
  for (const m of MICRO_REFERENCES) {
    out[m.key] = typeof m.reference === 'number' ? m.reference : (isFemale ? m.reference.f : m.reference.m);
  }
  return out;
}
