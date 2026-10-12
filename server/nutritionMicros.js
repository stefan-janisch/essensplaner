/**
 * Shared micronutrient logic for the nutrition estimation routine.
 *
 * The recipe nutrition prompt (server/nutritionEstimate.js) and the quick meal estimate
 * (server/index.js → POST /api/estimate-quick-meal) import from here so the micro fields
 * and their parsing stay in sync everywhere.
 *
 * Micros are estimated per ONE serving (same normalization as the macros) and stored
 * inside the existing meals.nutrition_per_serving JSON. They are background-only and
 * deliberately NOT part of the frontend NutritionInfo type, so the UI never shows them.
 */

// Core panel: 13 vitamins + minerals/trace elements + omega-3.
// cap = generous physiological upper bound PER SERVING — only to catch gross AI errors
// (wrong unit, 10x mistakes), not an RDA limit. decimals preserve small values (e.g. B12).
export const MICRO_KEYS = [
  { key: 'vitaminA_ug', label: 'Vitamin A', unit: 'µg RAE', decimals: 0, cap: 5000 },
  { key: 'vitaminC_mg', label: 'Vitamin C', unit: 'mg', decimals: 1, cap: 1000 },
  { key: 'vitaminD_ug', label: 'Vitamin D', unit: 'µg', decimals: 1, cap: 100 },
  { key: 'vitaminE_mg', label: 'Vitamin E', unit: 'mg', decimals: 1, cap: 200 },
  { key: 'vitaminB12_ug', label: 'Vitamin B12', unit: 'µg', decimals: 2, cap: 50 },
  { key: 'folate_ug', label: 'Folat', unit: 'µg', decimals: 0, cap: 1500 },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg', decimals: 0, cap: 2500 },
  { key: 'magnesium_mg', label: 'Magnesium', unit: 'mg', decimals: 0, cap: 1200 },
  { key: 'iron_mg', label: 'Eisen', unit: 'mg', decimals: 1, cap: 50 },
  { key: 'zinc_mg', label: 'Zink', unit: 'mg', decimals: 1, cap: 50 },
  { key: 'selenium_ug', label: 'Selen', unit: 'µg', decimals: 0, cap: 400 },
  { key: 'potassium_mg', label: 'Kalium', unit: 'mg', decimals: 0, cap: 6000 },
  { key: 'omega3_g', label: 'Omega-3', unit: 'g', decimals: 2, cap: 20 },
];

// German prompt block appended to the nutrition system prompt. Describes the 13 micro
// fields, their units, and the estimation rules. The macro/tags JSON schema and the
// "respond with JSON only" instruction live in the caller's prompt.
export const MICRO_PROMPT_FRAGMENT = `
Zusätzlich schätze die folgenden Mikronährstoffe für die EINE Portion und füge sie demselben JSON-Objekt hinzu (alle Werte pro Portion):
${MICRO_KEYS.map(m => `- ${m.key}: ${m.label} in ${m.unit}`).join('\n')}

Regeln für die Mikronährstoffe:
- Verwende realistische Werte aus gängigen Lebensmittel-Nährwerttabellen (z.B. USDA / Bundeslebensmittelschlüssel).
- Setze 0, wenn ein Nährstoff im Gericht praktisch nicht vorkommt.
- Gib KLEINE Werte mit Dezimalstellen an (z.B. Vitamin B12, Vitamin D, Omega-3) — NICHT auf ganze Zahlen runden.
- vitaminD_ug in Mikrogramm (NICHT IU; 1 µg = 40 IU).
- vitaminA_ug als Retinol-Aktivitätsäquivalent (µg RAE).
- folate_ug als Folat-Äquivalent in µg.`;

/**
 * Read the 13 micro fields out of a parsed AI response.
 * - clamp to >= 0
 * - round to the field's decimals
 * - cap at the field's physiological per-serving max
 * - omit fields the model didn't return (so genuine gaps stay visible, not forced to 0)
 */
export function parseMicros(parsed) {
  const micros = {};
  if (!parsed || typeof parsed !== 'object') return micros;
  for (const { key, decimals, cap } of MICRO_KEYS) {
    const raw = parsed[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    const clamped = Math.min(cap, Math.max(0, num));
    const factor = Math.pow(10, decimals);
    micros[key] = Math.round(clamped * factor) / factor;
  }
  return micros;
}

/**
 * Full per-serving nutrition object (6 macros rounded to integers + the 13 micros) from an
 * AI response or client payload. Used by quick meals (estimate + save), where the whole
 * object comes from outside and must be validated in one place.
 */
export function parseNutrition(parsed) {
  const macro = (v, cap) => Math.round(Math.min(cap, Math.max(0, Number(v) || 0)));
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    kcal: macro(p.kcal, 5000),
    protein: macro(p.protein, 400),
    carbs: macro(p.carbs, 800),
    fat: macro(p.fat, 400),
    fiber: macro(p.fiber, 200),
    sugar: macro(p.sugar, 400),
    ...parseMicros(p),
  };
}
