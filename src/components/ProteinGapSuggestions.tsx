import { useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { boosterSuggestions, proteinGap, requiredDensity } from '../utils/proteinPlanning';
import { formatProteinDensity } from '../utils/nutritionScore';
import { formatPortionWeight, portionWeightTitle } from '../utils/portionWeight';
import { personsForDate } from '../utils/dayPersons';
import type { NutritionInfo, NutritionTargets } from '../types/index.js';

const formatMultiplier = (m: number) => `${m.toLocaleString('de-DE', { maximumFractionDigits: 2 })}×`;

/**
 * "Lücke schließen": what protein a day still lacks within its kcal budget, plus small boosters
 * scaled to fill it. One click adds the booster (at that portion) to the day's snack column.
 * `totals` are the day's per-person totals.
 */
export function ProteinGapSuggestions({ date, totals, targets }: {
  date: string;
  totals: NutritionInfo;
  targets: NutritionTargets;
}) {
  const { state, quickMeals, activePlan, defaultServings, addMealToSlot } = useMealPlan();
  const persons = personsForDate(activePlan, date, defaultServings);
  const { protein: gapProtein, kcal: gapKcal } = proteinGap(totals, targets);
  const gap = useMemo(() => ({ protein: gapProtein, kcal: gapKcal }), [gapProtein, gapKcal]);
  const need = requiredDensity(gap);
  const suggestions = useMemo(
    () => boosterSuggestions([...state.meals, ...quickMeals], gap),
    [state.meals, quickMeals, gap],
  );

  if (need === null) {
    return <div className="protein-gap protein-gap-done">Proteinziel erreicht ✓</div>;
  }

  return (
    <div className="protein-gap">
      <div className="protein-gap-head">
        <span>Es fehlen <strong>{Math.round(gap.protein)} g Protein</strong></span>
        <span>· Budget noch {Math.round(gap.kcal)} kcal</span>
      </div>
      {need === Infinity ? (
        <div className="protein-gap-hint">
          Kalorienbudget ausgeschöpft – mehr Protein geht nur über andere Portionen (Plan-Score → „Protein zuerst“).
        </div>
      ) : suggestions.length === 0 ? (
        <div className="protein-gap-hint">
          Kein Booster passt ins Budget (nötig: ≥ {formatProteinDensity(need)} g Protein/100 kcal).
        </div>
      ) : (
        <ul className="protein-gap-list">
          {suggestions.map(s => (
            <li key={s.meal.id}>
              <span className="protein-gap-name" title={s.meal.name}>{s.meal.name}</span>
              <span className="protein-gap-meta">
                {formatMultiplier(s.multiplier)} → +{s.protein} g P · {s.kcal} kcal
                {formatPortionWeight(s.meal, s.multiplier) && (
                  <span className="portion-weight" title={portionWeightTitle(s.meal, s.multiplier)}> · {formatPortionWeight(s.meal, s.multiplier)}</span>
                )}
              </span>
              <button
                type="button"
                className="btn btn-muted btn-sm"
                title={`${formatMultiplier(s.multiplier)} Portion pro Person${formatPortionWeight(s.meal, s.multiplier) ? ` (${formatPortionWeight(s.meal, s.multiplier)})` : ''} in die Snack-Spalte`}
                onClick={e => {
                  e.stopPropagation();
                  addMealToSlot(date, 'snacks', s.meal.id, Math.round(persons * s.multiplier * 10) / 10);
                }}
              >
                + Snack
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
