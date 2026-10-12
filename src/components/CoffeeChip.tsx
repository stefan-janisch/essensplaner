import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import type { CoffeeHabitItem, Meal, MealPlanEntry } from '../types/index.js';
import { ModalPortal } from './Modal';
import { QuickMealForm } from './QuickMealDialog';
import { DayPopover } from './DayPopover';

const isCup = (e: MealPlanEntry, date: string) => !!e.personal && e.mealType === 'drinks' && e.date === date;

function CoffeeStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="coffee-stepper">
      <button type="button" className="coffee-stepper-btn" onClick={() => onChange(value - 1)} disabled={value <= 0}
        aria-label={`${label}: eine weniger`}>−</button>
      <span className={`coffee-stepper-value${value > 0 ? ' is-set' : ''}`}>{value}</span>
      <button type="button" className="coffee-stepper-btn" onClick={() => onChange(value + 1)}
        aria-label={`${label}: eine mehr`}>+</button>
    </span>
  );
}

/** Create (no `meal`) or edit a ☕ drink — the AI estimates its nutrition per cup. */
export function DrinkEditorModal({ meal, onClose }: { meal?: Meal; onClose: () => void }) {
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content quick-meal-dialog" onClick={e => e.stopPropagation()}>
          <div className="quick-meal-header">
            <div className="quick-meal-title">
              <h3>☕ {meal ? 'Getränk bearbeiten' : 'Neues Getränk'}</h3>
              <span>Nährwerte pro Tasse</span>
            </div>
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: '16px' }} aria-label="Schließen">{'✗'}</button>
          </div>
          <div className="quick-meal-scroll quick-meal-form-scroll">
            <QuickMealForm drink meal={meal} onSaved={onClose} onCancel={onClose} onRemoved={onClose} />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Drinks in a stable, useful order: habit drinks first, then favourites, then the rest. */
function useOrderedDrinks(): Meal[] {
  const { drinks, coffeeHabit } = useMealPlan();
  return useMemo(() => {
    const habitIds = new Set(coffeeHabit.map(h => h.mealId));
    const rank = (m: Meal) => (habitIds.has(m.id) ? 0 : m.starred ? 1 : 2);
    return [...drinks].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'de'));
  }, [drinks, coffeeHabit]);
}

/**
 * ☕ per-day coffee counter next to the day's persons badge. Shows the cups of that day; the
 * popover sets them per drink. Cups are personal: they count fully for the current user only.
 */
export function CoffeeChip({ date }: { date: string }) {
  const { activePlan, setCoffeeCount, allMealsForActivePlan } = useMealPlan();
  const drinks = useOrderedDrinks();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!activePlan || activePlan.planType === 'menu') return null;

  const cups = (activePlan.entries || []).filter(e => isCup(e, date));
  const countOf = (mealId: string) => cups.filter(e => e.mealId === mealId).reduce((s, e) => s + e.servings, 0);
  const total = cups.reduce((s, e) => s + e.servings, 0);
  const mealsById = new Map(allMealsForActivePlan.map(m => [m.id, m]));
  const kcal = Math.round(cups.reduce((s, e) => s + e.servings * (mealsById.get(e.mealId)?.nutritionPerServing?.kcal ?? 0), 0));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`day-persons-badge day-coffee-badge${total > 0 ? ' is-set' : ''}`}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title={total > 0 ? `${total} ${total === 1 ? 'Kaffee' : 'Kaffees'} · ${kcal} kcal – klicken zum Ändern` : 'Kaffee eintragen'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        ☕{total > 0 ? ` ${total}` : ''}
      </button>

      {open && (
        <DayPopover anchorRef={buttonRef} onClose={() => setOpen(false)} label="Kaffee an diesem Tag">
          <div className="coffee-popover-header">
            <strong>☕ {format(parseISO(date), 'EEEEEE dd.MM.', { locale: de })}</strong>
            {total > 0 && <span>{kcal} kcal</span>}
          </div>
          {drinks.length === 0 ? (
            <p className="coffee-popover-empty">
              Noch kein Getränk angelegt. Beschreib deinen Kaffee, die KI schätzt die Nährwerte pro Tasse.
            </p>
          ) : (
            <ul className="coffee-list">
              {drinks.map(d => (
                <li key={d.id} className="coffee-row">
                  <span className="coffee-row-text">
                    <span className="coffee-row-name">{d.name}</span>
                    {d.nutritionPerServing && (
                      <span className="coffee-row-meta">
                        {Math.round(d.nutritionPerServing.kcal)} kcal · {Math.round(d.nutritionPerServing.protein)} g Protein
                      </span>
                    )}
                  </span>
                  <CoffeeStepper value={countOf(d.id)} label={d.name}
                    onChange={n => setCoffeeCount(date, d.id, n)} />
                </li>
              ))}
            </ul>
          )}
          <div className="coffee-popover-footer">
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setCreating(true); }}>＋ Getränk</button>
            <span className="coffee-popover-hint">Gewohnheit: Einstellungen</span>
          </div>
        </DayPopover>
      )}

      {creating && <DrinkEditorModal onClose={() => setCreating(false)} />}
    </>
  );
}

const HABIT_SAVE_DELAY_MS = 600;

/** Settings section: drinks for the ☕ counter and the daily habit pre-planned on coming days. */
export function CoffeeSettings() {
  const { coffeeHabit, setCoffeeHabit } = useMealPlan();
  const drinks = useOrderedDrinks();
  const [draft, setDraft] = useState<CoffeeHabitItem[] | null>(null);
  const [editing, setEditing] = useState<Meal | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // A deleted drink drops out of the habit (the server ignores it as well).
  const habit = (draft ?? coffeeHabit).filter(h => drinks.some(d => d.id === h.mealId));
  const countOf = (mealId: string) => habit.find(h => h.mealId === mealId)?.count ?? 0;

  const change = (mealId: string, n: number) => {
    const next = [...habit.filter(h => h.mealId !== mealId), ...(n > 0 ? [{ mealId, count: Math.min(20, n) }] : [])];
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await setCoffeeHabit(next);
      } finally {
        setSaving(false);
        setDraft(null);
      }
    }, HABIT_SAVE_DELAY_MS);
  };

  const perDay = habit.reduce((s, h) => {
    const n = drinks.find(d => d.id === h.mealId)?.nutritionPerServing;
    return { cups: s.cups + h.count, kcal: s.kcal + h.count * (n?.kcal ?? 0) };
  }, { cups: 0, kcal: 0 });

  return (
    <div className="settings-section">
      <h3>☕ Kaffee</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Getränke für den ☕-Zähler im Plan. Die tägliche Gewohnheit wird ab heute automatisch eingeplant
        und zählt nur für dich. Einzelne Tage änderst du im Plan über ☕. Änderungen hier ersetzen die
        noch nicht angepassten kommenden Tage.
      </p>
      {drinks.length > 0 && (
        <ul className="coffee-list coffee-settings-list">
          {drinks.map(d => (
            <li key={d.id} className="coffee-row">
              <button type="button" className="coffee-row-text coffee-row-edit" onClick={() => setEditing(d)} title="Bearbeiten">
                <span className="coffee-row-name">{d.name} <span aria-hidden>✎</span></span>
                {d.nutritionPerServing && (
                  <span className="coffee-row-meta">
                    {Math.round(d.nutritionPerServing.kcal)} kcal · {Math.round(d.nutritionPerServing.protein)} g Protein pro Tasse
                  </span>
                )}
              </button>
              <span className="coffee-habit-label">täglich</span>
              <CoffeeStepper value={countOf(d.id)} label={`${d.name} täglich`} onChange={n => change(d.id, n)} />
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
        <button className="btn btn-muted btn-sm" onClick={() => setEditing('new')}>＋ Getränk anlegen</button>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {saving ? 'Speichere…' : perDay.cups > 0
            ? `Gewohnheit: ${perDay.cups} pro Tag · ${Math.round(perDay.kcal)} kcal`
            : 'Keine Gewohnheit eingestellt'}
        </span>
      </div>
      {editing && <DrinkEditorModal meal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
