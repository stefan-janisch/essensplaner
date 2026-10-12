import { useMemo, useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { useScoringInputs } from '../hooks/usePlanScore';
import { useOptimizerMode } from '../hooks/useOptimizerMode';
import { optimizeSingleDay, scoreDay, sumDay } from '../utils/dayScore';
import { formatPortionWeight, portionWeightTitle } from '../utils/portionWeight';
import type { ServingChange } from '../utils/dayScore';
import type { NutritionTargets } from '../types/index.js';

const formatServings = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const pct = (value: number, target: number) => (target > 0 ? Math.round((value / target) * 100) : 0);

/** "Protein zuerst | Defizit zuerst | Gesamt-Score" — shared by the plan and per-day popups. */
export function OptimizerModeToggle() {
  const [mode, setMode] = useOptimizerMode();
  return (
    <div className="optimizer-mode" role="group" aria-label="Optimierungsziel">
      <button type="button" className={`pill ${mode === 'protein' ? 'pill-active' : ''}`} onClick={() => setMode('protein')}
        title="Möglichst viel Protein. Tage, die schon über dem Kalorienziel liegen, bleiben wie sie sind — heruntergerechnet würden sie Protein kosten.">
        Protein zuerst
      </button>
      <button type="button" className={`pill ${mode === 'deficit' ? 'pill-active' : ''}`} onClick={() => setMode('deficit')}
        title="Kalorienziel als harte Obergrenze: Tage darüber werden heruntergerechnet, auch wenn das Protein kostet. Darunter zählt möglichst viel Protein.">
        Defizit zuerst
      </button>
      <button type="button" className={`pill ${mode === 'score' ? 'pill-active' : ''}`} onClick={() => setMode('score')}
        title="Bestmöglicher Tages-Score über alle Nährwerte">
        Gesamt-Score
      </button>
    </div>
  );
}

/**
 * Scale the portions of one day so it meets the targets as well as possible (optimizer mode from
 * the toggle). Shows the effect before applying; cooked (✗) entries, quick meals, drinks and misc
 * stay as they are.
 */
export function DayPortionOptimizer({ date, targets }: { date: string; targets: NutritionTargets }) {
  const { activePlan, updateEntryServings } = useMealPlan();
  const { microRefs, mealsById, personsFor } = useScoringInputs(activePlan);
  const [mode] = useOptimizerMode();
  const [applied, setApplied] = useState<ServingChange[] | null>(null);
  const entries = activePlan?.entries;

  const proposal = useMemo(() => {
    if (!entries) return null;
    const persons = personsFor(date);
    const { changes, override } = optimizeSingleDay(date, entries, mealsById, targets, microRefs, persons, mode);
    if (changes.length === 0) return null;
    const dayEntries = entries.filter(e => e.date === date);
    const stats = (servingsOverride?: Map<number, number>) => {
      const sum = sumDay(dayEntries, mealsById, persons, servingsOverride);
      return {
        score: scoreDay(sum.totals, sum.micros, targets, microRefs).score,
        protein: pct(sum.totals.protein, targets.protein),
        kcal: pct(sum.totals.kcal, targets.kcal),
      };
    };
    return { changes, before: stats(), after: stats(override) };
  }, [date, entries, mealsById, targets, microRefs, personsFor, mode]);

  const apply = () => {
    if (!proposal) return;
    for (const c of proposal.changes) updateEntryServings(c.entryId, c.to);
    setApplied(proposal.changes);
  };
  const undo = () => {
    if (!applied) return;
    for (const c of applied) updateEntryServings(c.entryId, c.from);
    setApplied(null);
  };

  return (
    <div className="day-optimizer">
      <div className="day-optimizer-head">
        <span>Portionen anpassen</span>
        <OptimizerModeToggle />
      </div>
      {applied ? (
        <div className="day-optimizer-row">
          <span>✓ {applied.length} {applied.length === 1 ? 'Portion' : 'Portionen'} angepasst</span>
          <button type="button" className="btn btn-muted btn-sm" onClick={undo}>Rückgängig</button>
        </div>
      ) : !proposal ? (
        <div className="day-optimizer-hint">Die Portionen passen bereits – besser geht es nur mit anderen Rezepten.</div>
      ) : (
        <>
          <div className="day-optimizer-effect">
            <span>P {proposal.before.protein} % → <strong>{proposal.after.protein} %</strong></span>
            <span>kcal {proposal.before.kcal} % → <strong>{proposal.after.kcal} %</strong></span>
            <span>Score {proposal.before.score} → <strong>{proposal.after.score}</strong></span>
          </div>
          <ul className="day-optimizer-changes">
            {proposal.changes.map(c => {
              const weight = formatPortionWeight(mealsById.get(c.mealId), c.to);
              return (
                <li key={c.entryId}>
                  <span className="day-optimizer-change-name" title={mealsById.get(c.mealId)?.name}>{mealsById.get(c.mealId)?.name ?? '—'}</span>
                  <span className="day-optimizer-change-value">
                    {formatServings(c.from)} → <strong>{formatServings(c.to)}</strong> Port.
                    {weight && <span className="portion-weight" title={portionWeightTitle(mealsById.get(c.mealId), c.to)}> · {weight}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-primary btn-sm" onClick={apply}>Anwenden</button>
        </>
      )}
    </div>
  );
}
