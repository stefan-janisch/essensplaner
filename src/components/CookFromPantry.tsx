import React, { useState, useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import {
  RecipeCard,
  RecipeDetailModal,
  EditRecipeModal,
  SlotPickerModal,
} from './RecipeManagement';
import { IngredientChipInput } from './IngredientChipInput';
import { filterMeals, sortMeals, buildTagValuesByGroup } from '../utils/mealFilters';
import type { SortBy, RatingComparator } from '../utils/mealFilters';
import { computeMissingIngredients } from '../utils/ingredientMatch';
import { normalizeIngredientName } from '../utils/ingredientMatch';
import { INGREDIENT_GROUP_LABELS } from '../constants/ingredientGroups';
import { RECIPE_CATEGORIES } from '../constants/categories';
import { TAG_GROUPS } from '../constants/tags';
import type { Meal } from '../types/index.js';

// Sort options of the recipe view, plus a pantry-specific "match" default.
type CookSortBy = SortBy | 'match';

export const CookFromPantry: React.FC = () => {
  const {
    state,
    pantryStaples,
    setPantryStaples,
    freshIngredients,
    setFreshIngredients,
    toggleMealStar,
    deleteMeal,
    updateMeal,
    duplicateMeal,
  } = useMealPlan();

  const [searchQuery, setSearchQuery] = useState('');
  const [onlyCookable, setOnlyCookable] = useState(false);
  const [showNutritionIndicators, setShowNutritionIndicators] = useState(true);
  // Full recipe-view filter/sort state
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [starFilter, setStarFilter] = useState<'all' | 'starred'>('all');
  const [sortBy, setSortBy] = useState<CookSortBy>('match');
  const [maxPrepTime, setMaxPrepTime] = useState<number | ''>('');
  const [maxTotalTime, setMaxTotalTime] = useState<number | ''>('');
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');
  const [ratingComparator, setRatingComparator] = useState<RatingComparator>('gte');
  const [minProtein, setMinProtein] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewingMeal, setViewingMeal] = useState<Meal | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [addToPlanMeal, setAddToPlanMeal] = useState<Meal | null>(null);

  const activeFilterCount = (categoryFilter ? 1 : 0) + tagFilter.length
    + (maxPrepTime ? 1 : 0) + (maxTotalTime ? 1 : 0) + (sortBy !== 'match' ? 1 : 0)
    + (starFilter !== 'all' ? 1 : 0) + (ratingFilter !== '' ? 1 : 0) + (minProtein !== '' ? 1 : 0);

  const tagValuesByGroup = useMemo(() => buildTagValuesByGroup(state.meals), [state.meals]);

  // Autocomplete vocabulary: all ingredient names across the user's recipes,
  // de-duplicated by normalized form (keeping the first-seen display casing).
  const suggestions = useMemo(() => {
    const byNorm = new Map<string, string>();
    for (const meal of state.meals) {
      const ings = meal.shoppingIngredients?.length ? meal.shoppingIngredients : meal.ingredients;
      for (const ing of ings) {
        if (ing.unit === 'NB' || ing.unit === 'Nach Belieben') continue;
        const norm = normalizeIngredientName(ing.name);
        if (norm && !byNorm.has(norm)) byNorm.set(norm, ing.name.trim());
      }
    }
    const names = [...byNorm.values()].sort((a, b) => a.localeCompare(b));
    // Surface umbrella terms ("Gewürze", "Öle", ...) at the top for discovery.
    return [...INGREDIENT_GROUP_LABELS, ...names];
  }, [state.meals]);

  const haveNames = useMemo(
    () => [...pantryStaples, ...freshIngredients],
    [pantryStaples, freshIngredients],
  );
  const hasIngredients = haveNames.length > 0;

  const filteredMeals = useMemo(
    () => filterMeals(state.meals, {
      starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime,
      searchQuery, ratingFilter, ratingComparator, minProtein,
    }),
    [state.meals, starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime, searchQuery, ratingFilter, ratingComparator, minProtein],
  );

  const missingMap = useMemo(
    () => (hasIngredients ? computeMissingIngredients(filteredMeals, haveNames) : null),
    [hasIngredients, filteredMeals, haveNames],
  );

  const displayMeals = useMemo(() => {
    let meals = filteredMeals;
    if (onlyCookable && missingMap) {
      meals = meals.filter(m => (missingMap.get(m.id)?.missingCount ?? Infinity) === 0);
    }
    // "Passende zuerst": sort by fewest missing ingredients (then name).
    if (sortBy === 'match' && missingMap) {
      return [...meals].sort((a, b) => {
        const am = missingMap.get(a.id)?.missingCount ?? Infinity;
        const bm = missingMap.get(b.id)?.missingCount ?? Infinity;
        if (am !== bm) return am - bm;
        return a.name.localeCompare(b.name);
      });
    }
    // Otherwise sort exactly like the recipe view (fall back to name if "match" but no pantry).
    return sortMeals(meals, sortBy === 'match' ? 'name' : sortBy);
  }, [filteredMeals, missingMap, onlyCookable, sortBy]);

  const cookableCount = useMemo(() => {
    if (!missingMap) return 0;
    let n = 0;
    for (const info of missingMap.values()) if (info.missingCount === 0) n++;
    return n;
  }, [missingMap]);

  const handleSetRating = async (mealId: string, rating: number) => {
    const meal = state.meals.find(m => m.id === mealId);
    if (!meal) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, ...mealWithoutId } = meal;
    await updateMeal(mealId, { ...mealWithoutId, rating: rating || undefined });
    if (viewingMeal?.id === mealId) {
      setViewingMeal(prev => prev ? { ...prev, rating: rating || undefined } : null);
    }
  };

  const handleDelete = (meal: Meal) => {
    if (confirm(`Rezept "${meal.name}" wirklich löschen?`)) deleteMeal(meal.id);
  };

  const currentViewingMeal = viewingMeal ? state.meals.find(m => m.id === viewingMeal.id) || viewingMeal : null;

  return (
    <div className="recipe-management-container" style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-h)' }}>Was kann ich kochen?</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: '14px' }}>
          Trage ein, was du daheim hast – die Rezepte mit den wenigsten fehlenden Zutaten kommen zuerst.
        </p>
      </div>

      {/* Ingredient input — two columns, wrapping on narrow screens */}
      <div className="panel" style={{ marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <IngredientChipInput
            label="Vorratskammer"
            icon="🥫"
            items={pantryStaples}
            suggestions={suggestions}
            placeholder="z. B. Mehl, Zucker, Gewürze, Öl..."
            onChange={setPantryStaples}
          />
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '-6px 0 0' }}>
            Grundnahrungsmittel, die du immer da hast – bleiben gespeichert. Tipp: Sammelbegriffe
            wie &bdquo;Gewürze&ldquo; oder &bdquo;Öle&ldquo; decken alle passenden Zutaten ab.
          </div>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <IngredientChipInput
            label="Frische Zutaten"
            icon="🥬"
            items={freshIngredients}
            suggestions={suggestions}
            placeholder="z. B. Tomaten, Hähnchen, Spinat..."
            onChange={setFreshIngredients}
          />
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '-6px 0 0' }}>
            Was du gerade frisch im Haus hast – einfach per &bdquo;Leeren&ldquo; zurücksetzen und neu eingeben.
          </div>
        </div>
      </div>

      {/* Search + filters (mirrors the recipe view) */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <input
          className="input"
          type="text"
          placeholder="Rezept suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as CookSortBy)}
          >
            <option value="match">Passende zuerst</option>
            <option value="name">Name A-Z</option>
            <option value="rating">Bewertung</option>
            <option value="newest">Neueste</option>
            <option value="kcal">Kalorien ↑</option>
            <option value="protein">Protein ↓</option>
            <option value="fiber">Ballaststoffe ↓</option>
            <option value="sugar">Zug. Zucker ↑</option>
          </select>
          <button
            className="btn-ghost"
            onClick={() => setShowFilters(!showFilters)}
            style={{ fontSize: '13px', padding: '4px 8px', color: 'var(--accent)' }}
          >
            {showFilters ? '▾' : '▸'} Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {hasIngredients && (
            <button
              className={`pill ${onlyCookable ? 'pill-active' : ''}`}
              onClick={() => setOnlyCookable(v => !v)}
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              ✓ Nur komplett kochbare ({cookableCount})
            </button>
          )}
          <button
            className={`pill ${showNutritionIndicators ? 'pill-active' : ''}`}
            onClick={() => setShowNutritionIndicators(!showNutritionIndicators)}
            title="Nährwert-Ampel ein/ausblenden"
            style={{ marginLeft: 'auto' }}
          >
            🚦
          </button>
        </div>

        {showFilters && (
        <div style={{ marginTop: '8px', padding: '10px', background: 'var(--surface-0)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
            <select className="input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {RECIPE_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select className="input" value={maxPrepTime} onChange={(e) => setMaxPrepTime(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Aktive Zeit</option>
              <option value="15">⏱ ≤ 15 Min.</option>
              <option value="30">⏱ ≤ 30 Min.</option>
              <option value="60">⏱ ≤ 60 Min.</option>
            </select>
            <select className="input" value={maxTotalTime} onChange={(e) => setMaxTotalTime(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Gesamtzeit</option>
              <option value="30">⏱ ≤ 30 Min.</option>
              <option value="60">⏱ ≤ 60 Min.</option>
              <option value="90">⏱ ≤ 90 Min.</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button className={`pill ${starFilter === 'all' ? 'pill-active' : ''}`} onClick={() => setStarFilter('all')}>Alle</button>
            <button className={`pill ${starFilter === 'starred' ? 'pill-active' : ''}`} onClick={() => setStarFilter('starred')}>⭐ Favoriten</button>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', flexShrink: 0 }}>Bewertung:</span>
            <select className="input" value={ratingComparator} onChange={(e) => setRatingComparator(e.target.value as RatingComparator)} style={{ width: '55px', fontSize: '12px', padding: '4px 4px' }}>
              <option value="gte">≥</option>
              <option value="eq">=</option>
              <option value="lte">≤</option>
            </select>
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <span onClick={() => setRatingFilter(ratingFilter === 0 ? '' : 0)}
                style={{ cursor: 'pointer', fontSize: '14px', opacity: ratingFilter === 0 ? 1 : 0.3, padding: '0 2px' }} title="Ohne Bewertung">∅</span>
              {[1, 2, 3, 4, 5].map(s => (
                <span key={s} onClick={() => setRatingFilter(ratingFilter === s ? '' : s)}
                  style={{ cursor: 'pointer', fontSize: '18px', opacity: ratingFilter !== '' && s <= ratingFilter ? 1 : 0.3 }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text)', flexShrink: 0, marginLeft: '12px' }}>P≥</span>
            <input className="input" type="number" min="0" placeholder="g" value={minProtein}
              onChange={e => setMinProtein(e.target.value ? Math.max(0, parseInt(e.target.value)) : '')}
              style={{ width: '50px', fontSize: '12px', padding: '4px 6px' }} />
          </div>

          {TAG_GROUPS.map(group => {
            const values = tagValuesByGroup[group.key];
            if (!values || values.size === 0) return null;
            return (
              <div key={group.key} style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500, minWidth: '80px' }}>{group.label}:</span>
                {[...values].sort().map(value => {
                  const tag = `${group.key}:${value}`;
                  return (
                    <button
                      key={tag}
                      className={`pill ${tagFilter.includes(tag) ? 'pill-active' : ''}`}
                      onClick={() => {
                        setTagFilter(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                      }}
                      style={{ fontSize: '12px', padding: '2px 8px' }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {!hasIngredients && (
        <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px', marginBottom: '12px' }}>
          Füge oben Zutaten hinzu, um passende Rezepte zu finden.
        </div>
      )}

      {/* Recipe grid */}
      {displayMeals.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text)', padding: '40px' }}>
          {onlyCookable ? 'Keine komplett kochbaren Rezepte gefunden' : 'Keine Rezepte gefunden'}
        </div>
      ) : (
        <div className="recipe-grid">
          {displayMeals.map(meal => {
            const info = missingMap?.get(meal.id);
            return (
              <div key={meal.id}>
                {info && (
                  <div
                    style={{ fontSize: '12px', marginBottom: '3px', padding: '2px 4px', color: info.missingCount === 0 ? 'var(--color-success)' : 'var(--text-muted)' }}
                    title={info.missingCount > 0 ? `Fehlt: ${info.missing.join(', ')}` : 'Alle Zutaten vorhanden'}
                  >
                    {info.missingCount === 0
                      ? '✓ Kannst du kochen!'
                      : `+${info.missingCount} ${info.missingCount === 1 ? 'fehlt' : 'fehlen'}: ${info.missing.slice(0, 3).join(', ')}${info.missing.length > 3 ? ' …' : ''}`}
                  </div>
                )}
                <RecipeCard
                  meal={meal}
                  onView={() => setViewingMeal(meal)}
                  onEdit={() => setEditingMeal(meal)}
                  onDelete={() => handleDelete(meal)}
                  onDuplicate={() => duplicateMeal(meal.id)}
                  onToggleStar={() => toggleMealStar(meal.id)}
                  onAddToPlan={() => setAddToPlanMeal(meal)}
                  onSetRating={(r) => handleSetRating(meal.id, r)}
                  hideNutrition={!showNutritionIndicators}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {currentViewingMeal && !editingMeal && (
        <RecipeDetailModal
          meal={currentViewingMeal}
          onClose={() => setViewingMeal(null)}
          onEdit={() => { setEditingMeal(currentViewingMeal); setViewingMeal(null); }}
          onDuplicate={() => duplicateMeal(currentViewingMeal.id)}
          onToggleStar={() => toggleMealStar(currentViewingMeal.id)}
          onSetRating={(r) => handleSetRating(currentViewingMeal.id, r)}
        />
      )}
      {editingMeal && (
        <EditRecipeModal meal={editingMeal} onClose={() => setEditingMeal(null)} />
      )}
      {addToPlanMeal && (
        <SlotPickerModal meal={addToPlanMeal} onClose={() => setAddToPlanMeal(null)} />
      )}
    </div>
  );
};
