import type { NutritionInfo, NutritionTargets, MicroNutrients, NutritionProfile } from '../types/index.js';
import { resolveDayTargets } from './nutritionCalculator';
import type { SportModel } from './sportModel';
import {
  NUTRITION_KEYS, NUTRITION_LABELS, MORE_IS_BETTER, getNutrientStatuses, getNutrientColor,
} from './nutritionColors';
import type { NutrientStatus, NutrientColor } from './nutritionColors';
import { MICRO_REFERENCES, getMicroReference, getScoredMicroReference, getSupplementedMicros } from './microReference';
import type { MicroKeyName } from './microReference';
import { scoreDay } from './dayScore';
import { targetDensity } from './proteinPlanning';
import type { MicroTotals } from './dayScore';
import type { ActivityModel } from './activityModel';

/** One row as returned by GET /api/nutrition-logs. */
export type NutritionLogEntry = {
  id: number;
  planId: number;
  entryId: number;
  mealId: string | null;
  mealName: string | null;
  date: string;
  mealType: string | null;
  servings: number;
  persons: number;
  nutritionPerServing: (NutritionInfo & Partial<MicroNutrients>) | null;
  loggedAt: string;
};

export type MicroStatus = {
  key: MicroKeyName;
  label: string;
  unit: string;
  actual: number;
  target: number;
  percent: number;
  color: NutrientColor;
  sufficientData: boolean;
  /** Covered by a supplement (per profile) — shown, but never flagged as deficiency. */
  supplemented: boolean;
};

export type Deficiency = {
  key: string;
  label: string;
  percent: number;
  hint: string;
  kind: 'macro' | 'micro';
};

export type MonthlyReport = {
  month: string;
  daysInMonth: number;
  daysWithData: number;
  loggedMeals: number;
  microCoverage: number;        // 0..1 — fraction of logged meals carrying micro data
  microDataSufficient: boolean; // microCoverage >= 0.5
  avgMacros: NutritionInfo;     // average per logged day
  proteinDensity: number;       // g protein / 100 kcal over the logged days
  targetProteinDensity: number; // density the (averaged) daily targets need
  macros: NutrientStatus[];
  micros: MicroStatus[];
  deficiencies: Deficiency[];
  heatmap: { date: string; color: NutrientColor | 'gray'; score: number | null }[];
  topFoods: Record<string, { name: string; amount: number }[]>;
  donut: { protein: number; carbs: number; fat: number };
};

const DEFICIT_THRESHOLD = 70; // percent of target below which a nutrient counts as a possible deficiency

const MACRO_HINTS: Partial<Record<keyof NutritionInfo, string>> = {
  protein: 'Mehr Hülsenfrüchte, Fleisch, Fisch, Eier oder Milchprodukte',
  fiber: 'Mehr Vollkorn, Hülsenfrüchte, Gemüse und Obst',
};

const EMPTY_MACROS: NutritionInfo = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };

function daysInMonthOf(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function perPerson(value: number | undefined, servings: number, persons: number): number {
  if (!value) return 0;
  return (value * servings) / Math.max(1, persons);
}

export function buildMonthlyReport(
  logs: NutritionLogEntry[],
  profile: NutritionProfile | null,
  targets: NutritionTargets | null,
  month: string,
  activity?: ActivityModel | null,
  sport?: SportModel | null,
): MonthlyReport {
  const rows = logs.filter(l => l.date.startsWith(month));
  const daysInMonth = daysInMonthOf(month);

  // Per-day macro + micro sums (per person), and per-meal contributions for top-foods.
  const dailyMacros = new Map<string, NutritionInfo>();
  const dailyMicros = new Map<string, MicroTotals | null>(); // null = a meal of that day lacks micro data
  const microMonthly: Record<string, number> = {};
  const microContrib: Record<string, Map<string, number>> = {}; // microKey -> mealName -> amount
  const macroContrib: Record<string, Map<string, number>> = {};
  let microRows = 0;

  for (const row of rows) {
    const n = row.nutritionPerServing;
    if (!n) continue;
    const name = row.mealName || '—';

    let day = dailyMacros.get(row.date);
    if (!day) { day = { ...EMPTY_MACROS }; dailyMacros.set(row.date, day); }
    for (const key of NUTRITION_KEYS) {
      const v = perPerson(n[key], row.servings, row.persons);
      day[key] += v;
      (macroContrib[key] ??= new Map()).set(name, (macroContrib[key].get(name) || 0) + v);
    }

    const hasMicro = MICRO_REFERENCES.some(m => n[m.key] !== undefined);
    if (hasMicro) microRows++;
    if (!dailyMicros.has(row.date)) {
      dailyMicros.set(row.date, Object.fromEntries(MICRO_REFERENCES.map(m => [m.key, 0])) as MicroTotals);
    }
    const dayMicros = dailyMicros.get(row.date)!;
    if (!hasMicro) dailyMicros.set(row.date, null);
    else if (dayMicros) for (const m of MICRO_REFERENCES) dayMicros[m.key] += perPerson(n[m.key], row.servings, row.persons);
    for (const m of MICRO_REFERENCES) {
      if (n[m.key] === undefined) continue;
      const v = perPerson(n[m.key], row.servings, row.persons);
      microMonthly[m.key] = (microMonthly[m.key] || 0) + v;
      (microContrib[m.key] ??= new Map()).set(name, (microContrib[m.key].get(name) || 0) + v);
    }
  }

  const daysWithData = dailyMacros.size;
  const loggedMeals = rows.length;
  const microCoverage = loggedMeals > 0 ? microRows / loggedMeals : 0;
  const microDataSufficient = microCoverage >= 0.5;

  if (daysWithData === 0) {
    return {
      month, daysInMonth, daysWithData: 0, loggedMeals, microCoverage, microDataSufficient,
      avgMacros: { ...EMPTY_MACROS }, proteinDensity: 0, targetProteinDensity: 0, macros: [], micros: [], deficiencies: [], heatmap: [],
      topFoods: {}, donut: { protein: 0, carbs: 0, fat: 0 },
    };
  }

  // Average macro intake per logged day, and the averaged daily target across those days.
  const avgMacros: NutritionInfo = { ...EMPTY_MACROS };
  for (const day of dailyMacros.values()) {
    for (const key of NUTRITION_KEYS) avgMacros[key] += day[key];
  }
  const avgTarget: NutritionTargets = { ...EMPTY_MACROS };
  for (const date of dailyMacros.keys()) {
    const t = resolveDayTargets(date, profile, targets, activity, sport);
    for (const key of NUTRITION_KEYS) avgTarget[key] += t[key];
  }
  for (const key of NUTRITION_KEYS) {
    avgMacros[key] = Math.round(avgMacros[key] / daysWithData);
    avgTarget[key] = Math.round(avgTarget[key] / daysWithData);
  }

  const macros = getNutrientStatuses(avgMacros, avgTarget);

  // Micros: average per logged day vs reference.
  const microTargets = getMicroReference(profile);
  const supplemented = getSupplementedMicros(profile);
  const micros: MicroStatus[] = MICRO_REFERENCES.map(m => {
    const actual = Math.round(((microMonthly[m.key] || 0) / daysWithData) * 10) / 10;
    const target = microTargets[m.key];
    const percent = target > 0 ? Math.round((actual / target) * 100) : 0;
    return {
      key: m.key, label: m.label, unit: m.unit, actual, target, percent,
      color: getNutrientColor(percent, 'protein'), // reuse the "more is better" thresholds
      sufficientData: microDataSufficient,
      supplemented: supplemented.has(m.key),
    };
  });

  // Deficiencies: macro (protein/fiber only — under-eating) + micros (only if data is sufficient).
  const deficiencies: Deficiency[] = [];
  for (const s of macros) {
    if (MORE_IS_BETTER.has(s.key) && s.percent < DEFICIT_THRESHOLD) {
      deficiencies.push({ key: s.key, label: s.label, percent: s.percent, hint: MACRO_HINTS[s.key] || '', kind: 'macro' });
    }
  }
  if (microDataSufficient) {
    for (const m of micros) {
      if (m.percent < DEFICIT_THRESHOLD && !m.supplemented) {
        const ref = MICRO_REFERENCES.find(r => r.key === m.key)!;
        deficiencies.push({ key: m.key, label: m.label, percent: m.percent, hint: ref.hint, kind: 'micro' });
      }
    }
  }
  deficiencies.sort((a, b) => a.percent - b.percent);

  // Heatmap: one cell per calendar day, coloured by the day score (gray = no data).
  const scoredMicroRefs = getScoredMicroReference(profile);
  const heatmap: MonthlyReport['heatmap'] = [];
  const [y, mm] = month.split('-').map(Number);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const day = dailyMacros.get(date);
    if (!day) { heatmap.push({ date, color: 'gray', score: null }); continue; }
    const ds = scoreDay(day, dailyMicros.get(date) ?? null, resolveDayTargets(date, profile, targets, activity, sport), scoredMicroRefs);
    heatmap.push({ date, color: ds.color, score: ds.score });
  }
  void y; void mm;

  // Top foods per deficient nutrient (top 3 contributors).
  const topFoods: Record<string, { name: string; amount: number }[]> = {};
  for (const def of deficiencies) {
    const contrib = def.kind === 'macro' ? macroContrib[def.key] : microContrib[def.key];
    if (!contrib) continue;
    topFoods[def.key] = [...contrib.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({ name, amount: Math.round(amount * 10) / 10 }));
  }

  return {
    month, daysInMonth, daysWithData, loggedMeals, microCoverage, microDataSufficient,
    avgMacros, macros, micros, deficiencies, heatmap, topFoods,
    proteinDensity: avgMacros.kcal > 0 ? (avgMacros.protein / avgMacros.kcal) * 100 : 0,
    targetProteinDensity: targetDensity(avgTarget),
    donut: { protein: avgMacros.protein, carbs: avgMacros.carbs, fat: avgMacros.fat },
  };
}

export { NUTRITION_LABELS };
