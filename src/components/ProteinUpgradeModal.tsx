import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useMealPlan } from '../context/MealPlanContext';
import { formatProteinDensity } from '../utils/nutritionScore';
import type { Ingredient, Meal } from '../types/index.js';
import { ModalPortal } from './Modal';

type Upgrade = {
  name: string;
  summary: string;
  changes: { from: string; to: string; reason: string }[];
  ingredientText: string;
  recipeText: string;
  estimate: { kcal: number; protein: number };
  before: { kcal: number; protein: number } | null;
};

const density = (v: { kcal: number; protein: number } | null) =>
  v && v.kcal > 0 ? formatProteinDensity((v.protein / v.kcal) * 100) : '–';

/**
 * AI "Protein-Upgrade": proposes swaps for a clearly higher protein density at about the same kcal
 * per serving. Saving creates a new variant (original untouched): the ingredient text goes through
 * the regular parser (display + shopping list) and the variant gets the regular nutrition estimate.
 */
export function ProteinUpgradeModal({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const { duplicateMeal } = useMealPlan();
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Meal | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // one (paid) request, also under StrictMode double effects
    started.current = true;
    api.post<Upgrade>('/api/protein-upgrade', { mealId: meal.id })
      .then(setUpgrade)
      .catch(e => setError(e instanceof Error ? e.message : 'Protein-Upgrade fehlgeschlagen'));
  }, [meal.id]);

  const save = async () => {
    if (!upgrade) return;
    setSaving(true);
    setError(null);
    try {
      const parsed = await api.post<{ ingredients: Ingredient[]; shoppingIngredients: Ingredient[] }>(
        '/api/parse-ingredients', { ingredientText: upgrade.ingredientText },
      );
      const variant = await duplicateMeal(meal.id, {
        name: upgrade.name,
        ingredients: parsed.ingredients,
        shoppingIngredients: parsed.shoppingIngredients?.length ? parsed.shoppingIngredients : undefined,
        recipeText: upgrade.recipeText || meal.recipeText,
      });
      if (!variant) throw new Error('Variante konnte nicht gespeichert werden');
      setSaved(variant);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content protein-upgrade" onClick={e => e.stopPropagation()}>
          <div className="quick-meal-header">
            <h3>💪 Protein-Upgrade</h3>
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: '16px' }} aria-label="Schließen">{'✗'}</button>
          </div>

          {!upgrade && !error && (
            <div className="protein-upgrade-loading">Die KI überarbeitet „{meal.name}“ … (ca. 15 Sekunden)</div>
          )}

          {upgrade && !saved && (
            <>
              <div className="protein-upgrade-name">{upgrade.name}</div>
              {upgrade.summary && <p className="protein-upgrade-summary">{upgrade.summary}</p>}

              <table className="protein-upgrade-compare">
                <thead>
                  <tr><th></th><th>kcal</th><th>Protein</th><th>g/100 kcal</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Original</td>
                    <td>{upgrade.before?.kcal ?? '–'}</td>
                    <td>{upgrade.before ? `${upgrade.before.protein} g` : '–'}</td>
                    <td>{density(upgrade.before)}</td>
                  </tr>
                  <tr className="protein-upgrade-new">
                    <td>Protein+ (ca.)</td>
                    <td>{upgrade.estimate.kcal}</td>
                    <td>{upgrade.estimate.protein} g</td>
                    <td><strong>{density(upgrade.estimate)}</strong></td>
                  </tr>
                </tbody>
              </table>
              <div className="quick-meal-hint">Pro Portion. Die genauen Nährwerte werden nach dem Speichern wie bei jedem Rezept berechnet.</div>

              {upgrade.changes.length > 0 && (
                <ul className="protein-upgrade-changes">
                  {upgrade.changes.map((c, i) => (
                    <li key={i}>
                      <span className="protein-upgrade-from">{c.from}</span> → <strong>{c.to}</strong>
                      {c.reason && <div className="protein-upgrade-reason">{c.reason}</div>}
                    </li>
                  ))}
                </ul>
              )}

              <details className="protein-upgrade-details">
                <summary>Neue Zutatenliste</summary>
                <pre>{upgrade.ingredientText}</pre>
              </details>

              <div className="quick-meal-footer">
                <button className="btn btn-muted" onClick={onClose}>Verwerfen</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Speichere…' : 'Als Variante speichern'}
                </button>
              </div>
            </>
          )}

          {saved && (
            <>
              <p>✓ „{saved.name}“ ist gespeichert. Das Original bleibt unverändert; Nährwerte und Einkaufsliste der Variante werden gerade berechnet.</p>
              <div className="quick-meal-footer">
                <button className="btn btn-primary" onClick={onClose}>Schließen</button>
              </div>
            </>
          )}

          {error && <div className="quick-meal-error">{error}</div>}
        </div>
      </div>
    </ModalPortal>
  );
}
