import React from 'react';
import { useMealCellItemActions } from '../hooks/useMealCellItemActions';
import { RecipeDetailModal, EditRecipeModal } from './RecipeManagement';
import { formatPortionWeight, portionWeightTitle } from '../utils/portionWeight';
import { ServingsInput } from './ServingsInput';
import type { Meal, MealPlanEntry } from '../types/index.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface VisualMealCellItemProps {
  entry: MealPlanEntry;
  meal: Meal;
  onAddAnother?: () => void;
}

export const VisualMealCellItem: React.FC<VisualMealCellItemProps> = ({ entry, meal, onAddAnother }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    dragStyle,
    isDragging,
    isEditing,
    editServings,
    setEditServings,
    showRecipeCard,
    setShowRecipeCard,
    showEdit,
    setShowEdit,
    handleRemove,
    handleToggleEnabled,
    handleEditServings,
    handleSaveServings,
    toggleMealStar,
    updateMeal,
  } = useMealCellItemActions({ entry, meal });

  const portionWeight = formatPortionWeight(meal, entry.servings);

  return (
    <div
      ref={setNodeRef}
      className="visual-meal-card"
      style={{
        ...dragStyle,
        opacity: isDragging ? 0.5 : entry.enabled ? 1 : 0.4,
      }}
      onClick={() => setShowRecipeCard(true)}
    >
      <div className="visual-meal-card-photo">
        {meal.photoUrl ? (
          <img src={`${API_URL}${meal.photoUrl}`} alt={meal.name} />
        ) : (
          <div className="visual-meal-card-photo-placeholder" aria-hidden="true" />
        )}
      </div>
      <h4 className="visual-meal-card-title" title={meal.name}><span>{meal.name}</span></h4>

      <div className="visual-meal-card-overlay">
        <div className="visual-meal-card-overlay-row">
          <span
            className="visual-meal-card-icon-btn"
            style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
            title="Ziehen um zu verschieben"
            onClick={(e) => e.stopPropagation()}
            {...listeners}
            {...attributes}
          >
            ⠿
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {onAddAnother && (
              <button
                className="visual-meal-card-icon-btn"
                onClick={(e) => { e.stopPropagation(); onAddAnother(); }}
                title="Weiteres Rezept hinzufügen"
              >
                +
              </button>
            )}
            {meal.recipeUrl && (
              <a
                href={meal.recipeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="visual-meal-card-icon-btn"
                onClick={(e) => e.stopPropagation()}
                title="Rezept-Website öffnen"
              >
                🔗
              </a>
            )}
            <button
              className="visual-meal-card-icon-btn"
              onClick={handleToggleEnabled}
              title={entry.enabled ? 'Deaktivieren' : 'Aktivieren'}
            >
              {entry.enabled ? '✓' : '✗'}
            </button>
          </div>
        </div>

        <div className="visual-meal-card-overlay-row" style={{ alignItems: 'flex-end' }}>
          {isEditing ? (
            <div
              style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
              onClick={(e) => e.stopPropagation()}
            >
              <ServingsInput
                value={editServings}
                onChange={setEditServings}
                onSubmit={handleSaveServings}
                style={{ width: '44px', padding: '2px 4px', fontSize: '11px' }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleSaveServings} style={{ padding: '2px 6px', fontSize: '11px' }}>
                OK
              </button>
            </div>
          ) : (
            <button
              className="visual-meal-card-chip"
              onClick={handleEditServings}
              title={portionWeightTitle(meal, entry.servings) ?? 'Portionen bearbeiten'}
            >
              {entry.servings.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Port.{portionWeight ? ` · ${portionWeight}` : ''} ✎
            </button>
          )}
          <button
            className="visual-meal-card-icon-btn"
            onClick={handleRemove}
            title="Entfernen"
          >
            🗑
          </button>
        </div>
      </div>

      {showRecipeCard && (
        <RecipeDetailModal
          meal={meal}
          servings={entry.servings}
          entryId={entry.id}
          entryDate={entry.date}
          onClose={() => setShowRecipeCard(false)}
          onEdit={() => { setShowRecipeCard(false); setShowEdit(true); }}
          onToggleStar={() => toggleMealStar(meal.id)}
          onSetRating={(r) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _, ...rest } = meal;
            updateMeal(meal.id, { ...rest, rating: r || undefined });
          }}
        />
      )}
      {showEdit && (
        <EditRecipeModal meal={meal} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
};
