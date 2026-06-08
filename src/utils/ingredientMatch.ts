import type { Meal } from '../types/index.js';
import { INGREDIENT_GROUPS } from '../constants/ingredientGroups';

/** Normalize an ingredient name for tolerant comparison. */
export function normalizeIngredientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Minimum token length for substring matching, to avoid trivial matches
// (e.g. "ei" matching half the alphabet).
const MIN_SUBSTRING_LEN = 3;

/**
 * Tolerant (partial) match between two already-normalized ingredient names.
 * Counts as a match if they are equal, or one contains the other as a
 * substring (e.g. "tomate" ↔ "tomaten" / "cherrytomaten").
 */
function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= MIN_SUBSTRING_LEN && b.includes(a)) return true;
  if (b.length >= MIN_SUBSTRING_LEN && a.includes(b)) return true;
  return false;
}

export interface MissingInfo {
  missing: string[];
  missingCount: number;
  total: number;
}

/**
 * Split the user's available-ingredient list into two match sets:
 * - `loose`: free-text ingredient names, matched bidirectionally via namesMatch().
 * - `contains`: members expanded from umbrella terms (e.g. "Gewürze"), matched
 *   directionally — a recipe ingredient counts only if it CONTAINS the member.
 */
function buildMatchTerms(haveNames: string[]): { loose: string[]; contains: string[] } {
  const loose: string[] = [];
  const contains: string[] = [];
  for (const raw of haveNames) {
    const norm = normalizeIngredientName(raw);
    if (!norm) continue;
    const group = INGREDIENT_GROUPS.find(g => g.aliases.includes(norm));
    if (group) {
      for (const m of group.members) {
        const mn = normalizeIngredientName(m);
        if (mn) contains.push(mn);
      }
    } else {
      loose.push(norm);
    }
  }
  return { loose, contains };
}

/**
 * For each meal, compute which of its "meaningful" shopping ingredients are
 * NOT covered by the given list of available ingredient names (`haveNames`).
 * Uses tolerant substring matching. Ingredients with unit "NB"/"Nach Belieben"
 * (i.e. "nach Belieben") are ignored, mirroring the "Passt zum Plan" logic.
 *
 * Returns a Map<mealId, { missing, missingCount, total }>.
 */
export function computeMissingIngredients(
  meals: Meal[],
  haveNames: string[],
): Map<string, MissingInfo> {
  const { loose, contains } = buildMatchTerms(haveNames);

  const result = new Map<string, MissingInfo>();
  for (const meal of meals) {
    const ings = meal.shoppingIngredients?.length ? meal.shoppingIngredients : meal.ingredients;
    const meaningful = ings.filter(i => i.unit !== 'NB' && i.unit !== 'Nach Belieben');
    const missing: string[] = [];
    for (const ing of meaningful) {
      const norm = normalizeIngredientName(ing.name);
      const available = loose.some(h => namesMatch(h, norm))
        || contains.some(m => norm.includes(m));
      if (!available) missing.push(ing.name);
    }
    result.set(meal.id, { missing, missingCount: missing.length, total: meaningful.length });
  }
  return result;
}
