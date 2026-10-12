import type { NutritionProfile, CalculatedNutrition, DayType, NutritionTargets, WeekDayTypes } from '../types/index.js';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import { activeKcalForDate, weekdayOf, TEF } from './activityModel';
import type { ActivityModel } from './activityModel';
import { trainingKcal, trainingsForDate } from './sportModel';
import type { SportModel } from './sportModel';

export function countSessionsFromWeek(week: WeekDayTypes): { strength: number; cardio: number } {
  const days = Object.values(week);
  return {
    strength: days.filter(d => d === 'strength').length,
    cardio: days.filter(d => d === 'cardio').length,
  };
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderate: 1.55,
  very_active: 1.725,
} as const;

// Calories burned per training session (amortized over the week)
const TRAINING_CAL = {
  strength: { light: 200, moderate: 350, intense: 500 },
  cardio: { light: 150, moderate: 300, intense: 500 },
} as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Lean body mass (kg) when body fat is known, otherwise null. */
function leanBodyMass(profile: NutritionProfile): number | null {
  if (profile.bodyFatPercent != null && profile.bodyFatPercent > 0) {
    return profile.weightKg * (1 - profile.bodyFatPercent / 100);
  }
  return null;
}

export function calculateBMR(profile: NutritionProfile): number {
  const lbm = leanBodyMass(profile);
  if (lbm !== null) {
    // Katch-McArdle
    return 370 + 21.6 * lbm;
  }
  // Harris-Benedict (revised)
  if (profile.gender === 'f') {
    return 447.593 + 9.247 * profile.weightKg + 3.098 * profile.heightCm - 4.330 * profile.age;
  }
  return 88.362 + 13.397 * profile.weightKg + 4.799 * profile.heightCm - 5.677 * profile.age;
}

/**
 * Expenditure: everyday activity plus the weekly training schedule averaged over the week.
 * In flexible sport mode (`sport`) only the everyday part — trainings are added per day.
 */
export function calculateTDEE(profile: NutritionProfile, bmr: number, sport?: SportModel | null): number {
  const activityBase = bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel];
  if (sport) return activityBase;
  const sessions = countSessionsFromWeek(profile.weekDayTypes);
  const strengthCal = sessions.strength * TRAINING_CAL.strength[profile.strengthIntensity];
  const cardioCal = sessions.cardio * TRAINING_CAL.cardio[profile.cardioIntensity];
  const dailyTraining = (strengthCal + cardioCal) / 7;
  return activityBase + dailyTraining;
}

/** kcal on top of (bulk) or below (cut) the expenditure, scaled by aggressiveness. */
export function goalAdjustment(profile: NutritionProfile): number {
  if (profile.goal === 'bulk') return lerp(300, 500, profile.aggressiveness / 100);
  if (profile.goal === 'cut') return -lerp(300, 500, profile.aggressiveness / 100);
  return 0;
}

export function calculateNutrition(profile: NutritionProfile, sport?: SportModel | null): CalculatedNutrition {
  const bmr = Math.round(calculateBMR(profile));
  const tdee = Math.round(calculateTDEE(profile, bmr, sport));

  const targetKcal = Math.round(tdee + goalAdjustment(profile));

  // Macros
  // Protein: higher in deficit (1.6-2.2 g/kg), lower in bulk — per kg lean mass when body fat is known
  const deficitFactor = profile.goal === 'cut' ? 1.0 : profile.goal === 'maintain' ? 0.5 : 0.0;
  const proteinGPerKg = lerp(1.6, 2.2, deficitFactor);
  const proteinG = Math.round(proteinGPerKg * (leanBodyMass(profile) ?? profile.weightKg));
  const proteinKcal = proteinG * 4;

  // Fat: 0.8-1.2 g/kg, min 0.7
  const fatGPerKg = lerp(0.8, 1.2, 1 - deficitFactor);
  const fatG = Math.round(Math.max(0.7 * profile.weightKg, fatGPerKg * profile.weightKg));
  const fatKcal = fatG * 9;

  // Carbs: remaining calories
  const carbsKcal = Math.max(200, targetKcal - proteinKcal - fatKcal); // min 50g = 200 kcal
  const carbsG = Math.round(carbsKcal / 4);

  // Fiber
  const activityFactor = Object.keys(ACTIVITY_MULTIPLIERS).indexOf(profile.activityLevel) / 3;
  const fiberG = Math.round(lerp(30, 40, activityFactor));

  // Water (liters)
  const sessions = countSessionsFromWeek(profile.weekDayTypes);
  const totalSessions = sport ? 0 : sessions.strength + sessions.cardio;
  const waterL = Math.round((profile.weightKg * 0.033 + totalSessions * 0.5 / 7) * 10) / 10;

  return {
    bmr, tdee, targetKcal,
    proteinG, proteinKcal,
    fatG, fatKcal,
    carbsG, carbsKcal: carbsG * 4,
    fiberG, waterL,
  };
}

export type DayAdjusted = {
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  hint?: string;
};

export function calculateDayAdjustment(base: CalculatedNutrition, dayType: DayType): DayAdjusted {
  switch (dayType) {
    case 'cardio':
      return {
        targetKcal: Math.round(base.targetKcal * 1.05),
        proteinG: base.proteinG,
        carbsG: Math.round(base.carbsG * 1.15),
        fatG: base.fatG,
        hint: 'Mehr Kohlenhydrate für Ausdauerleistung',
      };
    case 'strength':
      return {
        targetKcal: base.targetKcal,
        proteinG: Math.round(base.proteinG * 1.05),
        carbsG: base.carbsG,
        fatG: base.fatG,
        hint: 'Protein gleichmäßig über den Tag verteilen',
      };
    case 'rest':
    default:
      return {
        targetKcal: Math.round(base.targetKcal * 0.90),
        proteinG: base.proteinG,
        carbsG: Math.round(base.carbsG * 0.80),
        fatG: base.fatG,
      };
  }
}

export type DayEnergy = {
  /** Estimated total expenditure that day. */
  tdee: number;
  /** tdee plus the goal adjustment — the day's kcal target. */
  targetKcal: number;
  /**
   * 'actual'/'weekday' = from Apple Health (measured day / rolling weekday average),
   * 'training' = flexible sport mode (baseline + logged trainings), 'profile' = weekly-schedule estimate.
   */
  source: 'actual' | 'weekday' | 'training' | 'profile';
  /** Flexible sport mode: kcal of the day's logged trainings (included in tdee unless measured). */
  trainingKcal?: number;
  /** Measured active kcal behind the estimate (before the factor), when from Apple Health. */
  activeKcal?: number;
  /** Measured days behind a weekday average. */
  samples?: number;
};

/**
 * A date's expenditure and kcal target. With Apple Health data (`activity`) the day is
 * BMR + TEF + measured active kcal × factor — the activity multiplier and training allowances
 * are dropped, they would count the same movement twice. Without data for that weekday it
 * falls back to the profile estimate, adjusted by the weekday's training type.
 */
export function getDayEnergy(profile: NutritionProfile, date: string, activity?: ActivityModel | null, sport?: SportModel | null): DayEnergy {
  return dayEnergy(profile, calculateNutrition(profile, sport), date, activity, sport);
}

/** True when Apple Health drives the day's kcal (measured, or the weekday average). */
export function isHealthSource(energy: DayEnergy): boolean {
  return energy.source === 'actual' || energy.source === 'weekday';
}

/**
 * Flexible sport mode with Apple Health: a measured day already contains its trainings, so the
 * measurement wins. Days without a measurement (today, coming days) use baseline + logged
 * trainings instead of the weekday average — the average contains typical trainings and would
 * count a logged one twice.
 */
function dayEnergy(profile: NutritionProfile, calc: CalculatedNutrition, date: string, activity?: ActivityModel | null, sport?: SportModel | null): DayEnergy {
  const logged = sport ? trainingsForDate(sport, date).reduce((s, t) => s + trainingKcal(t, profile.weightKg), 0) : 0;
  const active = activity ? activeKcalForDate(activity, date) : null;
  if (activity && active && (!sport || active.source === 'actual')) {
    const tdee = Math.round(calc.bmr * (1 + TEF) + active.kcal * activity.factor);
    return {
      tdee,
      targetKcal: Math.round(tdee + goalAdjustment(profile)),
      source: active.source,
      activeKcal: Math.round(active.kcal),
      samples: active.n,
      ...(sport ? { trainingKcal: logged } : {}),
    };
  }
  if (sport) {
    const tdee = calc.tdee + logged;
    return { tdee, targetKcal: Math.round(tdee + goalAdjustment(profile)), source: 'training', trainingKcal: logged };
  }
  const dayTarget = calculateDayAdjustment(calc, profile.weekDayTypes[weekdayOf(date)]).targetKcal;
  // Expenditure carries the same weekday adjustment as the target (rest ~10 % lower, cardio ~5 % higher).
  return { tdee: calc.tdee + (dayTarget - calc.targetKcal), targetKcal: dayTarget, source: 'profile' };
}

/**
 * Get day-adjusted NutritionTargets for a specific date.
 * Maps the date's weekday to the profile's weekDayTypes, then adjusts macros. With Apple Health
 * data the kcal come from getDayEnergy and carbs fill what protein and fat leave.
 */
export function getDayTargets(profile: NutritionProfile, date: string, activity?: ActivityModel | null, sport?: SportModel | null): NutritionTargets {
  const calc = calculateNutrition(profile, sport);
  const dayType = profile.weekDayTypes[weekdayOf(date)];
  const adj = calculateDayAdjustment(calc, dayType);
  const energy = activity || sport ? dayEnergy(profile, calc, date, activity, sport) : null;
  if (energy && energy.source !== 'profile') {
    // Flexible mode: +5 % protein on days with a logged strength training (like a strength weekday).
    const protein = sport
      ? (trainingsForDate(sport, date).some(t => t.type === 'strength') ? Math.round(calc.proteinG * 1.05) : calc.proteinG)
      : adj.proteinG;
    const carbsKcal = Math.max(200, energy.targetKcal - protein * 4 - calc.fatG * 9); // min 50 g
    return {
      kcal: energy.targetKcal,
      protein,
      carbs: Math.round(carbsKcal / 4),
      fat: calc.fatG,
      fiber: calc.fiberG,
      sugar: 25,
    };
  }
  return {
    kcal: adj.targetKcal,
    protein: adj.proteinG,
    carbs: adj.carbsG,
    fat: adj.fatG,
    fiber: calc.fiberG,
    sugar: 25,
  };
}

/** Resolve a single day's macro targets: profile (weekday-adjusted, Apple Health if given) → user targets → defaults. */
export function resolveDayTargets(
  date: string,
  profile: NutritionProfile | null,
  targets: NutritionTargets | null,
  activity?: ActivityModel | null,
  sport?: SportModel | null,
): NutritionTargets {
  if (profile) return getDayTargets(profile, date, activity, sport);
  if (targets) return { ...DEFAULT_NUTRITION_TARGETS, ...targets };
  return DEFAULT_NUTRITION_TARGETS;
}
