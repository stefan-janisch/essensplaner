import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useMealPlan } from '../context/MealPlanContext';
import { compressImage } from '../utils/image';
import { NUTRITION_KEYS, NUTRITION_LABELS } from '../utils/nutritionColors';
import type { CanteenKey } from '../utils/canteens';
import type { Ingredient, Meal, MicroNutrients, NutritionInfo } from '../types/index.js';
import { CanteenMenus } from './CanteenMenus';
import { ModalPortal } from './Modal';

type Nutrition = NutritionInfo & Partial<MicroNutrients>;
type Estimate = { name: string; breakdown: string; nutritionPerServing: Nutrition };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const UNITS: Record<keyof NutritionInfo, string> = {
  kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fiber: 'g', sugar: 'g',
};

function formatIngredient(i: Ingredient): string {
  if (i.unit === 'NB' || i.unit === 'Nach Belieben') return `${i.name} (nach Belieben)`;
  return `${i.amount.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${i.unit} ${i.name}`;
}

/**
 * Body of the QuickMeal editor: add or edit a meal eaten without recipe (canteen, restaurant,
 * product …). The AI estimates the nutrition for one portion from a description and/or a plate
 * photo; follow-up corrections refine the estimate. Without `meal` a new QuickMeal is created and
 * passed to `onSaved`. The surrounding modal (header, close button) belongs to the caller.
 */
export function QuickMealForm({ meal, date, canteens, initialDescription, usageCount, onSaved, onCancel, onRemoved, drink }: {
  meal?: Meal;
  /** ☕ Create/edit a drink for the coffee counter (per cup, not entered into a slot). */
  drink?: boolean;
  /** Plan date of the slot (create mode) — the canteen menus are the ones of that day. */
  date?: string;
  /** Create mode: start from these canteens' menus (NAPO, Mensa). */
  canteens?: CanteenKey[];
  /** Create mode: prefilled description (e.g. the search text). */
  initialDescription?: string;
  /** How many plan slots use the meal — only shown in the delete confirmation. */
  usageCount?: number;
  onSaved: (meal: Meal) => void;
  onCancel: () => void;
  /** Edit mode: the meal was deleted or turned back into a recipe. */
  onRemoved?: () => void;
}) {
  const { quickMeals, saveQuickMeal, deleteMeal, setMealQuick } = useMealPlan();
  const readOnly = !!meal && !quickMeals.some(m => m.id === meal.id); // shared by someone else

  const [description, setDescription] = useState(meal?.comment ?? initialDescription ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(
    meal?.nutritionPerServing
      ? { name: meal.name, breakdown: meal.recipeText ?? '', nutritionPerServing: meal.nutritionPerServing }
      : null,
  );
  const [corrections, setCorrections] = useState<string[]>([]);
  const [correction, setCorrection] = useState('');
  const [loading, setLoading] = useState<null | 'estimate' | 'refine'>(null);
  const [saving, setSaving] = useState<null | 'save' | 'delete' | 'recipe'>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const shownPhoto = photoPreview ?? (!removePhoto && meal?.photoUrl ? `${api.url}${meal.photoUrl}` : null);

  // Products moved over from the recipes keep their ingredients — they still go on the shopping list.
  const shoppingIngredients = meal ? (meal.shoppingIngredients?.length ? meal.shoppingIngredients : meal.ingredients) : [];

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await compressImage(file, 1600, 0.85));
      setRemovePhoto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Foto konnte nicht geladen werden');
    }
  };

  const runEstimate = async (nextCorrections: string[], descriptionText = description) => {
    setLoading(nextCorrections.length > corrections.length ? 'refine' : 'estimate');
    setError(null);
    try {
      // Conversation: description, then per correction the estimate it refers to + the correction.
      // The last estimate carries the user's manual edits so a refinement builds on them.
      const messages: ChatMessage[] = [{ role: 'user', content: descriptionText }];
      if (estimate && nextCorrections.length > 0) {
        messages.push({ role: 'assistant', content: JSON.stringify({ name: estimate.name, breakdown: estimate.breakdown, ...estimate.nutritionPerServing }) });
        messages.push({ role: 'user', content: `Korrektur/Ergänzung: ${nextCorrections.join(' · ')}` });
      }
      const form = new FormData();
      form.append('messages', JSON.stringify(messages));
      if (photo) form.append('photo', photo);
      else if (meal?.photoUrl && !removePhoto) form.append('mealId', meal.id);
      const result = await api.upload<Estimate>('/api/estimate-quick-meal', form);
      setEstimate(result);
      setCorrections(nextCorrections);
      setCorrection('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schätzung fehlgeschlagen');
    } finally {
      setLoading(null);
    }
  };

  const setMacro = (key: keyof NutritionInfo, value: string) => {
    if (!estimate) return;
    const num = value === '' ? 0 : Math.max(0, Number(value) || 0);
    setEstimate({ ...estimate, nutritionPerServing: { ...estimate.nutritionPerServing, [key]: num } });
  };

  const handleSave = async () => {
    if (!estimate) return;
    setSaving('save');
    setError(null);
    try {
      const saved = await saveQuickMeal({
        name: estimate.name.trim() || 'Mahlzeit',
        description,
        breakdown: estimate.breakdown,
        nutritionPerServing: estimate.nutritionPerServing,
        removePhoto,
        isDrink: drink || undefined,
      }, photo, meal?.id);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
      setSaving(null);
    }
  };

  const handleDelete = async () => {
    if (!meal) return;
    const where = usageCount
      ? `Es ist ${usageCount}× im Plan eingetragen – diese Einträge verschwinden mit.`
      : 'Falls es im Plan eingetragen ist, verschwinden diese Einträge mit.';
    if (!confirm(`„${meal.name}“ löschen?\n${where}`)) return;
    setSaving('delete');
    setError(null);
    try {
      await deleteMeal(meal.id);
      onRemoved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
      setSaving(null);
    }
  };

  const handleMakeRecipe = async () => {
    if (!meal) return;
    setSaving('recipe');
    setError(null);
    try {
      await setMealQuick(meal.id, false);
      onRemoved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Umwandeln fehlgeschlagen');
      setSaving(null);
    }
  };

  const canEstimate = !loading && (description.trim().length > 0 || !!shownPhoto);

  return (
    <>
      {!meal && !drink && date && canteens && canteens.length > 0 && (
        <CanteenMenus canteens={canteens} date={date}
          onApply={(canteenEstimate, text) => {
            setDescription(text);
            setEstimate(canteenEstimate);
            setCorrections([]);
            setError(null);
          }} />
      )}

      <div className="quick-meal-input">
        <div className="quick-meal-photo">
          {shownPhoto ? (
            <img src={shownPhoto} alt="Foto der Mahlzeit" />
          ) : readOnly ? (
            <div className="quick-meal-photo-empty">📷</div>
          ) : (
            // The empty placeholder is the upload button itself.
            <button type="button" className="quick-meal-photo-empty quick-meal-photo-add"
              onClick={() => fileRef.current?.click()} title="Foto hinzufügen" aria-label="Foto hinzufügen">
              <span className="quick-meal-photo-add-icon" aria-hidden>
                📷<span className="quick-meal-photo-add-plus">+</span>
              </span>
              <span className="quick-meal-photo-add-label">Foto</span>
            </button>
          )}
          {!readOnly && shownPhoto && (
            <div className="quick-meal-photo-actions">
              <button type="button" className="btn btn-muted btn-sm" onClick={() => fileRef.current?.click()}>
                Ändern
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setPhoto(null); setRemovePhoto(true); }}>
                Entfernen
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { handlePhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <textarea
          className="input quick-meal-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={drink
            ? 'Welches Getränk?\nz.B. „Cappuccino mit laktosefreier Vollmilch, normale Tasse"'
            : 'Was hast du gegessen?\nz.B. „Schnitzel mit Pommes und kleinem Salat, normale Kantinenportion"'}
          rows={4}
          disabled={readOnly}
        />
      </div>

      {!readOnly && (
        <button className="btn btn-primary" onClick={() => runEstimate([])} disabled={!canEstimate} style={{ width: '100%' }}>
          {loading === 'estimate' ? 'Schätze…' : estimate ? 'Neu schätzen' : 'Nährwerte schätzen'}
        </button>
      )}

      {estimate && (
        <div className="quick-meal-result">
          <label className="quick-meal-label">Name</label>
          <input className="input" value={estimate.name} disabled={readOnly}
            onChange={e => setEstimate({ ...estimate, name: e.target.value })} />

          {estimate.breakdown && (
            <div className="quick-meal-breakdown">{estimate.breakdown}</div>
          )}

          <div className="quick-meal-macros">
            {NUTRITION_KEYS.map(key => (
              <label key={key} className="quick-meal-macro">
                <span>{NUTRITION_LABELS[key]}</span>
                <span className="quick-meal-macro-input">
                  <input className="input" type="number" min="0" inputMode="numeric" disabled={readOnly}
                    value={estimate.nutritionPerServing[key] ?? 0}
                    onChange={e => setMacro(key, e.target.value)} />
                  <small>{UNITS[key]}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="quick-meal-hint">{drink ? 'Pro Tasse' : 'Pro Person'} · Vitamine & Mineralstoffe werden im Hintergrund mitgeschätzt.</div>

          {!readOnly && (
            <>
              {corrections.length > 0 && (
                <ul className="quick-meal-corrections">
                  {corrections.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
              <div className="quick-meal-refine">
                <input
                  className="input"
                  value={correction}
                  onChange={e => setCorrection(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && correction.trim() && !loading) runEstimate([...corrections, correction.trim()]); }}
                  placeholder={drink ? 'Korrektur, z.B. „große Tasse, 300 ml“' : 'Korrektur, z.B. „Pommes war nur eine halbe Portion“'}
                />
                <button className="btn btn-muted" disabled={!correction.trim() || !!loading}
                  onClick={() => runEstimate([...corrections, correction.trim()])}>
                  {loading === 'refine' ? 'Passe an…' : 'Anpassen'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {shoppingIngredients.length > 0 && (
        <div className="quick-meal-hint">
          🛒 Auf der Einkaufsliste: {shoppingIngredients.map(formatIngredient).join(', ')}
        </div>
      )}

      {error && <div className="quick-meal-error">{error}</div>}

      {!readOnly && (estimate || meal) && (
        <div className="quick-meal-footer">
          {meal && (
            <div className="quick-meal-footer-secondary">
              <button className="btn-ghost btn-sm quick-meal-delete" onClick={handleDelete} disabled={!!saving}>
                {saving === 'delete' ? 'Lösche…' : 'Löschen'}
              </button>
              {meal.ingredients.length > 0 && !drink && (
                <button className="btn-ghost btn-sm" onClick={handleMakeRecipe} disabled={!!saving}
                  title="Wieder in der Rezeptliste führen (z.B. weil es doch gekocht wird)">
                  {saving === 'recipe' ? '…' : '→ Rezept'}
                </button>
              )}
            </div>
          )}
          <button className="btn btn-muted" onClick={onCancel}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={!estimate || !!saving || !!loading || !(estimate.nutritionPerServing.kcal > 0)}>
            {saving === 'save' ? 'Speichere…' : meal || drink ? 'Speichern' : 'Speichern & eintragen'}
          </button>
        </div>
      )}
    </>
  );
}

/** Edit an existing QuickMeal on its own (e.g. opened from a plan entry). */
export function QuickMealDialog({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const { quickMeals, toggleMealStar } = useMealPlan();
  const current = quickMeals.find(m => m.id === meal.id);

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content quick-meal-dialog" onClick={e => e.stopPropagation()}>
          <div className="quick-meal-header">
            <h3>{meal.name}</h3>
            <div className="quick-meal-header-actions">
              {current && (
                <button className={`btn-ghost quick-meal-star ${current.starred ? 'is-starred' : ''}`}
                  onClick={() => toggleMealStar(current.id)}
                  aria-pressed={!!current.starred}
                  title={current.starred ? 'Aus den Favoriten entfernen' : 'Zu den QuickMeal-Favoriten'}>
                  {current.starred ? '★' : '☆'}
                </button>
              )}
              <button className="btn-ghost" onClick={onClose} style={{ fontSize: '16px' }} aria-label="Schließen">{'✗'}</button>
            </div>
          </div>
          <QuickMealForm meal={meal} onSaved={onClose} onCancel={onClose} onRemoved={onClose} />
        </div>
      </div>
    </ModalPortal>
  );
}
