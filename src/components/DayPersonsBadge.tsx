import { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { personsForDate, hasDayPersonsOverride } from '../utils/dayPersons';

/**
 * How many people eat on this one day — shown next to every day of the plan.
 *
 * Muted while the day follows the plan's count, highlighted once it deviates. Clearing the
 * field (or typing the plan's own count) removes the exception again, so the plan stays the
 * single place to change the normal case.
 */
export function DayPersonsBadge({ date }: { date: string }) {
  const { activePlan, defaultServings, setDayPersons } = useMealPlan();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!activePlan) return null;

  const persons = personsForDate(activePlan, date, defaultServings);
  const planPersons = Math.max(1, activePlan.defaultServings ?? defaultServings);
  const isOverride = hasDayPersonsOverride(activePlan, date);

  const commit = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    // Empty, invalid or "same as the plan" → no exception for this day.
    if (!draft.trim() || !Number.isFinite(n) || n < 1 || n === planPersons) {
      if (isOverride) setDayPersons(date, null);
    } else if (n !== persons) {
      setDayPersons(date, n);
    }
  };

  if (editing) {
    return (
      <input
        className="input day-persons-input"
        type="number"
        min="1"
        max="50"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <button
      type="button"
      className={`day-persons-badge${isOverride ? ' day-persons-badge-override' : ''}`}
      onClick={e => { e.stopPropagation(); setDraft(String(persons)); setEditing(true); }}
      title={isOverride
        ? `${persons} Personen essen an diesem Tag mit (Plan: ${planPersons}). Klicken zum Ändern, leeren setzt auf den Plan zurück.`
        : `${persons} Personen laut Plan. Klicken, um nur für diesen Tag eine andere Zahl zu setzen.`}
    >
      👥 {persons}
    </button>
  );
}
