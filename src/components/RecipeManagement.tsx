import React, { useState, useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeForm } from './RecipeForm';
import { ModalPortal } from './Modal';
import { RECIPE_CATEGORIES, getCategoryLabel } from '../constants/categories';
import { TAG_GROUPS } from '../constants/tags';
import { filterMeals, sortMeals, buildTagValuesByGroup } from '../utils/mealFilters';
import type { SortBy, RatingComparator } from '../utils/mealFilters';
import type { Meal } from '../types/index.js';
import type { RecipeFormData } from './RecipeForm';
import { RecipeChat } from './RecipeChat';
import { NutritionTable } from './NutritionTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
    <div className="recipe-card" onClick={!dragHandleProps && onView ? onView : undefined} style={{ ...(selected ? { outline: '2px solid var(--accent)', outlineOffset: '-2px' } : {}), cursor: !dragHandleProps && onView ? 'pointer' : undefined }}>
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
        <h4 className="recipe-card-title" onClick={onView} style={onView ? { cursor: 'pointer' } : undefined}>{meal.name}</h4>
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

function FormattedRecipeText({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);

  // Pre-classify blocks: a short non-numbered block followed by a block with numbered lines is a heading
  const isNumberedBlock = (b: string) => b.split('\n').some(l => /^\d+\./.test(l.trim()));
  const blockTypes = blocks.map((block, i) => {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) return 'empty' as const;
    const isSingleShortLine = lines.length === 1 && lines[0].trim().length < 60 && !/^\d+\./.test(lines[0].trim());
    if (isSingleShortLine && i + 1 < blocks.length && isNumberedBlock(blocks[i + 1])) return 'heading' as const;
    return 'content' as const;
  });

  return (
    <div style={{ margin: '8px 0', fontSize: '14px', color: 'var(--text)', textAlign: 'left' }}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter(l => l.trim());
        if (lines.length === 0) return null;

        if (blockTypes[bi] === 'heading') {
          return (
            <div key={bi} style={{ fontWeight: 700, color: 'var(--text-h)', marginBottom: '6px', marginTop: bi > 0 ? '16px' : 0 }}>
              {lines[0].trim()}
            </div>
          );
        }

        // Check if first line within a multi-line block is a heading
        const hasNumberedLines = lines.some(l => /^\d+\./.test(l.trim()));
        const firstIsInlineHeading = lines.length > 1 && hasNumberedLines
          && !(/^\d+\./.test(lines[0].trim())) && lines[0].trim().length < 60;

        return (
          <div key={bi} style={{ marginBottom: bi < blocks.length - 1 ? '12px' : 0 }}>
            {firstIsInlineHeading && (
              <div style={{ fontWeight: 700, color: 'var(--text-h)', marginBottom: '6px' }}>
                {lines[0].trim()}
              </div>
            )}
            {(firstIsInlineHeading ? lines.slice(1) : lines).map((line, li) => {
              const numbered = line.trim().match(/^(\d+)\.\s+(.*)/);
              if (numbered) {
                return (
                  <div key={li} style={{ display: 'flex', gap: '8px', marginBottom: '8px', lineHeight: 1.4 }}>
                    <span style={{ minWidth: '24px', textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {numbered[1]}.
                    </span>
                    <span>{numbered[2]}</span>
                  </div>
                );
              }
              return <div key={li} style={{ marginBottom: '4px' }}>{line.trim()}</div>;
            })}
          </div>
        );
      })}
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
  const { updateMeal } = useMealPlan();
  const [editingComment, setEditingComment] = useState(false);
  const [commentText, setCommentText] = useState(meal.comment || '');
  const displayServings = servings ?? meal.defaultServings;

  const handleSaveComment = () => {
    const newComment = commentText.trim() || undefined;
    if (newComment !== (meal.comment || undefined)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _, ...mealWithoutId } = meal;
      updateMeal(meal.id, { ...mealWithoutId, comment: newComment });
    }
    setEditingComment(false);
  };
  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '700px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
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
        <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-h)', textAlign: 'center' }}>{meal.name}</h2>

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

        <div style={{ marginBottom: '16px' }}>
          {editingComment ? (
            <div>
              <textarea
                className="textarea"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onBlur={handleSaveComment}
                onKeyDown={(e) => { if (e.key === 'Escape') { setCommentText(meal.comment || ''); setEditingComment(false); } }}
                autoFocus
                rows={3}
                style={{ width: '100%', fontStyle: 'italic', fontSize: '14px' }}
                placeholder="Kommentar hinzufügen..."
              />
            </div>
          ) : (
            <p
              onClick={() => { setCommentText(meal.comment || ''); setEditingComment(true); }}
              style={{
                margin: 0,
                fontSize: '14px',
                whiteSpace: 'pre-wrap',
                fontStyle: 'italic',
                color: meal.comment ? 'var(--text)' : 'var(--color-muted)',
                cursor: 'pointer',
              }}
              title="Klicken zum Bearbeiten"
            >
              {meal.comment || 'Kommentar hinzufügen...'}
            </p>
          )}
        </div>

        <div className="recipe-detail-grid" style={{ display: meal.recipeText ? 'grid' : 'block', gridTemplateColumns: meal.recipeText ? '1fr 2fr' : '1fr', gap: '20px' }}>
          <div style={{ textAlign: 'left' }}>
            <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Zutaten</strong>
            <ul style={{ margin: '8px 0', paddingLeft: '18px', fontSize: '14px', color: 'var(--text)', textAlign: 'left' }}>
              {meal.ingredients.map((ing, i) => {
                const scaled = ing.amount * (displayServings / meal.defaultServings);
                return (
                  <li key={i}>
                    {ing.unit === 'NB' || ing.unit === 'Nach Belieben'
                      ? <>{ing.name} <span style={{ color: 'var(--text-muted)' }}>(nach Belieben)</span></>
                      : <><strong>{Number(scaled.toFixed(1))} {ing.unit}</strong> {ing.name}</>}
                  </li>
                );
              })}
            </ul>
          </div>
          {meal.recipeText && (
            <div style={{ textAlign: 'left' }}>
              <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Zubereitung</strong>
              <FormattedRecipeText text={meal.recipeText} />
            </div>
          )}
        </div>

        <NutritionTable
          meal={meal}
          onTagsUpdated={(tags) => {
            const { id: _, ...rest } = meal;
            updateMeal(meal.id, { ...rest, tags });
          }}
        />

        <RecipeChat meal={meal} />
      </div>
    </div>
    </ModalPortal>
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
    <ModalPortal>
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '900px', width: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
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
    </ModalPortal>
  );
}

export function CreateRecipeModal({ onClose }: { onClose: () => void }) {
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
    <ModalPortal>
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '900px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
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
    </ModalPortal>
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
  const activePlans = state.plans.filter(p => !p.archived);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(
    activePlan && !activePlan.archived ? activePlan.id : activePlans[0]?.id ?? null
  );

  // Load entries for selected plan if needed
  React.useEffect(() => {
    if (selectedPlanId && selectedPlanId !== activePlan?.id) {
      selectPlan(selectedPlanId);
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = state.plans.find(p => p.id === selectedPlanId);
  const entries = plan?.entries || [];
  const isMenu = plan?.planType === 'menu';
  const courses = plan?.courses || [];

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

  const weeklyMealTypes: Array<{ key: string; label: string }> = [
    { key: 'breakfast', label: 'Frühst.' },
    { key: 'lunch', label: 'Mittag' },
    { key: 'dinner', label: 'Abend' },
  ];

  const menuMealTypes: Array<{ key: string; label: string }> = [
    { key: 'food', label: 'Essen' },
    { key: 'drinks', label: 'Getränke' },
  ];

  const mealTypes = isMenu ? menuMealTypes : weeklyMealTypes;

  const formatDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    const dt = new Date(Number(dateStr.slice(0, 4)), Number(m) - 1, Number(d));
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return `${days[dt.getDay()]} ${d}.${m}`;
  };

  const handleSlotClick = (date: string, mealType: string) => {
    addMealToSlot(date, mealType as 'breakfast' | 'lunch' | 'dinner' | 'food' | 'drinks', meal.id);
    onClose();
  };

  const getSlotMeals = (date: string, mealType: string) => {
    return entries
      .filter(e => e.date === date && e.mealType === mealType)
      .map(e => allMealsForActivePlan.find(m => m.id === e.mealId))
      .filter(Boolean) as Meal[];
  };

  // Rows: dates for weekly plans, courses for menu plans
  const rows = isMenu
    ? courses.sort((a, b) => a.sortOrder - b.sortOrder).map(c => ({
        key: `course_${c.id}`,
        label: c.label || `Gang ${c.sortOrder + 1}`,
      }))
    : dates.map(d => ({ key: d, label: formatDate(d) }));

  const hasContent = rows.length > 0;

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '550px', width: '90%', padding: '16px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>
            &ldquo;{meal.name.length > 30 ? meal.name.slice(0, 30) + '...' : meal.name}&rdquo; hinzufügen
          </h3>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: '20px' }}>×</button>
        </div>

        {activePlans.length > 1 && (
          <select
            className="input"
            value={selectedPlanId ?? ''}
            onChange={e => setSelectedPlanId(Number(e.target.value))}
            style={{ width: '100%', marginBottom: '10px', fontSize: '13px' }}
          >
            {activePlans.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.planType === 'menu' ? ' (Menü)' : ''}</option>
            ))}
          </select>
        )}

        {!hasContent ? (
          <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px' }}>
            {isMenu ? 'Keine Gänge vorhanden' : 'Kein Plan ausgewählt'}
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '2px solid var(--border-light)', color: 'var(--text)', fontWeight: 600, fontSize: '11px' }}>
                    {isMenu ? 'Gang' : 'Datum'}
                  </th>
                  {mealTypes.map(mt => (
                    <th key={mt.key} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '2px solid var(--border-light)', color: 'var(--text)', fontWeight: 600, fontSize: '11px' }}>{mt.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.key}>
                    <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-h)' }}>
                      {row.label}
                    </td>
                    {mealTypes.map(mt => {
                      const slotMeals = getSlotMeals(row.key, mt.key);
                      return (
                        <td
                          key={mt.key}
                          onClick={() => handleSlotClick(row.key, mt.key)}
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
    </ModalPortal>
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
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');
  const [ratingComparator, setRatingComparator] = useState<RatingComparator>('gte');

  const [viewingMeal, setViewingMeal] = useState<Meal | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [addToPlanMeal, setAddToPlanMeal] = useState<Meal | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const tagValuesByGroup = useMemo(() => buildTagValuesByGroup(state.meals), [state.meals]);

  const filteredMeals = useMemo(() =>
    filterMeals(state.meals, { starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime, searchQuery, ratingFilter, ratingComparator }),
    [state.meals, starFilter, categoryFilter, tagFilter, searchQuery, maxPrepTime, maxTotalTime, ratingFilter, ratingComparator]
  );

  const sortedMeals = useMemo(() =>
    sortMeals(filteredMeals, sortBy),
    [filteredMeals, sortBy]
  );

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
    <div className="recipe-management-container" style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
      {/* Header */}
      <div className="recipe-management-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-h)' }}>Rezepte ({state.meals.length})</h2>
        <div className="recipe-management-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text)', flexShrink: 0 }}>Bewertung:</span>
          <select className="input" value={ratingComparator} onChange={(e) => setRatingComparator(e.target.value as RatingComparator)} style={{ width: '55px', fontSize: '12px', padding: '4px 4px' }}>
            <option value="gte">≥</option>
            <option value="eq">=</option>
            <option value="lte">≤</option>
          </select>
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            <span
              onClick={() => setRatingFilter(ratingFilter === 0 ? '' : 0)}
              style={{ cursor: 'pointer', fontSize: '14px', opacity: ratingFilter === 0 ? 1 : 0.3, padding: '0 2px' }}
              title="Ohne Bewertung"
            >
              ∅
            </span>
            {[1, 2, 3, 4, 5].map(s => (
              <span
                key={s}
                onClick={() => setRatingFilter(ratingFilter === s ? '' : s)}
                style={{ cursor: 'pointer', fontSize: '18px', opacity: ratingFilter !== '' && s <= ratingFilter ? 1 : 0.3 }}
              >
                ★
              </span>
            ))}
          </div>
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
