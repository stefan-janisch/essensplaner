import React, { useState, useMemo, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeCard, RecipeDetailModal, EditRecipeModal, CreateRecipeModal } from './RecipeManagement';
import { getCategoryLabel } from '../constants/categories';
import { TAG_GROUPS } from '../constants/tags';
import { filterMeals, sortMeals, buildTagValuesByGroup } from '../utils/mealFilters';
import type { SortBy, RatingComparator } from '../utils/mealFilters';
import type { Meal, MealType, MealPlanEntry } from '../types/index.js';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * For each meal, compute how many of its shopping ingredients are NOT
 * already covered by the current plan's shopping list.
 * Returns a Map<mealId, { extra: number, total: number, extraNames: string[] }>.
 */
function computeAdditionalIngredients(
  meals: Meal[],
  planEntries: MealPlanEntry[],
  allMeals: Meal[],
): Map<string, { extra: number; total: number; extraNames: string[] }> {
  // Build set of normalized ingredient names already in the plan
  const planIngredientNames = new Set<string>();
  for (const entry of planEntries) {
    if (!entry.enabled || !entry.mealId) continue;
    const meal = allMeals.find(m => m.id === entry.mealId);
    if (!meal) continue;
    const ings = meal.shoppingIngredients?.length ? meal.shoppingIngredients : meal.ingredients;
    for (const ing of ings) {
      planIngredientNames.add(ing.name.toLowerCase().trim());
    }
  }

  const result = new Map<string, { extra: number; total: number; extraNames: string[] }>();
  for (const meal of meals) {
    const ings = meal.shoppingIngredients?.length ? meal.shoppingIngredients : meal.ingredients;
    // Filter out "nach Belieben" ingredients
    const meaningful = ings.filter(i => i.unit !== 'NB' && i.unit !== 'Nach Belieben');
    const extraNames: string[] = [];
    for (const ing of meaningful) {
      if (!planIngredientNames.has(ing.name.toLowerCase().trim())) {
        extraNames.push(ing.name);
      }
    }
    result.set(meal.id, { extra: extraNames.length, total: meaningful.length, extraNames });
  }
  return result;
}

function DraggableRecipeCard({ meal, onEdit, onSetRating, hideNutrition }: { meal: Meal; onEdit: () => void; onSetRating: (r: number) => void; hideNutrition?: boolean }) {
  const { toggleMealStar, deleteMeal } = useMealPlan();
  const [showRecipe, setShowRecipe] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: meal.id,
    data: { meal },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const handleDelete = () => {
    if (confirm(`Rezept "${meal.name}" wirklich löschen?`)) {
      deleteMeal(meal.id);
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <RecipeCard
        meal={meal}
        compact
        onView={() => setShowRecipe(true)}
        onEdit={onEdit}
        onDelete={handleDelete}
        onToggleStar={() => toggleMealStar(meal.id)}
        onSetRating={onSetRating}
        dragHandleProps={{ ...listeners, ...attributes }}
        hideNutrition={hideNutrition}
      />
      {showRecipe && (
        <RecipeDetailModal
          meal={meal}
          onClose={() => setShowRecipe(false)}
          onEdit={() => { setShowRecipe(false); onEdit(); }}
          onToggleStar={() => toggleMealStar(meal.id)}
          onSetRating={onSetRating}
        />
      )}
    </div>
  );
}

interface MealHistoryProps {
  tapMode?: { date: string; mealType: MealType } | null;
  onTapSelect?: (mealId: string) => void;
  onCancelTap?: () => void;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snacks: 'Snacks',
  drinks: 'Getränke',
  misc: 'Sonstiges',
};

export const MealHistory: React.FC<MealHistoryProps> = ({ tapMode, onTapSelect, onCancelTap }) => {
  const { state, activePlan, updateMeal, toggleMealStar, deleteMeal } = useMealPlan();
  const [searchQuery, setSearchQuery] = useState('');
  const [starFilter, setStarFilter] = useState<'all' | 'starred'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [maxPrepTime, setMaxPrepTime] = useState<number | ''>('');
  const [maxTotalTime, setMaxTotalTime] = useState<number | ''>('');
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');
  const [ratingComparator, setRatingComparator] = useState<RatingComparator>('gte');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [minProtein, setMinProtein] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showNutritionIndicators, setShowNutritionIndicators] = useState(true);
  const [smartMode, setSmartMode] = useState(false);
  const [randomIds, setRandomIds] = useState<string[] | null>(null);

  const activeFilterCount = (categoryFilter ? 1 : 0) + tagFilter.length
    + (maxPrepTime ? 1 : 0) + (maxTotalTime ? 1 : 0) + (sortBy !== 'name' ? 1 : 0)
    + (starFilter !== 'all' ? 1 : 0) + (ratingFilter !== '' ? 1 : 0) + (minProtein !== '' ? 1 : 0);

  const categories = useMemo(() =>
    [...new Set(state.meals.map(m => m.category).filter(Boolean))] as string[],
    [state.meals]
  );

  const tagValuesByGroup = useMemo(() => buildTagValuesByGroup(state.meals), [state.meals]);

  const filteredMeals = useMemo(() =>
    filterMeals(state.meals, { starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime, searchQuery, ratingFilter, ratingComparator, minProtein }),
    [state.meals, starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime, searchQuery, ratingFilter, ratingComparator]
  );

  const sortedMeals = useMemo(() =>
    sortMeals(filteredMeals, sortBy, { pinStarred: true }),
    [filteredMeals, sortBy]
  );

  // "Passt zum Plan" — compute additional ingredients for each meal
  const planEntries = activePlan?.entries || [];
  const planMealIds = useMemo(() => new Set(planEntries.filter(e => e.enabled).map(e => e.mealId)), [planEntries]);

  const additionalIngredientsMap = useMemo(() => {
    if (!smartMode || planEntries.length === 0) return null;
    // Exclude meals already in the plan
    const candidates = filteredMeals.filter(m => !planMealIds.has(m.id));
    return computeAdditionalIngredients(candidates, planEntries, state.meals);
  }, [smartMode, filteredMeals, planEntries, planMealIds, state.meals]);

  const displayMeals = useMemo(() => {
    if (randomIds) {
      // Show only the randomly picked meals, in their random order
      return randomIds.map(id => state.meals.find(m => m.id === id)).filter(Boolean) as Meal[];
    }
    if (!smartMode || !additionalIngredientsMap) return sortedMeals;
    return filteredMeals
      .filter(m => !planMealIds.has(m.id) && additionalIngredientsMap.has(m.id))
      .sort((a, b) => {
        const aExtra = additionalIngredientsMap.get(a.id)!.extra;
        const bExtra = additionalIngredientsMap.get(b.id)!.extra;
        if (aExtra !== bExtra) return aExtra - bExtra;
        return a.name.localeCompare(b.name);
      });
  }, [randomIds, smartMode, sortedMeals, filteredMeals, planMealIds, additionalIngredientsMap, state.meals]);

  const pickRandom = useCallback(() => {
    const pool = filteredMeals.length > 3 ? filteredMeals : state.meals;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setRandomIds(shuffled.slice(0, 3).map(m => m.id));
    setSmartMode(false);
  }, [filteredMeals, state.meals]);

  const handleSetRating = async (mealId: string, rating: number) => {
    const meal = state.meals.find(m => m.id === mealId);
    if (!meal) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, ...mealWithoutId } = meal;
    await updateMeal(mealId, { ...mealWithoutId, rating: rating || undefined });
  };

  const resetFilters = () => {
    setCategoryFilter('');
    setTagFilter([]);
    setMaxPrepTime('');
    setMaxTotalTime('');
    setRatingFilter('');
    setRatingComparator('gte');
    setSortBy('name');
    setStarFilter('all');
    setMinProtein('');
  };

  return (
    <div className="panel" style={{ height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {tapMode && (
        <div className="tap-mode-banner">
          <span>
            Rezept wählen für <strong>{MEAL_TYPE_LABELS[tapMode.mealType] || tapMode.mealType}</strong>
            {!tapMode.date.startsWith('course_') && (
              <>, {format(parseISO(tapMode.date), 'EEEE dd.MM.', { locale: de })}</>
            )}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onCancelTap}>Abbrechen</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-h)' }}>Rezepte ({displayMeals.length})</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Neu</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {planEntries.length > 0 && (
          <button
            className={`pill ${smartMode ? 'pill-active' : ''}`}
            onClick={() => { setSmartMode(!smartMode); setRandomIds(null); }}
            style={{ fontSize: '12px', padding: '3px 10px', flex: 1 }}
          >
            🧩 Passt zum Plan
          </button>
        )}
        <button
          className={`pill ${randomIds ? 'pill-active' : ''}`}
          onClick={() => { if (randomIds) { setRandomIds(null); } else { pickRandom(); } }}
          style={{ fontSize: '12px', padding: '3px 10px', flex: 1 }}
        >
          🎲 Zufällig
        </button>
      </div>

      <input
        className="input"
        type="text"
        placeholder="Rezept suchen..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ width: '100%', marginBottom: '8px' }}
      />

      {/* Scrollable area: filters + recipe cards */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {/* Collapsible filters */}
      <div style={{ marginBottom: '10px' }}>
        <button
          className="btn-ghost"
          onClick={() => setShowFilters(!showFilters)}
          style={{ fontSize: '12px', padding: '2px 6px', color: 'var(--accent)', width: '100%', textAlign: 'left' }}
        >
          {showFilters ? '▾' : '▸'} Filter{activeFilterCount > 0 ? ` (${activeFilterCount} aktiv)` : ''}
        </button>

        {showFilters && (
          <div style={{ marginTop: '6px', padding: '8px', background: 'var(--surface-0)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <button className={`pill ${starFilter === 'all' ? 'pill-active' : ''}`} onClick={() => setStarFilter('all')} style={{ fontSize: '12px', padding: '2px 8px' }}>
                Alle
              </button>
              <button className={`pill ${starFilter === 'starred' ? 'pill-active' : ''}`} onClick={() => setStarFilter('starred')} style={{ fontSize: '12px', padding: '2px 8px' }}>
                ⭐ Favoriten
              </button>
              <button className={`pill ${showNutritionIndicators ? 'pill-active' : ''}`} onClick={() => setShowNutritionIndicators(!showNutritionIndicators)} style={{ fontSize: '12px', padding: '2px 8px' }} title="Nährwert-Ampel">
                🚦
              </button>
            </div>

            {categories.length > 0 && (
              <select
                className="input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ width: '100%', marginBottom: '6px', fontSize: '12px', padding: '4px 8px' }}
              >
                <option value="">Alle Kategorien</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{getCategoryLabel(cat) || cat}</option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <select className="input" value={maxPrepTime} onChange={(e) => setMaxPrepTime(e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}>
                <option value="">Aktive Zeit</option>
                <option value="15">≤ 15 Min.</option>
                <option value="30">≤ 30 Min.</option>
                <option value="60">≤ 60 Min.</option>
              </select>
              <select className="input" value={maxTotalTime} onChange={(e) => setMaxTotalTime(e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}>
                <option value="">Gesamtzeit</option>
                <option value="30">≤ 30 Min.</option>
                <option value="60">≤ 60 Min.</option>
                <option value="90">≤ 90 Min.</option>
              </select>
              <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}>
                <option value="name">A-Z</option>
                <option value="rating">Bewertung</option>
                <option value="newest">Neueste</option>
                <option value="kcal">Kalorien ↑</option>
                <option value="protein">Protein ↓</option>
                <option value="fiber">Ballaststoffe ↓</option>
                <option value="sugar">Zug. Zucker ↑</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text)', flexShrink: 0 }}>Bewertung:</span>
              <select className="input" value={ratingComparator} onChange={(e) => setRatingComparator(e.target.value as RatingComparator)} style={{ width: '50px', fontSize: '11px', padding: '4px 4px' }}>
                <option value="gte">≥</option>
                <option value="eq">=</option>
                <option value="lte">≤</option>
              </select>
              <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                <span
                  onClick={() => setRatingFilter(ratingFilter === 0 ? '' : 0)}
                  style={{ cursor: 'pointer', fontSize: '12px', opacity: ratingFilter === 0 ? 1 : 0.3, padding: '0 2px' }}
                  title="Ohne Bewertung"
                >
                  ∅
                </span>
                {[1, 2, 3, 4, 5].map(s => (
                  <span
                    key={s}
                    onClick={() => setRatingFilter(ratingFilter === s ? '' : s)}
                    style={{ cursor: 'pointer', fontSize: '16px', opacity: ratingFilter !== '' && s <= ratingFilter ? 1 : 0.3 }}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text)', flexShrink: 0, marginLeft: '6px' }}>P≥</span>
              <input className="input" type="number" min="0" placeholder="g" value={minProtein}
                onChange={e => setMinProtein(e.target.value ? Math.max(0, parseInt(e.target.value)) : '')}
                style={{ width: '40px', fontSize: '11px', padding: '4px 4px' }} />
            </div>

            {TAG_GROUPS.map(group => {
              const values = tagValuesByGroup[group.key];
              if (!values || values.size === 0) return null;
              return (
                <div key={group.key} style={{ marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 500 }}>{group.label}:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px' }}>
                    {[...values].sort().map(value => {
                      const tag = `${group.key}:${value}`;
                      return (
                        <button
                          key={tag}
                          className={`pill ${tagFilter.includes(tag) ? 'pill-active' : ''}`}
                          onClick={() => setTagFilter(prev =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                          )}
                          style={{ fontSize: '11px', padding: '1px 7px' }}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {activeFilterCount > 0 && (
              <button
                className="btn-ghost"
                onClick={resetFilters}
                style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recipe cards */}
      <div>
        {displayMeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px' }}>
            {randomIds ? 'Keine Rezepte vorhanden' : smartMode ? 'Keine passenden Rezepte gefunden' : searchQuery.trim() || activeFilterCount > 0 ? 'Keine Treffer' : 'Keine Rezepte vorhanden'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayMeals.map(meal => {
              const info = additionalIngredientsMap?.get(meal.id);
              return (
                <div key={meal.id}>
                  {smartMode && info && (
                    <div
                      style={{ fontSize: '11px', marginBottom: '3px', padding: '2px 8px', color: info.extra === 0 ? 'var(--color-success)' : 'var(--text-muted)' }}
                      title={info.extra > 0 ? `Zusätzlich: ${info.extraNames.join(', ')}` : 'Alle Zutaten bereits auf der Einkaufsliste'}
                    >
                      {info.extra === 0
                        ? '✓ Alle Zutaten vorhanden'
                        : `+${info.extra} ${info.extra === 1 ? 'Zutat' : 'Zutaten'} · ${info.extraNames.slice(0, 3).join(', ')}${info.extraNames.length > 3 ? ` …` : ''}`}
                    </div>
                  )}
                  {tapMode && onTapSelect ? (
                    <div onClick={() => onTapSelect(meal.id)} style={{ cursor: 'pointer' }}>
                      <RecipeCard
                        meal={meal}
                        compact
                        onEdit={() => setEditingMeal(meal)}
                        onDelete={() => { if (confirm(`Rezept "${meal.name}" wirklich löschen?`)) deleteMeal(meal.id); }}
                        onToggleStar={() => toggleMealStar(meal.id)}
                        onSetRating={(r) => handleSetRating(meal.id, r)}
                        hideNutrition={!showNutritionIndicators}
                      />
                    </div>
                  ) : (
                    <DraggableRecipeCard
                      meal={meal}
                      onEdit={() => setEditingMeal(meal)}
                      onSetRating={(r) => handleSetRating(meal.id, r)}
                      hideNutrition={!showNutritionIndicators}
                    />
                  )}
                </div>
              );
            })}
            {randomIds && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={pickRandom}
                style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
              >
                🎲 Nochmal würfeln
              </button>
            )}
          </div>
        )}
      </div>
      </div>{/* end scrollable area */}

      {editingMeal && (
        <EditRecipeModal meal={editingMeal} onClose={() => setEditingMeal(null)} />
      )}
      {showCreate && (
        <CreateRecipeModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
};
