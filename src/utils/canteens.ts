import { api } from '../api/client';
import { NUTRITION_KEYS } from './nutritionColors';
import { computeNutritionScore } from './nutritionScore';
import type { MicroNutrients, NutritionInfo, User } from '../types/index.js';

/**
 * Personal canteen menus in the QuickMeal window (NAPO, Mensa Inffeldgasse). The server parses the
 * menus without AI; one request estimates all of a day's dishes and sides separately.
 */
export type CanteenKey = 'napo' | 'mensa';

type Nutrition = NutritionInfo & Partial<MicroNutrients>;
export type CanteenEstimate = { name: string; breakdown: string; nutritionPerServing: Nutrition };
export type CanteenDish = { name: string; category?: string; details?: string; price?: number; priceReduced?: number };
export type CanteenSoup = { name: string; price?: number };
/** NAPO prices only its combos, e.g. „Menü I: Salat + Tagesgericht, 9,90 €“. */
export type CanteenCombo = { name: string; contents: string; price: number };
export type CanteenDay = { weekday: string; date: string; dishes: CanteenDish[]; soups: CanteenSoup[]; combos?: CanteenCombo[] };
export type CanteenEvaluation = {
  date: string;
  dishes: (CanteenEstimate & { dish: string })[];
  soups?: (CanteenEstimate & { soup: string })[];
  salad: CanteenEstimate;
};

type NapoMenu = { label: string; days: { weekday: string; date: string; dishes: string[] }[]; combos?: CanteenCombo[] };

export const CANTEENS: Record<CanteenKey, {
  /** Panel heading. */
  title: string;
  /** In the shortcut button / page tabs. */
  short: string;
  menuPath: string;
  estimatePath: string;
  enabled: (user: User | null) => boolean;
  toDays: (menu: unknown) => CanteenDay[];
  /** Description stored with the QuickMeal (basis for a later „Neu schätzen“). */
  describe: (dish: CanteenDish, soup: string | null, salad: boolean) => string;
}> = {
  napo: {
    title: 'NAPO Campus',
    short: 'NAPO',
    menuPath: '/api/napo-menu',
    estimatePath: '/api/napo-menu/estimate',
    enabled: user => !!user?.napoMenu,
    toDays: menu => {
      const { days, combos } = menu as NapoMenu;
      return days.map(d => ({ ...d, dishes: d.dishes.map(name => ({ name })), soups: [], combos }));
    },
    describe: (dish, _soup, salad) =>
      `NAPO Campus TU Graz (Pasta-Mittagsmenü), Tagesgericht: „${dish.name}“, normale Portion`
      + (salad ? ' + gemischter Salat als Beilage (mittelgroße Schüssel)' : ''),
  },
  mensa: {
    title: 'Mensa Inffeldgasse',
    short: 'Mensa',
    menuPath: '/api/mensa-menu',
    estimatePath: '/api/mensa-menu/estimate',
    enabled: user => !!user?.mensaMenu,
    toDays: menu => (menu as { days: CanteenDay[] }).days,
    describe: (dish, soup, salad) =>
      `Mensa TU Graz Inffeldgasse${dish.category ? ` (${dish.category.replace(/\s*€\s*[\d.,]+/, '')})` : ''}: „${dish.name}“, normale Portion`
      + (soup ? ` + Suppe „${soup}“ (ein Teller)` : '')
      + (salad ? ' + gemischter Beilagensalat (mittelgroße Schüssel)' : ''),
  },
};

export const CANTEEN_KEYS = Object.keys(CANTEENS) as CanteenKey[];

export function formatPrice(price: number): string {
  return price.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

/** "NAPO & Mensa" / "Mensa-Menü" */
export function canteensLabel(keys: CanteenKey[]): string {
  return keys.length === 1 ? `${CANTEENS[keys[0]].short}-Menü` : keys.map(k => CANTEENS[k].short).join(' & ');
}

// The window and the form both need the menu — share one request (the server caches for an hour).
const MENU_CACHE_MS = 10 * 60 * 1000;
const menuCache = new Map<CanteenKey, { at: number; days: Promise<CanteenDay[]> }>();

export function loadCanteenDays(key: CanteenKey): Promise<CanteenDay[]> {
  const hit = menuCache.get(key);
  if (hit && Date.now() - hit.at < MENU_CACHE_MS) return hit.days;
  const days = api.get<unknown>(CANTEENS[key].menuPath).then(CANTEENS[key].toDays);
  menuCache.set(key, { at: Date.now(), days });
  days.catch(() => menuCache.delete(key));
  return days;
}

/** Sum two nutrition objects (macros rounded to integers, micros to 2 decimals). */
function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100;
  }
  for (const k of NUTRITION_KEYS) out[k] = Math.round(out[k] ?? 0);
  return out as Nutrition;
}

/** Dish + optional soup + optional salad as one QuickMeal estimate. */
export function combineCanteenEstimate(ev: CanteenEvaluation, dish: string, soup: string | null, salad: boolean): CanteenEstimate | null {
  const d = ev.dishes.find(x => x.dish === dish);
  if (!d) return null;
  const sides = [
    ...(soup ? ev.soups?.filter(x => x.soup === soup).map(s => ({ label: 'Suppe', heading: `Suppe (${s.name})`, est: s })) ?? [] : []),
    ...(salad ? [{ label: 'Salat', heading: 'Salat', est: ev.salad }] : []),
  ];
  return {
    name: [d.name, ...sides.map(s => s.label)].join(' + '),
    breakdown: [d.breakdown, ...sides.map(s => `${s.heading}:\n${s.est.breakdown}`)].join('\n\n'),
    nutritionPerServing: sides.reduce((sum, s) => addNutrition(sum, s.est.nutritionPerServing), d.nutritionPerServing),
  };
}

/** Dish with the highest nutrition score (sides not included — they're independent add-ons). */
export function bestCanteenDish(ev: CanteenEvaluation): string {
  return ev.dishes.reduce((a, b) =>
    (computeNutritionScore(b.nutritionPerServing) ?? -1) > (computeNutritionScore(a.nutritionPerServing) ?? -1) ? b : a,
  ).dish;
}

/** Best dish across several canteens, same scoring as `bestCanteenDish`. */
export function bestDishOverall(evaluations: [CanteenKey, CanteenEvaluation][]): { canteen: CanteenKey; dish: string } | null {
  let best: { canteen: CanteenKey; dish: string; score: number } | null = null;
  for (const [canteen, ev] of evaluations) {
    for (const d of ev.dishes) {
      const score = computeNutritionScore(d.nutritionPerServing) ?? -1;
      if (!best || score > best.score) best = { canteen, dish: d.dish, score };
    }
  }
  return best && { canteen: best.canteen, dish: best.dish };
}
