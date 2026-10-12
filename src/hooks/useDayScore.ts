import { useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { calculateDayScore } from '../utils/dayScore';
import { useScoringInputs } from './usePlanScore';

/**
 * One day of the active plan: its score (null without nutrition data), the targets it is scored
 * against, and whether anything is planned at all. Shared by the weekday name and its indicator.
 */
export function useDayScore(date: string) {
  const { activePlan } = useMealPlan();
  const { targetsFor, microRefs, mealsById, personsFor } = useScoringInputs(activePlan);

  const entries = activePlan?.entries;
  const hasEntries = !!entries?.some(e => e.date === date);
  const targets = useMemo(() => targetsFor(date), [targetsFor, date]);
  const result = useMemo(
    () => calculateDayScore(date, entries || [], mealsById, targets, microRefs, personsFor(date)),
    [date, entries, mealsById, targets, microRefs, personsFor],
  );
  return { result, targets, hasEntries };
}
