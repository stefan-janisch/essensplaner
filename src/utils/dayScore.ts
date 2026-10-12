import type { Meal, MealPlanEntry, MealType, NutritionInfo, NutritionTargets } from '../types/index.js';
import { NUTRITION_KEYS, NUTRITION_LABELS } from './nutritionColors';
import type { NutrientColor } from './nutritionColors';
import { MICRO_REFERENCES } from './microReference';
import type { MicroKeyName } from './microReference';
import { getScoreColor } from './nutritionScore';

/**
 * Day score (0-100): how well one day's intake (per person) meets the user's targets.
 * "Per person" uses that DAY's person count (see utils/dayPersons.ts) — a plan's count is
 * only the fallback, so a day with guests is still judged by what one person ate.
 * Used everywhere a day is judged — the day traffic light in the plan, the plan score
 * (average over days), the portion optimizer and the monthly report heatmap.
 *
 * Each nutrient earns 0..1 of its weight from its "% of daily target", linear between the
 * "full" band and the "zero" limits:
 *
 *   kcal      25   full at 90–110 %,  zero below 60 % / above 140 %
 *   protein   20   full from 100 %,   zero at 50 %
 *   fibre     13   full from 100 %,   zero at 50 %
 *   carbs      9   full at 80–120 %,  zero below 50 % / above 150 %
 *   fat        9   full at 80–120 %,  zero below 50 % / above 150 %
 *   sugar      9   full up to 100 %,  zero at 200 %
 *   micros    15   avg coverage of the 13 micros (each capped at 100 %), full at 80 %, zero at 30 %;
 *                  micros the user takes as supplements are left out of the average
 *
 * If the day has no (or incomplete) micronutrient data the micro weight is dropped and the
 * macro weights are renormalised to 100.
 *
 * On top of that, a CALORIE SURPLUS is penalised across the whole score: every percentage
 * point above 110 % of the kcal target costs 1.5 points, subtracted from the total. Losing
 * the 25 kcal points alone was far too mild — a day at 136 % still scored 69 because good
 * micros and protein carried it. Eating 700 kcal too much is not something vegetables make
 * up for. Deficits are deliberately NOT penalised this way; the kcal curve handles those,
 * and a deficit is the point for anyone cutting.
 */

type Curve =
  | { kind: 'range'; fullLo: number; fullHi: number; zeroLo: number; zeroHi: number }
  | { kind: 'min'; full: number; zero: number }
  | { kind: 'max'; full: number; zero: number };

const MACRO_RULES: Record<keyof NutritionInfo, { weight: number; curve: Curve }> = {
  kcal: { weight: 25, curve: { kind: 'range', fullLo: 90, fullHi: 110, zeroLo: 60, zeroHi: 140 } },
  protein: { weight: 20, curve: { kind: 'min', full: 100, zero: 50 } },
  fiber: { weight: 13, curve: { kind: 'min', full: 100, zero: 50 } },
  carbs: { weight: 9, curve: { kind: 'range', fullLo: 80, fullHi: 120, zeroLo: 50, zeroHi: 150 } },
  fat: { weight: 9, curve: { kind: 'range', fullLo: 80, fullHi: 120, zeroLo: 50, zeroHi: 150 } },
  sugar: { weight: 9, curve: { kind: 'max', full: 100, zero: 200 } },
};
const MICRO_WEIGHT = 15;
const MICRO_FULL = 80;
const MICRO_ZERO = 30;

/** Calorie surplus: from this % of the kcal target on, every further point costs score. */
const KCAL_OVER_FROM = 110;
const KCAL_OVER_PER_PERCENT = 1.5;

/** Meal types whose portions the optimizer may change (drinks / misc stay as planned; quick meals too). */
const SCALABLE_MEAL_TYPES = new Set<MealType>(['breakfast', 'lunch', 'dinner', 'snacks']);
/** Optimizer bounds, as multiple of one portion per person. */
const MIN_MULT = 0.5;
const MAX_MULT = 2;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function curveFraction(percent: number, c: Curve): number {
  switch (c.kind) {
    case 'min':
      return clamp01((percent - c.zero) / (c.full - c.zero));
    case 'max':
      return clamp01((c.zero - percent) / (c.zero - c.full));
    case 'range':
      if (percent < c.fullLo) return clamp01((percent - c.zeroLo) / (c.fullLo - c.zeroLo));
      if (percent > c.fullHi) return clamp01((c.zeroHi - percent) / (c.zeroHi - c.fullHi));
      return 1;
  }
}

/** Traffic light for one component, by the share of its points it earned. */
function fractionColor(f: number): NutrientColor {
  if (f >= 0.7) return 'green';
  if (f >= 0.4) return 'yellow';
  return 'red';
}

export type MicroTotals = Record<MicroKeyName, number>;

export type DayTotals = {
  totals: NutritionInfo;
  /** Null when at least one counted recipe lacks micronutrient data. */
  micros: MicroTotals | null;
  /** Number of entries that carried nutrition data. */
  counted: number;
};

export type DayScoreComponent = {
  key: keyof NutritionInfo | 'micros';
  label: string;
  actual: number;
  target: number;
  percent: number;
  points: number;
  maxPoints: number;
  color: NutrientColor;
};

/** Score components that have a drill-down behind their chip in the plan score popup. */
const DETAILED_COMPONENTS = new Set<DayScoreComponent['key']>([
  'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'micros',
]);
export function hasComponentDetail(key: DayScoreComponent['key']): boolean {
  return DETAILED_COMPONENTS.has(key);
}

export type DayScore = {
  /** Unrounded score INCLUDING the surplus penalty; may go below 0. Used by the optimizer,
   *  which needs the gradient to tell 150 % apart from 200 %. */
  raw: number;
  score: number;
  color: NutrientColor;
  components: DayScoreComponent[];
  hasMicro: boolean;
  /** Points deducted for a calorie surplus (0 when the day is at or below 110 % kcal). */
  penalty: number;
};

const EMPTY_TOTALS = (): NutritionInfo => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });

function hasMicroData(n: Partial<Record<MicroKeyName, number>>): boolean {
  return MICRO_REFERENCES.some(m => n[m.key] !== undefined && n[m.key] !== null);
}

/**
 * Sum one day's intake per person. Every entry of the day counts — including ones marked ✗,
 * which means "cooked" (i.e. eaten), not "skipped".
 * `servingsOverride` lets the optimizer try alternative portions without touching entries.
 */
export function sumDay(
  dayEntries: MealPlanEntry[],
  mealsById: Map<string, Meal>,
  persons: number,
  servingsOverride?: Map<number, number>,
): DayTotals {
  const perPerson = Math.max(1, persons);
  const totals = EMPTY_TOTALS();
  const micros = Object.fromEntries(MICRO_REFERENCES.map(m => [m.key, 0])) as MicroTotals;
  let microComplete = true;
  let counted = 0;

  for (const entry of dayEntries) {
    const n = mealsById.get(entry.mealId)?.nutritionPerServing;
    if (!n) continue;
    // A day with nothing but coffee is not a planned day yet (no day score, no plan-score day).
    if (!entry.personal) counted++;
    // Personal entries (☕) are the viewer's own cups — not shared by the day's persons.
    const factor = (servingsOverride?.get(entry.id) ?? entry.servings) / (entry.personal ? 1 : perPerson);
    for (const key of NUTRITION_KEYS) totals[key] += (n[key] || 0) * factor;
    if (!hasMicroData(n)) { microComplete = false; continue; }
    for (const m of MICRO_REFERENCES) micros[m.key] += (n[m.key] || 0) * factor;
  }

  return { totals, micros: counted > 0 && microComplete ? micros : null, counted };
}

/** Score one day's totals against its targets. */
export function scoreDay(
  totals: NutritionInfo,
  micros: MicroTotals | null,
  targets: NutritionTargets,
  microRefs: Partial<Record<MicroKeyName, number>>,
): DayScore {
  const microKeys = (Object.keys(microRefs) as MicroKeyName[]).filter(k => (microRefs[k] ?? 0) > 0);
  const hasMicro = micros !== null && microKeys.length > 0;
  const scale = hasMicro ? 1 : 100 / (100 - MICRO_WEIGHT);
  const components: DayScoreComponent[] = [];
  let raw = 0;

  for (const key of NUTRITION_KEYS) {
    const { weight, curve } = MACRO_RULES[key];
    const target = targets[key] || 1;
    const percent = (totals[key] / target) * 100;
    const f = curveFraction(percent, curve);
    const maxPoints = weight * scale;
    raw += f * maxPoints;
    components.push({
      key, label: NUTRITION_LABELS[key], actual: Math.round(totals[key]), target,
      percent: Math.round(percent), points: f * maxPoints, maxPoints, color: fractionColor(f),
    });
  }

  if (hasMicro && micros) {
    let sum = 0;
    for (const k of microKeys) sum += Math.min(1, micros[k] / microRefs[k]!);
    const avgPercent = (sum / microKeys.length) * 100;
    const f = clamp01((avgPercent - MICRO_ZERO) / (MICRO_FULL - MICRO_ZERO));
    raw += f * MICRO_WEIGHT;
    components.push({
      key: 'micros', label: 'Mikros Ø', actual: Math.round(avgPercent), target: 100,
      percent: Math.round(avgPercent), points: f * MICRO_WEIGHT, maxPoints: MICRO_WEIGHT, color: fractionColor(f),
    });
  }

  // Kalorienüberschuss: Abzug auf den Gesamtscore, nicht nur auf die kcal-Komponente.
  const kcalPercent = (totals.kcal / (targets.kcal || 1)) * 100;
  const penalty = Math.max(0, kcalPercent - KCAL_OVER_FROM) * KCAL_OVER_PER_PERCENT;
  raw -= penalty;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { raw, score, color: getScoreColor(score), components, hasMicro, penalty };
}

export type TargetsForDate = (date: string) => NutritionTargets;
/** How many people eat on that date — a plan may set a different count per day. */
export type PersonsForDate = (date: string) => number;

export type PlanDayScore = {
  date: string;
  day: DayScore;
  totals: NutritionInfo;
  /** Per-person micro totals of the day; null when a counted recipe lacks micro data. */
  micros: MicroTotals | null;
  /** Weakest component (fewest earned points relative to its weight). */
  weakest: DayScoreComponent;
};

export type PlanScore = {
  score: number | null;
  color: NutrientColor | 'gray';
  days: PlanDayScore[];
  daysScored: number;
  daysTotal: number;
  /** Average % of target per component over scored days. */
  avgPercent: { key: DayScoreComponent['key']; label: string; percent: number; color: NutrientColor }[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function groupByDate(entries: MealPlanEntry[]): Map<string, MealPlanEntry[]> {
  const byDate = new Map<string, MealPlanEntry[]>();
  for (const e of entries) {
    if (e.mealType === 'food') continue; // menu plans have courses, not days
    if (!ISO_DATE.test(e.date)) continue; // recipes dropped into the plan-wide extras ("_extras")
    const list = byDate.get(e.date);
    if (list) list.push(e); else byDate.set(e.date, [e]);
  }
  return byDate;
}

function daysBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

export function mealsMap(meals: Meal[]): Map<string, Meal> {
  return new Map(meals.map(m => [m.id, m]));
}

/** Score a single day of a plan. Returns null when no recipe of that day has nutrition data. */
export function calculateDayScore(
  date: string,
  entries: MealPlanEntry[],
  mealsById: Map<string, Meal>,
  targets: NutritionTargets,
  microRefs: Partial<Record<MicroKeyName, number>>,
  persons: number,
): { day: DayScore; totals: NutritionInfo } | null {
  const dayEntries = entries.filter(e => e.date === date && e.mealType !== 'food');
  const sum = sumDay(dayEntries, mealsById, persons);
  if (sum.counted === 0) return null;
  return { day: scoreDay(sum.totals, sum.micros, targets, microRefs), totals: sum.totals };
}

/** Plan score = average day score over all days that contain at least one recipe with nutrition. */
export function calculatePlanScore(
  entries: MealPlanEntry[],
  mealsById: Map<string, Meal>,
  targetsFor: TargetsForDate,
  microRefs: Partial<Record<MicroKeyName, number>>,
  personsFor: PersonsForDate,
  startDate: string | null,
  endDate: string | null,
  servingsOverride?: Map<number, number>,
): PlanScore {
  const days: PlanDayScore[] = [];
  for (const [date, dayEntries] of [...groupByDate(entries)].sort(([a], [b]) => a.localeCompare(b))) {
    const sum = sumDay(dayEntries, mealsById, personsFor(date), servingsOverride);
    if (sum.counted === 0) continue;
    const day = scoreDay(sum.totals, sum.micros, targetsFor(date), microRefs);
    const weakest = day.components.reduce((w, c) => (c.points / c.maxPoints < w.points / w.maxPoints ? c : w));
    days.push({ date, day, totals: sum.totals, micros: sum.micros, weakest });
  }

  const daysTotal = Math.max(daysBetween(startDate, endDate), days.length);
  if (days.length === 0) {
    return { score: null, color: 'gray', days, daysScored: 0, daysTotal, avgPercent: [] };
  }

  // Pro Tag auf 0..100 begrenzen, damit der Schnitt zu den angezeigten Tagesscores passt
  // (ein Tag mit −40 roh zählt wie 0, nicht doppelt gegen die anderen Tage).
  const score = Math.round(
    days.reduce((s, d) => s + Math.max(0, Math.min(100, d.day.raw)), 0) / days.length,
  );

  const acc = new Map<DayScoreComponent['key'], { label: string; percent: number; n: number }>();
  for (const d of days) {
    for (const c of d.day.components) {
      const a = acc.get(c.key) ?? { label: c.label, percent: 0, n: 0 };
      a.percent += c.percent; a.n++;
      acc.set(c.key, a);
    }
  }
  // Colour from the shown average % with the day score's curves, so number and colour agree.
  // (Averaging the per-day points instead let one 248 % day hide behind four good ones: green at Ø 130 %.)
  const avgPercent = [...acc].map(([key, a]) => {
    const percent = a.percent / a.n;
    const f = key === 'micros'
      ? clamp01((percent - MICRO_ZERO) / (MICRO_FULL - MICRO_ZERO))
      : curveFraction(percent, MACRO_RULES[key].curve);
    return { key, label: a.label, percent: Math.round(percent), color: fractionColor(f) };
  });

  return { score, color: getScoreColor(score), days, daysScored: days.length, daysTotal, avgPercent };
}

// --- Optimizer ---

export type ServingChange = { entryId: number; date: string; mealId: string; from: number; to: number };

/**
 * - `score`: maximise the overall day score.
 * - `protein`: protein coverage first. A day already above the kcal target keeps that level as
 *   its ceiling — it is never pushed up further, but also not forced down, because cutting
 *   portions costs protein. The day score breaks ties / applies once protein is covered.
 * - `deficit`: the calorie budget wins. The kcal target itself is a hard ceiling, so days above
 *   it ARE rated down; under that ceiling the same protein-first objective applies. Use this
 *   when keeping the deficit matters more than the last few grams of protein.
 */
export type OptimizeMode = 'score' | 'protein' | 'deficit';

/**
 * Jointly optimise the portions of one day's scalable entries (see OptimizeMode).
 * Coordinate search over per-entry multipliers (portion per person, bounded 0.5–2×) with single,
 * pairwise (shift from one entry to another) and uniform moves at shrinking step sizes.
 * A small penalty on distance from the current portions keeps changes minimal on plateaus.
 */
function optimizeDay(
  dayEntries: MealPlanEntry[],
  mealsById: Map<string, Meal>,
  targets: NutritionTargets,
  microRefs: Partial<Record<MicroKeyName, number>>,
  persons: number,
  mode: OptimizeMode,
): Map<number, number> {
  const P = Math.max(1, persons);
  const vars = dayEntries.filter(e => {
    const meal = mealsById.get(e.mealId);
    return e.enabled && SCALABLE_MEAL_TYPES.has(e.mealType) && !!meal?.nutritionPerServing && !meal.isQuick;
  });
  if (vars.length === 0) return new Map();

  const start = vars.map(e => e.servings / P);
  const lo = start.map(m => Math.min(MIN_MULT, m));
  const hi = start.map(m => Math.max(MAX_MULT, m));
  const m = [...start];

  const toOverride = (mult: number[]) => new Map(vars.map((e, i) => [e.id, mult[i] * P]));
  const kcalTarget = targets.kcal || 1;
  const proteinTarget = targets.protein || 1;
  // kcal ceiling as a ratio of the target. "protein" tolerates a day that is already above it
  // (forcing it down would cost protein, which is not what that mode is for); "deficit" pins the
  // ceiling to the target, so an overshooting day gets rated down even at the cost of protein.
  const currentRatio = sumDay(dayEntries, mealsById, persons).totals.kcal / kcalTarget;
  const kcalCap = mode === 'protein' ? Math.max(1, currentRatio) : 1;
  const objective = (mult: number[]) => {
    const sum = sumDay(dayEntries, mealsById, persons, toOverride(mult));
    const dist = mult.reduce((s, x, i) => s + Math.abs(x - start[i]), 0);
    const raw = scoreDay(sum.totals, sum.micros, targets, microRefs).raw;
    if (mode === 'score') return raw - 0.3 * dist;
    const over = Math.max(0, sum.totals.kcal / kcalTarget - kcalCap);
    return 100 * Math.min(sum.totals.protein / proteinTarget, 1) + 0.2 * raw - 0.3 * dist - 1000 * over;
  };

  let best = objective(m);
  const tryMove = (cand: number[]) => {
    for (let i = 0; i < cand.length; i++) if (cand[i] < lo[i] - 1e-9 || cand[i] > hi[i] + 1e-9) return false;
    const v = objective(cand);
    if (v > best + 1e-6) { best = v; m.splice(0, m.length, ...cand); return true; }
    return false;
  };

  for (const step of [0.4, 0.2, 0.1, 0.05]) {
    for (let iter = 0; iter < 60; iter++) {
      let improved = false;
      for (let i = 0; i < m.length; i++) {
        for (const d of [step, -step]) {
          const c = [...m]; c[i] += d;
          if (tryMove(c)) improved = true;
        }
        for (let j = 0; j < m.length; j++) {
          if (i === j) continue;
          const c = [...m]; c[i] += step; c[j] -= step;
          if (tryMove(c)) improved = true;
        }
      }
      for (const d of [1 + step, 1 - step]) {
        if (tryMove(m.map(x => x * d))) improved = true;
      }
      if (!improved) break;
    }
  }

  // Round to 0.1 servings like the per-recipe 🎯 optimal portions.
  const servings = vars.map((_, i) => Math.round(m[i] * P * 10) / 10);
  if (mode !== 'score') {
    // Rounding up must not break the kcal ceiling: trim the least protein-dense entry by 0.1.
    const kcalOf = () => sumDay(dayEntries, mealsById, persons, new Map(vars.map((e, i) => [e.id, servings[i]]))).totals.kcal;
    const density = (i: number) => {
      const n = mealsById.get(vars[i].mealId)!.nutritionPerServing!;
      return n.kcal > 0 ? n.protein / n.kcal : Infinity;
    };
    for (let guard = 0; guard < 50 && kcalOf() > kcalCap * kcalTarget + 0.5; guard++) {
      const idx = vars.map((_, i) => i)
        .filter(i => servings[i] - 0.1 >= lo[i] * P - 1e-9)
        .sort((a, b) => density(a) - density(b))[0];
      if (idx === undefined) break;
      servings[idx] = Math.round((servings[idx] - 0.1) * 10) / 10;
    }
  }
  const result = new Map<number, number>();
  vars.forEach((e, i) => {
    if (Math.abs(servings[i] - e.servings) >= 0.05) result.set(e.id, servings[i]);
  });
  return result;
}

function toChanges(date: string, dayEntries: MealPlanEntry[], dayChanges: Map<number, number>): ServingChange[] {
  return [...dayChanges].map(([entryId, to]) => {
    const e = dayEntries.find(x => x.id === entryId)!;
    return { entryId, date, mealId: e.mealId, from: e.servings, to };
  });
}

/** Optimise a single day on request (any date; cooked ✗ entries stay as they are). */
export function optimizeSingleDay(
  date: string,
  entries: MealPlanEntry[],
  mealsById: Map<string, Meal>,
  targets: NutritionTargets,
  microRefs: Partial<Record<MicroKeyName, number>>,
  persons: number,
  mode: OptimizeMode,
): { changes: ServingChange[]; override: Map<number, number> } {
  const dayEntries = groupByDate(entries).get(date) ?? [];
  const override = optimizeDay(dayEntries, mealsById, targets, microRefs, persons, mode);
  return { changes: toChanges(date, dayEntries, override), override };
}

/**
 * Optimise all days from today on (past days and cooked ✗ entries stay as they are).
 * Returns the proposed changes and the plan score before/after.
 */
export function optimizePlan(
  entries: MealPlanEntry[],
  mealsById: Map<string, Meal>,
  targetsFor: TargetsForDate,
  microRefs: Partial<Record<MicroKeyName, number>>,
  personsFor: PersonsForDate,
  today: string,
  mode: OptimizeMode = 'score',
): { changes: ServingChange[]; override: Map<number, number> } {
  const override = new Map<number, number>();
  const changes: ServingChange[] = [];
  for (const [date, dayEntries] of groupByDate(entries)) {
    if (date < today) continue;
    const dayChanges = optimizeDay(dayEntries, mealsById, targetsFor(date), microRefs, personsFor(date), mode);
    for (const [entryId, to] of dayChanges) override.set(entryId, to);
    changes.push(...toChanges(date, dayEntries, dayChanges));
  }
  changes.sort((a, b) => a.date.localeCompare(b.date));
  return { changes, override };
}
