import type { NutritionProfile, CalculatedNutrition, DayType, NutritionTargets, MicroTargets, WeekDayTypes } from '../types/index.js';

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

export function calculateBMR(profile: NutritionProfile): number {
  if (profile.bodyFatPercent != null && profile.bodyFatPercent > 0) {
    // Katch-McArdle
    const lbm = profile.weightKg * (1 - profile.bodyFatPercent / 100);
    return 370 + 21.6 * lbm;
  }
  // Harris-Benedict (revised)
  if (profile.gender === 'f') {
    return 447.593 + 9.247 * profile.weightKg + 3.098 * profile.heightCm - 4.330 * profile.age;
  }
  return 88.362 + 13.397 * profile.weightKg + 4.799 * profile.heightCm - 5.677 * profile.age;
}

export function calculateTDEE(profile: NutritionProfile, bmr: number): number {
  const activityBase = bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const sessions = countSessionsFromWeek(profile.weekDayTypes);
  const strengthCal = sessions.strength * TRAINING_CAL.strength[profile.strengthIntensity];
  const cardioCal = sessions.cardio * TRAINING_CAL.cardio[profile.cardioIntensity];
  const dailyTraining = (strengthCal + cardioCal) / 7;
  return activityBase + dailyTraining;
}

export function calculateNutrition(profile: NutritionProfile): CalculatedNutrition {
  const bmr = Math.round(calculateBMR(profile));
  const tdee = Math.round(calculateTDEE(profile, bmr));

  // Goal adjustment
  let goalAdj = 0;
  if (profile.goal === 'bulk') {
    goalAdj = lerp(300, 500, profile.aggressiveness / 100);
  } else if (profile.goal === 'cut') {
    goalAdj = -lerp(300, 500, profile.aggressiveness / 100);
  }
  const targetKcal = Math.round(tdee + goalAdj);

  // Macros
  // Protein: higher in deficit (1.6-2.2 g/kg), lower in bulk
  const deficitFactor = profile.goal === 'cut' ? 1.0 : profile.goal === 'maintain' ? 0.5 : 0.0;
  const proteinGPerKg = lerp(1.6, 2.2, deficitFactor);
  const proteinG = Math.round(proteinGPerKg * profile.weightKg);
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
  const totalSessions = sessions.strength + sessions.cardio;
  const waterL = Math.round((profile.weightKg * 0.033 + totalSessions * 0.5 / 7) * 10) / 10;

  // Micronutrients
  const trainingScale = 1 + 0.03 * totalSessions;
  const isFemale = profile.gender === 'f';
  const micros: MicroTargets = {
    magnesiumMg: Math.round((isFemale ? 310 : 400) * trainingScale),
    zincMg: Math.round((isFemale ? 8 : 11) * trainingScale * 10) / 10,
    ironMg: Math.round((isFemale ? 18 : 8) * (1 + 0.02 * totalSessions) * 10) / 10,
    vitaminDIu: 800,
    omega3G: 2,
    calciumMg: Math.round(1000 * (1 + 0.02 * totalSessions)),
  };

  return {
    bmr, tdee, targetKcal,
    proteinG, proteinKcal,
    fatG, fatKcal,
    carbsG, carbsKcal: carbsG * 4,
    fiberG, waterL, micros,
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

export function toNutritionTargets(calc: CalculatedNutrition): NutritionTargets {
  return {
    kcal: calc.targetKcal,
    protein: calc.proteinG,
    carbs: calc.carbsG,
    fat: calc.fatG,
    fiber: calc.fiberG,
  };
}
