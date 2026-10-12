import { useCallback, useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { getScoredMicroReference } from '../utils/microReference';
import { calculatePlanScore, mealsMap } from '../utils/dayScore';
import { personsForDate } from '../utils/dayPersons';
import type { PlanScore } from '../utils/dayScore';
import type { MealPlan } from '../types/index.js';

/** Everything the day/plan score needs from the user's settings, shared by all score displays. */
export function useScoringInputs(plan: MealPlan | null | undefined) {
  const { state, quickMeals, nutritionProfile, defaultServings, targetsForDate: targetsFor } = useMealPlan();

  const microRefs = useMemo(() => getScoredMicroReference(nutritionProfile), [nutritionProfile]);
  // Own meals win over shared copies of the same id.
  const mealsById = useMemo(
    () => mealsMap([...(plan?.sharedMeals ?? []), ...state.meals, ...quickMeals]),
    [plan?.sharedMeals, state.meals, quickMeals],
  );
  const persons = plan?.defaultServings ?? defaultServings;
  // Per-day person count (guests, eating alone); falls back to the plan's, then the user's.
  const personsFor = useCallback(
    (date: string) => personsForDate(plan, date, defaultServings),
    [plan, defaultServings],
  );

  return { targetsFor, microRefs, mealsById, persons, personsFor };
}

/** Plan score for a weekly plan whose entries are loaded; null for menu plans or unloaded plans. */
export function usePlanScore(plan: MealPlan | null | undefined): PlanScore | null {
  const { targetsFor, microRefs, mealsById, personsFor } = useScoringInputs(plan);
  return useMemo(() => {
    if (!plan || plan.planType === 'menu' || !plan.entries) return null;
    return calculatePlanScore(plan.entries, mealsById, targetsFor, microRefs, personsFor, plan.startDate, plan.endDate);
  }, [plan, mealsById, targetsFor, microRefs, personsFor]);
}
