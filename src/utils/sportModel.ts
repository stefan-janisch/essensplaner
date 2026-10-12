import type { Training, TrainingIntensity, TrainingType } from '../types/index.js';

/**
 * Flexible sport mode: instead of a fixed weekly training schedule, trainings are logged per day
 * in the plan. A day's expenditure is then the profile baseline (BMR × everyday activity level)
 * plus the kcal of that day's trainings.
 */
export type SportModel = {
  byDate: Map<string, Training[]>;
};

export const TRAINING_TYPES: { key: TrainingType; label: string; icon: string }[] = [
  { key: 'cardio', label: 'Ausdauer', icon: '🏃' },
  { key: 'strength', label: 'Kraft', icon: '🏋️' },
  { key: 'sport', label: 'Ballsport', icon: '⚽' },
  { key: 'mobility', label: 'Yoga/Mobility', icon: '🧘' },
];

export const TRAINING_INTENSITIES: { key: TrainingIntensity; label: string }[] = [
  { key: 'light', label: 'leicht' },
  { key: 'moderate', label: 'mittel' },
  { key: 'intense', label: 'intensiv' },
];

/**
 * MET values (Compendium of Physical Activities, rounded) — e.g. cardio: brisk walking/easy
 * cycling 5, jogging 7, fast running/intervals 10; strength: light machine work 3.5 … heavy 6.
 */
const MET: Record<TrainingType, Record<TrainingIntensity, number>> = {
  cardio: { light: 5, moderate: 7, intense: 10 },
  strength: { light: 3.5, moderate: 5, intense: 6 },
  sport: { light: 5, moderate: 7, intense: 9 },
  mobility: { light: 2.5, moderate: 3, intense: 4 },
};

/**
 * Extra kcal of a training: (MET − 1) × kg × hours. The resting 1 MET is already in the
 * baseline (BMR), so it is not counted twice.
 */
export function trainingKcal(t: Pick<Training, 'type' | 'intensity' | 'minutes'>, weightKg: number): number {
  return Math.round((MET[t.type][t.intensity] - 1) * weightKg * (t.minutes / 60));
}

export function trainingIcon(type: TrainingType): string {
  return TRAINING_TYPES.find(t => t.key === type)?.icon ?? '🏃';
}

export function trainingLabel(t: Pick<Training, 'type' | 'intensity' | 'minutes'>): string {
  const type = TRAINING_TYPES.find(x => x.key === t.type)?.label ?? t.type;
  const intensity = TRAINING_INTENSITIES.find(x => x.key === t.intensity)?.label ?? t.intensity;
  return `${type} · ${intensity} · ${t.minutes} min`;
}

export function buildSportModel(trainings: Training[]): SportModel {
  const byDate = new Map<string, Training[]>();
  for (const t of trainings) {
    const list = byDate.get(t.date);
    if (list) list.push(t); else byDate.set(t.date, [t]);
  }
  return { byDate };
}

export function trainingsForDate(sport: SportModel, date: string): Training[] {
  return sport.byDate.get(date) ?? [];
}
