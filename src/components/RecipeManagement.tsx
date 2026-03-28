import React, { useState, useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeForm } from './RecipeForm';
import { RECIPE_CATEGORIES, getCategoryLabel } from '../constants/categories';
import { TAG_GROUPS, parseTag } from '../constants/tags';
import type { Meal } from '../types/index.js';
import type { RecipeFormData } from './RecipeForm';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type SortBy = 'name' | 'rating' | 'newest';

export function RatingStars({ rating, size = 16, onClick }: { rating?: number; size?: number; onClick?: (rating: number) => void }) {
  return (
    <span className={`rating-stars${onClick ? ' rating-stars-interactive' : ''}`} style={{ fontSize: `${size}px` }} onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(s => (
        <span
          key={s}
          style={onClick ? { cursor: 'pointer' } : undefined}
          onClick={onClick ? () => onClick((rating || 0) === s ? 0 : s) : undefined}
        >
          {s <= (rating || 0) ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

export function RecipeCard({
  meal,
  onView,
  onEdit,
  onDelete,
  onToggleStar,
  onAddToPlan,
  onSetRating,
  selected,
  onToggleSelect,
  compact,
  dragHandleProps,
}: {
  meal: Meal;
  onView?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onAddToPlan?: () => void;
  onSetRating?: (rating: number) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  compact?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div className="recipe-card" style={selected ? { outline: '2px solid var(--accent)', outlineOffset: '-2px' } : undefined}>
      <div
        className={`recipe-card-photo${compact ? ' recipe-card-photo-compact' : ''}`}
        style={{ position: 'relative', cursor: dragHandleProps ? 'grab' : undefined }}
        {...dragHandleProps}
      >
        {meal.photoUrl ? (
          <img src={`${API_URL}${meal.photoUrl}`} alt={meal.name} style={{ pointerEvents: 'none' }} />
        ) : (
          <div className="recipe-card-photo-placeholder">🍽️</div>
        )}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', top: '8px', left: '8px', width: '18px', height: '18px', cursor: 'pointer' }}
            title="Zum Exportieren auswählen"
          />
        )}
      </div>
      <div className="recipe-card-body">
        <h4 className="recipe-card-title">{meal.name}</h4>
        {(meal.category || (meal.tags && meal.tags.length > 0)) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
            {meal.category && <span className="category-badge">{getCategoryLabel(meal.category)}</span>}
            {meal.tags?.slice(0, 3).map(tag => {
              const val = tag.includes(':') ? tag.split(':')[1] : tag;
              return <span key={tag} className="tag-pill tag-pill-sm">{val}</span>;
            })}
            {meal.tags && meal.tags.length > 3 && (
              <span className="tag-pill tag-pill-sm">+{meal.tags.length - 3}</span>
            )}
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
          <RatingStars rating={meal.rating} size={14} onClick={onSetRating} />
          <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '4px' }}>
            {meal.ingredients.length} Zutaten • {meal.defaultServings} Person{meal.defaultServings !== 1 ? 'en' : ''}
            {(meal.prepTime || meal.totalTime) && (
              <span>
                {' • '}⏱ {meal.prepTime && meal.totalTime ? `${meal.prepTime}+${meal.totalTime - meal.prepTime}` : meal.totalTime || meal.prepTime} Min.
              </span>
            )}
          </div>
          <div className="recipe-card-actions" onClick={(e) => e.stopPropagation()}>
            {onView && (
              <button className="btn-ghost" onClick={onView} title="Anzeigen">
                👁️
              </button>
            )}
            {onAddToPlan && (
              <button className="btn-ghost" onClick={onAddToPlan} style={{ color: 'var(--color-primary)' }} title="Zu Plan hinzufügen">
                +📋
              </button>
            )}
            <button className="btn-ghost" onClick={onToggleStar} title={meal.starred ? 'Favorit entfernen' : 'Favorit'}>
              {meal.starred ? '⭐' : '☆'}
            </button>
            <button className="btn-ghost" onClick={onEdit} style={{ color: 'var(--accent)' }} title="Bearbeiten">
              ✏️
            </button>
            <button className="btn-ghost" onClick={onDelete} style={{ color: 'var(--color-danger)' }} title="Löschen">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecipeDetailModal({
  meal,
  servings,
  onClose,
  onEdit,
  onToggleStar,
  onSetRating,
}: {
  meal: Meal;
  servings?: number;
  onClose: () => void;
  onEdit?: () => void;
  onToggleStar?: () => void;
  onSetRating?: (rating: number) => void;
}) {
  const displayServings = servings ?? meal.defaultServings;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '700px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, color: 'var(--text-h)' }}>{meal.name}</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {meal.recipeUrl && (
              <a href={meal.recipeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-muted" style={{ padding: '6px 12px', fontSize: '13px', lineHeight: '1.4' }}>
                🔗 Rezept
              </a>
            )}
            {onToggleStar && (
              <button className="btn-ghost" onClick={onToggleStar} style={{ fontSize: '20px' }}>
                {meal.starred ? '⭐' : '☆'}
              </button>
            )}
            {onEdit && <button className="btn btn-accent" onClick={onEdit} style={{ padding: '6px 12px', fontSize: '13px', lineHeight: '1.4' }}>Bearbeiten</button>}
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>×</button>
          </div>
        </div>

        {meal.photoUrl && (
          <img
            src={`${API_URL}${meal.photoUrl}`}
            alt={meal.name}
            style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}
          />
        )}

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', justifyContent: 'center' }}>
          {meal.category && <span className="category-badge">{getCategoryLabel(meal.category)}</span>}
          {meal.tags?.map(tag => (
            <span key={tag} className="tag-pill">{tag}</span>
          ))}
        </div>

        {onSetRating ? (
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', marginRight: '8px' }}>Bewertung:</span>
            <span className="rating-stars rating-stars-interactive">
              {[1, 2, 3, 4, 5].map(s => (
                <span
                  key={s}
                  onClick={() => onSetRating(meal.rating === s ? 0 : s)}
                  style={{ cursor: 'pointer', fontSize: '20px' }}
                >
                  {s <= (meal.rating || 0) ? '★' : '☆'}
                </span>
              ))}
            </span>
          </div>
        ) : meal.rating ? (
          <div style={{ marginBottom: '12px' }}>
            <RatingStars rating={meal.rating} size={18} />
          </div>
        ) : null}

        <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '12px' }}>
          {displayServings} Person{displayServings !== 1 ? 'en' : ''}
          {displayServings !== meal.defaultServings && (
            <span style={{ fontSize: '12px', color: 'var(--text)', marginLeft: '5px' }}>
              (skaliert von {meal.defaultServings})
            </span>
          )}
        </div>

        {meal.comment && (
          <div style={{ marginBottom: '16px' }}>
            <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Kommentar</strong>
            <p style={{ margin: '4px 0', fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{meal.comment}</p>
          </div>
        )}

        <div style={{ display: meal.recipeText ? 'grid' : 'block', gridTemplateColumns: meal.recipeText ? '1fr 2fr' : '1fr', gap: '20px' }}>
          <div style={{ textAlign: 'left' }}>
            <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Zutaten</strong>
            <ul style={{ margin: '8px 0', paddingLeft: '18px', fontSize: '14px', color: 'var(--text)', textAlign: 'left' }}>
              {meal.ingredients.map((ing, i) => {
                const scaled = ing.amount * (displayServings / meal.defaultServings);
                return (
                  <li key={i}>
                    {ing.unit === 'Nach Belieben'
                      ? `${ing.name} (nach Belieben)`
                      : `${Number(scaled.toFixed(1))} ${ing.unit} ${ing.name}`}
                  </li>
                );
              })}
            </ul>
          </div>
          {meal.recipeText && (
            <div style={{ textAlign: 'left' }}>
              <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Zubereitung</strong>
              <p style={{ margin: '8px 0', fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{meal.recipeText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EditRecipeModal({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const { state, updateMeal, uploadMealPhoto, deleteMealPhoto, downloadMealPhotoFromUrl } = useMealPlan();
  const allUserTags = useMemo(() => state.meals.flatMap(m => m.tags || []), [state.meals]);

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
      <div className="modal-content" style={{ maxWidth: '600px', width: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>Rezept bearbeiten</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="submit" form="edit-recipe-form" className="btn-ghost" style={{ fontSize: '20px' }} title="Speichern">💾</button>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>×</button>
          </div>
        </div>
        <div style={{ overflow: 'auto', paddingTop: '16px' }}>
          <RecipeForm
            formId="edit-recipe-form"
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
}

function CreateRecipeModal({ onClose }: { onClose: () => void }) {
  const { state, addMeal, uploadMealPhoto, downloadMealPhotoFromUrl } = useMealPlan();
  const allUserTags = useMemo(() => state.meals.flatMap(m => m.tags || []), [state.meals]);

  const handleCreate = async (data: RecipeFormData) => {
    const newMeal = await addMeal(data.meal);
    if (newMeal) {
      if (data.photoFile) {
        await uploadMealPhoto(newMeal.id, data.photoFile);
      } else if (data.remotePhotoUrl) {
        await downloadMealPhotoFromUrl(newMeal.id, data.remotePhotoUrl);
      }
    }
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Neues Rezept</h3>
          <button type="button" className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>×</button>
        </div>
        <RecipeForm
          allUserTags={allUserTags}
          onSubmit={handleCreate}
          onCancel={onClose}
          submitLabel="Erstellen"
          showUrlParsing={true}
        />
      </div>
    </div>
  );
}

function buildExportData(meals: Meal[]): string {
  const exportObj = {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: meals.map(m => ({
      name: m.name,
      ingredients: m.ingredients,
      defaultServings: m.defaultServings,
      rating: m.rating,
      category: m.category,
      tags: m.tags,
      recipeUrl: m.recipeUrl,
      comment: m.comment,
      recipeText: m.recipeText,
      prepTime: m.prepTime,
      totalTime: m.totalTime,
      photoUrl: m.photoUrl ? `${API_URL}${m.photoUrl}` : undefined,
    })),
  };
  return JSON.stringify(exportObj, null, 2);
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SlotPickerModal({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const { activePlan, allMealsForActivePlan, addMealToSlot, state, selectPlan } = useMealPlan();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(activePlan?.id ?? null);

  // Load entries for selected plan if needed
  React.useEffect(() => {
    if (selectedPlanId && selectedPlanId !== activePlan?.id) {
      selectPlan(selectedPlanId);
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = state.plans.find(p => p.id === selectedPlanId);
  const entries = plan?.entries || [];

  const dates = plan?.startDate && plan?.endDate
    ? (() => {
        const [sy, sm, sd] = plan.startDate.split('-').map(Number);
        const [ey, em, ed] = plan.endDate.split('-').map(Number);
        const start = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);
        const result: string[] = [];
        const d = new Date(start);
        while (d <= end) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          result.push(`${yyyy}-${mm}-${dd}`);
          d.setDate(d.getDate() + 1);
        }
        return result;
      })()
    : [];

  const mealTypes: Array<{ key: string; label: string }> = [
    { key: 'breakfast', label: 'Frühst.' },
    { key: 'lunch', label: 'Mittag' },
    { key: 'dinner', label: 'Abend' },
  ];

  const formatDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    const dt = new Date(Number(dateStr.slice(0, 4)), Number(m) - 1, Number(d));
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return `${days[dt.getDay()]} ${d}.${m}`;
  };

  const handleSlotClick = (date: string, mealType: string) => {
    addMealToSlot(date, mealType as 'breakfast' | 'lunch' | 'dinner', meal.id);
    onClose();
  };

  const getSlotMeals = (date: string, mealType: string) => {
    return entries
      .filter(e => e.date === date && e.mealType === mealType)
      .map(e => allMealsForActivePlan.find(m => m.id === e.mealId))
      .filter(Boolean) as Meal[];
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '550px', width: '90%', padding: '16px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>
            &ldquo;{meal.name.length > 30 ? meal.name.slice(0, 30) + '...' : meal.name}&rdquo; hinzufügen
          </h3>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: '20px' }}>×</button>
        </div>

        {state.plans.length > 1 && (
          <select
            className="input"
            value={selectedPlanId ?? ''}
            onChange={e => setSelectedPlanId(Number(e.target.value))}
            style={{ width: '100%', marginBottom: '10px', fontSize: '13px' }}
          >
            {state.plans.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {dates.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px' }}>Kein Plan ausgewählt</div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '2px solid var(--border-light)', color: 'var(--text)', fontWeight: 600, fontSize: '11px' }}>Datum</th>
                  {mealTypes.map(mt => (
                    <th key={mt.key} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '2px solid var(--border-light)', color: 'var(--text)', fontWeight: 600, fontSize: '11px' }}>{mt.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map(date => (
                  <tr key={date}>
                    <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-h)' }}>
                      {formatDate(date)}
                    </td>
                    {mealTypes.map(mt => {
                      const slotMeals = getSlotMeals(date, mt.key);
                      return (
                        <td
                          key={mt.key}
                          onClick={() => handleSlotClick(date, mt.key)}
                          style={{
                            padding: '3px 6px',
                            borderBottom: '1px solid var(--border-light)',
                            borderLeft: '1px solid var(--border-light)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            maxWidth: '120px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          title="Klicken zum Hinzufügen"
                        >
                          {slotMeals.length > 0
                            ? slotMeals.map(m => (
                                <div key={m.id} style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>
                                  {m.name.slice(0, 15)}{m.name.length > 15 ? '…' : ''}
                                </div>
                              ))
                            : <span style={{ color: 'var(--text)', opacity: 0.3 }}>—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export const RecipeManagement: React.FC = () => {
  const { state, toggleMealStar, deleteMeal, updateMeal, importMeals } = useMealPlan();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [starFilter, setStarFilter] = useState<'all' | 'starred'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [maxPrepTime, setMaxPrepTime] = useState<number | ''>('');
  const [maxTotalTime, setMaxTotalTime] = useState<number | ''>('');

  const [viewingMeal, setViewingMeal] = useState<Meal | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [addToPlanMeal, setAddToPlanMeal] = useState<Meal | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Collect available tag values per group from all meals
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
      // Per-group tag filtering: for each group with selections, meal must have at least one matching tag
      if (tagFilter.length > 0) {
        const filtersByGroup: Record<string, string[]> = {};
        tagFilter.forEach(t => {
          const p = parseTag(t);
          if (p) {
            if (!filtersByGroup[p.key]) filtersByGroup[p.key] = [];
            filtersByGroup[p.key].push(t);
          }
        });
        // AND across groups, OR within a group
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
  }, [state.meals, starFilter, categoryFilter, tagFilter, searchQuery, maxPrepTime, maxTotalTime]);

  const sortedMeals = useMemo(() => {
    return [...filteredMeals].sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'newest':
          return (b.id > a.id ? 1 : -1);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [filteredMeals, sortBy]);

  const handleDelete = (meal: Meal) => {
    if (confirm(`Rezept "${meal.name}" wirklich löschen?`)) {
      deleteMeal(meal.id);
    }
  };

  const handleSetRating = async (mealId: string, rating: number) => {
    const meal = state.meals.find(m => m.id === mealId);
    if (!meal) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, ...mealWithoutId } = meal;
    await updateMeal(mealId, { ...mealWithoutId, rating: rating || undefined });
    // Update the viewing meal if it's the same
    if (viewingMeal?.id === mealId) {
      setViewingMeal(prev => prev ? { ...prev, rating: rating || undefined } : null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExportSelected = () => {
    const mealsToExport = state.meals.filter(m => selectedIds.has(m.id));
    if (mealsToExport.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(buildExportData(mealsToExport), `rezepte-export-${date}.essensplaner`);
    setSelectedIds(new Set());
  };

  const handleExportAll = () => {
    if (state.meals.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(buildExportData(state.meals), `rezepte-alle-${date}.essensplaner`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.recipes || !Array.isArray(data.recipes)) {
        alert('Ungültiges Dateiformat');
        return;
      }

      const result = await importMeals(data.recipes);
      let msg = `${result.imported.length} Rezept${result.imported.length !== 1 ? 'e' : ''} importiert.`;
      if (result.skipped.length > 0) {
        msg += `\n${result.skipped.length} übersprungen (bereits vorhanden): ${result.skipped.join(', ')}`;
      }
      alert(msg);
    } catch (err) {
      alert('Import fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Keep viewingMeal in sync with state
  const currentViewingMeal = viewingMeal ? state.meals.find(m => m.id === viewingMeal.id) || viewingMeal : null;

  return (
    <div style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-h)' }}>Rezepte ({state.meals.length})</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".essensplaner,.json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <button className="btn btn-muted" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Importiert...' : 'Importieren'}
          </button>
          <button className="btn btn-muted" onClick={handleExportAll} disabled={state.meals.length === 0}>
            Alle exportieren
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Neues Rezept
          </button>
        </div>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="panel" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-h)' }}>{selectedIds.size} ausgewählt</span>
          <button className="btn btn-accent btn-sm" onClick={handleExportSelected}>
            Exportieren
          </button>
          <button className="btn btn-muted btn-sm" onClick={() => setSelectedIds(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {/* Filters */}
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Alle Kategorien</option>
            {RECIPE_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <select
            className="input"
            value={maxPrepTime}
            onChange={(e) => setMaxPrepTime(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Aktive Zeit</option>
            <option value="15">⏱ Aktiv ≤ 15 Min.</option>
            <option value="30">⏱ Aktiv ≤ 30 Min.</option>
            <option value="60">⏱ Aktiv ≤ 60 Min.</option>
          </select>
          <select
            className="input"
            value={maxTotalTime}
            onChange={(e) => setMaxTotalTime(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Gesamtzeit</option>
            <option value="15">⏱ Gesamt ≤ 15 Min.</option>
            <option value="30">⏱ Gesamt ≤ 30 Min.</option>
            <option value="45">⏱ Gesamt ≤ 45 Min.</option>
            <option value="60">⏱ Gesamt ≤ 60 Min.</option>
            <option value="90">⏱ Gesamt ≤ 90 Min.</option>
          </select>
          <select
            className="input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="name">Name A-Z</option>
            <option value="rating">Bewertung</option>
            <option value="newest">Neueste</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            className={`pill ${starFilter === 'all' ? 'pill-active' : ''}`}
            onClick={() => setStarFilter('all')}
          >
            Alle
          </button>
          <button
            className={`pill ${starFilter === 'starred' ? 'pill-active' : ''}`}
            onClick={() => setStarFilter('starred')}
          >
            ⭐ Favoriten
          </button>
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

      {/* Recipe Grid */}
      {sortedMeals.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text)', padding: '40px' }}>
          {searchQuery.trim() || categoryFilter || tagFilter.length > 0
            ? 'Keine Rezepte gefunden'
            : starFilter === 'starred'
              ? 'Keine Favoriten vorhanden'
              : 'Noch keine Rezepte vorhanden'}
        </div>
      ) : (
        <div className="recipe-grid">
          {sortedMeals.map(meal => (
            <RecipeCard
              key={meal.id}
              meal={meal}
              onView={() => setViewingMeal(meal)}
              onEdit={() => setEditingMeal(meal)}
              onDelete={() => handleDelete(meal)}
              onToggleStar={() => toggleMealStar(meal.id)}
              onAddToPlan={() => setAddToPlanMeal(meal)}
              onSetRating={(r) => handleSetRating(meal.id, r)}
              selected={selectedIds.has(meal.id)}
              onToggleSelect={() => toggleSelect(meal.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {currentViewingMeal && !editingMeal && (
        <RecipeDetailModal
          meal={currentViewingMeal}
          onClose={() => setViewingMeal(null)}
          onEdit={() => { setEditingMeal(currentViewingMeal); setViewingMeal(null); }}
          onToggleStar={() => toggleMealStar(currentViewingMeal.id)}
          onSetRating={(r) => handleSetRating(currentViewingMeal.id, r)}
        />
      )}
      {editingMeal && (
        <EditRecipeModal
          meal={editingMeal}
          onClose={() => setEditingMeal(null)}
        />
      )}
      {showCreate && (
        <CreateRecipeModal onClose={() => setShowCreate(false)} />
      )}
      {addToPlanMeal && (
        <SlotPickerModal meal={addToPlanMeal} onClose={() => setAddToPlanMeal(null)} />
      )}
    </div>
  );
};
