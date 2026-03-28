import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeForm } from './RecipeForm';
import { getCategoryLabel } from '../constants/categories';
import { TAG_GROUPS, parseTag } from '../constants/tags';
import { RecipeDetailModal } from './RecipeManagement';
import type { Meal } from '../types/index.js';
import type { RecipeFormData } from './RecipeForm';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface DraggableMealCardProps {
  meal: Meal;
  onEdit: (meal: Meal) => void;
}

const DraggableMealCard: React.FC<DraggableMealCardProps> = ({ meal, onEdit }) => {
  const { toggleMealStar, deleteMeal } = useMealPlan();
  const [showRecipe, setShowRecipe] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: meal.id,
    data: { meal },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Rezept "${meal.name}" wirklich löschen?`)) {
      deleteMeal(meal.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className="card card-draggable"
      style={{
        ...style,
        padding: '12px',
        marginBottom: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
        {meal.photoUrl && (
          <img
            src={`${API_URL}${meal.photoUrl}`}
            alt=""
            onClick={() => setShowRecipe(true)}
            style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
            title="Rezept anzeigen"
          />
        )}
        <div style={{ cursor: isDragging ? 'grabbing' : 'grab', flex: 1 }} {...listeners} {...attributes}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px', color: 'var(--text-h)' }}>{meal.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text)' }}>
            {meal.ingredients.length} Zutaten • {meal.defaultServings} Person{meal.defaultServings !== 1 ? 'en' : ''}
            {meal.category && (
              <span style={{ marginLeft: '6px', color: 'var(--accent)' }}>
                {getCategoryLabel(meal.category)}
              </span>
            )}
          </div>
        </div>
      </div>
      {showRecipe && (
        <RecipeDetailModal meal={meal} onClose={() => setShowRecipe(false)} />
      )}
      <div style={{ display: 'flex', gap: '2px' }}>
        <button
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            toggleMealStar(meal.id);
          }}
          style={{ fontSize: '18px' }}
          title={meal.starred ? 'Favorit entfernen' : 'Als Favorit markieren'}
        >
          {meal.starred ? '⭐' : '☆'}
        </button>
        <button
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(meal);
          }}
          style={{ fontSize: '16px', color: 'var(--accent)' }}
          title="Bearbeiten"
        >
          ✏️
        </button>
        <button
          className="btn-ghost"
          onClick={handleDelete}
          style={{ fontSize: '16px', color: 'var(--color-danger)' }}
          title="Löschen"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

interface EditMealModalProps {
  meal: Meal;
  onClose: () => void;
}

const EditMealModal: React.FC<EditMealModalProps> = ({ meal, onClose }) => {
  const { state, updateMeal, uploadMealPhoto, deleteMealPhoto, downloadMealPhotoFromUrl } = useMealPlan();
  const allUserTags = React.useMemo(() => state.meals.flatMap(m => m.tags || []), [state.meals]);

  const handleSave = async (data: RecipeFormData) => {
    await updateMeal(meal.id, data.meal);
    if (data.deletePhoto) {
      await deleteMealPhoto(meal.id);
    } else if (data.photoFile) {
      await uploadMealPhoto(meal.id, data.photoFile);
    } else if (data.remotePhotoUrl) {
      await downloadMealPhotoFromUrl(meal.id, data.remotePhotoUrl);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal-content"
        style={{ maxWidth: '600px', width: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>Rezept bearbeiten</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="submit" form="edit-meal-form" className="btn-ghost" style={{ fontSize: '20px' }} title="Speichern">💾</button>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>×</button>
          </div>
        </div>
        <div style={{ overflow: 'auto', paddingTop: '16px' }}>
          <RecipeForm
            formId="edit-meal-form"
            initialData={meal}
            allUserTags={allUserTags}
            onSubmit={handleSave}
            onCancel={onClose}
            submitLabel="Speichern"
            showUrlParsing={true}
          />
        </div>
      </div>
    </div>
  );
};

export const MealHistory: React.FC = () => {
  const { state } = useMealPlan();
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = (categoryFilter ? 1 : 0) + tagFilter.length;

  // Collect tag values by group from all meals
  const tagValuesByGroup = React.useMemo(() => {
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

  const hasAnyTags = Object.keys(tagValuesByGroup).length > 0;

  const filteredMeals = state.meals.filter(meal => {
    if (filter === 'starred' && !meal.starred) return false;
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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return meal.name.toLowerCase().includes(q) ||
        meal.ingredients.some(ing => ing.name.toLowerCase().includes(q));
    }
    return true;
  });

  // Sort: starred first, then alphabetically
  const sortedMeals = [...filteredMeals].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  // Collect unique categories
  const categories = [...new Set(state.meals.map(m => m.category).filter(Boolean))] as string[];

  return (
    <div className="panel" style={{ height: '100%' }}>
      <h3 style={{ marginTop: 0, color: 'var(--text-h)' }}>Rezepte</h3>

      <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className={`pill ${filter === 'all' ? 'pill-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Alle ({state.meals.length})
        </button>
        <button
          className={`pill ${filter === 'starred' ? 'pill-active' : ''}`}
          onClick={() => setFilter('starred')}
        >
          ⭐ Favoriten ({state.meals.filter(m => m.starred).length})
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

      {/* Expandable filters */}
      {(categories.length > 0 || hasAnyTags) && (
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
              {categories.length > 0 && (
                <select
                  className="input"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ width: '100%', marginBottom: '8px', fontSize: '12px', padding: '4px 8px' }}
                >
                  <option value="">Alle Kategorien</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{getCategoryLabel(cat) || cat}</option>
                  ))}
                </select>
              )}

              {TAG_GROUPS.map(group => {
                const values = tagValuesByGroup[group.key];
                if (!values || values.size === 0) return null;
                return (
                  <div key={group.key} style={{ marginBottom: '6px' }}>
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
                            style={{ fontSize: '12px', padding: '2px 8px' }}
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
                  onClick={() => { setCategoryFilter(''); setTagFilter([]); }}
                  style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
        {sortedMeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px' }}>
            {searchQuery.trim() ? 'Keine Treffer' : filter === 'starred' ? 'Keine Favoriten vorhanden' : 'Keine Rezepte vorhanden'}
          </div>
        ) : (
          sortedMeals.map(meal => (
            <DraggableMealCard
              key={meal.id}
              meal={meal}
              onEdit={(m) => setEditingMeal(m)}
            />
          ))
        )}
      </div>

      {editingMeal && (
        <EditMealModal
          meal={editingMeal}
          onClose={() => setEditingMeal(null)}
        />
      )}
    </div>
  );
};
