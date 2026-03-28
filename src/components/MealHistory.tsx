import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeCard, RecipeDetailModal, EditRecipeModal } from './RecipeManagement';
import { getCategoryLabel } from '../constants/categories';
import { TAG_GROUPS, parseTag } from '../constants/tags';
import type { Meal } from '../types/index.js';

type SortBy = 'name' | 'rating' | 'newest';

function DraggableRecipeCard({ meal, onEdit, onSetRating }: { meal: Meal; onEdit: () => void; onSetRating: (r: number) => void }) {
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
      />
      {showRecipe && (
        <RecipeDetailModal meal={meal} onClose={() => setShowRecipe(false)} />
      )}
    </div>
  );
}

export const MealHistory: React.FC = () => {
  const { state, updateMeal } = useMealPlan();
  const [searchQuery, setSearchQuery] = useState('');
  const [starFilter, setStarFilter] = useState<'all' | 'starred'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [maxPrepTime, setMaxPrepTime] = useState<number | ''>('');
  const [maxTotalTime, setMaxTotalTime] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [showFilters, setShowFilters] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);

  const activeFilterCount = (categoryFilter ? 1 : 0) + tagFilter.length
    + (maxPrepTime ? 1 : 0) + (maxTotalTime ? 1 : 0) + (sortBy !== 'name' ? 1 : 0)
    + (starFilter !== 'all' ? 1 : 0);

  const categories = useMemo(() =>
    [...new Set(state.meals.map(m => m.category).filter(Boolean))] as string[],
    [state.meals]
  );

  const tagValuesByGroup = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    state.meals.forEach(m => m.tags?.forEach(t => {
      const p = parseTag(t);
      if (p) {
        if (!map[p.key]) map[p.key] = new Set();
        map[p.key].add(p.value);
      }
    }));
    return map;
  }, [state.meals]);

  const filteredMeals = useMemo(() => {
    return state.meals.filter(meal => {
      if (starFilter === 'starred' && !meal.starred) return false;
      if (categoryFilter && meal.category !== categoryFilter) return false;
      if (tagFilter.length > 0) {
        const filtersByGroup: Record<string, string[]> = {};
        tagFilter.forEach(t => {
          const p = parseTag(t);
          if (p) {
            if (!filtersByGroup[p.key]) filtersByGroup[p.key] = [];
            filtersByGroup[p.key].push(t);
          }
        });
        for (const groupTags of Object.values(filtersByGroup)) {
          if (!groupTags.some(t => meal.tags?.includes(t))) return false;
        }
      }
      if (maxPrepTime && (!meal.prepTime || meal.prepTime > maxPrepTime)) return false;
      if (maxTotalTime && (!meal.totalTime || meal.totalTime > maxTotalTime)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return meal.name.toLowerCase().includes(q) ||
          meal.ingredients.some(ing => ing.name.toLowerCase().includes(q));
      }
      return true;
    });
  }, [state.meals, starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime, searchQuery]);

  const sortedMeals = useMemo(() => {
    return [...filteredMeals].sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      switch (sortBy) {
        case 'rating': return (b.rating || 0) - (a.rating || 0);
        case 'newest': return (b.id > a.id ? 1 : -1);
        default: return a.name.localeCompare(b.name);
      }
    });
  }, [filteredMeals, sortBy]);

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
    setSortBy('name');
    setStarFilter('all');
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ marginTop: 0, color: 'var(--text-h)' }}>Rezepte ({filteredMeals.length})</h3>

      <input
        className="input"
        type="text"
        placeholder="Rezept suchen..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ width: '100%', marginBottom: '8px' }}
      />

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
              </select>
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
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sortedMeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px' }}>
            {searchQuery.trim() || activeFilterCount > 0 ? 'Keine Treffer' : 'Keine Rezepte vorhanden'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedMeals.map(meal => (
              <DraggableRecipeCard
                key={meal.id}
                meal={meal}
                onEdit={() => setEditingMeal(meal)}
                onSetRating={(r) => handleSetRating(meal.id, r)}
              />
            ))}
          </div>
        )}
      </div>

      {editingMeal && (
        <EditRecipeModal meal={editingMeal} onClose={() => setEditingMeal(null)} />
      )}
    </div>
  );
};
