import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import type { MealType, Meal, MealPlanEntry } from '../types/index.js';

interface RecipeCardModalProps {
  meal: Meal;
  servings: number;
  onClose: () => void;
}

const RecipeCardModal: React.FC<RecipeCardModalProps> = ({ meal, servings, onClose }) => {
  const scaleFactor = servings / meal.defaultServings;
  const hasRecipeText = meal.recipeText && meal.recipeText.trim().length > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: hasRecipeText ? '1200px' : '600px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>{meal.name}</h2>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>
            ×
          </button>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong>Portionen:</strong> {servings}
          {servings !== meal.defaultServings && (
            <span style={{ fontSize: '12px', color: 'var(--text)', marginLeft: '5px' }}>
              (skaliert von {meal.defaultServings})
            </span>
          )}
        </div>

        {meal.recipeUrl && (
          <div style={{ marginBottom: '15px' }}>
            <a href={meal.recipeUrl} target="_blank" rel="noopener noreferrer">
              🔗 Zum Rezept
            </a>
          </div>
        )}

        {meal.comment && (
          <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: 'var(--surface-1)', borderRadius: 'var(--radius-sm)' }}>
            <strong>Kommentar:</strong>
            <div style={{ marginTop: '5px' }}>{meal.comment}</div>
          </div>
        )}

        <div style={{ display: hasRecipeText ? 'grid' : 'block', gridTemplateColumns: hasRecipeText ? '1fr 1fr' : '1fr', gap: '20px' }}>
          <div>
            <h3>Zutaten</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {meal.ingredients.map((ing, index) => (
                <li key={index} style={{ marginBottom: '8px', padding: '10px', backgroundColor: 'var(--surface-1)', borderRadius: 'var(--radius-sm)' }}>
                  <strong>{(ing.amount * scaleFactor).toFixed(1)} {ing.unit}</strong> {ing.name}
                </li>
              ))}
            </ul>
          </div>

          {hasRecipeText && (
            <div>
              <h3>Zubereitung</h3>
              <div style={{ whiteSpace: 'pre-line', padding: '12px', backgroundColor: 'var(--surface-1)', borderRadius: 'var(--radius-sm)' }}>
                {meal.recipeText}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface MealCellProps {
  date: string;
  mealType: MealType;
}

const MealCell: React.FC<MealCellProps> = ({ date, mealType }) => {
  const { state, activePlan, removeMealFromSlot, toggleSlotEnabled, updateMealServings } = useMealPlan();
  const [isEditing, setIsEditing] = useState(false);
  const [editServings, setEditServings] = useState(2);
  const [showRecipeCard, setShowRecipeCard] = useState(false);

  const entries = activePlan?.entries || [];
  const entry = entries.find(e => e.date === date && e.mealType === mealType);
  const meal = entry?.mealId ? state.meals.find(m => m.id === entry.mealId) : null;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${date}-${mealType}`,
    data: { date, mealType },
    disabled: !entry?.enabled,
  });

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `cell:${date}:${mealType}`,
    data: { meal, sourceDate: date, sourceMealType: mealType },
    disabled: !meal || !entry?.enabled,
  });

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  if (!entry) return null;

  const handleToggleEnabled = () => {
    toggleSlotEnabled(date, mealType);
  };

  const handleRemoveMeal = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeMealFromSlot(date, mealType);
  };

  const handleEditServings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditServings(entry.servings);
    setIsEditing(true);
  };

  const handleSaveServings = () => {
    updateMealServings(date, mealType, editServings);
    setIsEditing(false);
  };

  return (
    <td
      ref={setDropRef}
      style={{
        minHeight: '80px',
        backgroundColor: !entry.enabled
          ? 'var(--surface-2)'
          : isOver
          ? 'var(--surface-drop)'
          : undefined,
        opacity: entry.enabled ? 1 : 0.5,
        position: 'relative',
      }}
    >
      <button
        className="btn-ghost"
        onClick={handleToggleEnabled}
        style={{ position: 'absolute', top: '4px', right: '4px', fontSize: '14px', padding: '2px 6px' }}
        title={entry.enabled ? 'Deaktivieren' : 'Aktivieren'}
      >
        {entry.enabled ? '✓' : '✗'}
      </button>

      {meal && entry.enabled && (
        <>
          <div
            ref={setDragRef}
            style={{
              ...dragStyle,
              opacity: isDragging ? 0.5 : 1,
              paddingRight: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '4px', lineHeight: 1.3 }}>
              <span
                style={{ cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--color-muted)', userSelect: 'none', flexShrink: 0, fontSize: '12px', lineHeight: 1 }}
                title="Ziehen um zu verschieben"
                {...listeners}
                {...attributes}
              >
                ⠿
              </span>
              <span
                style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: '14px', textAlign: 'center', flex: 1 }}
                onClick={() => setShowRecipeCard(true)}
              >
                {meal.name}
              </span>
              {meal.recipeUrl ? (
                <a
                  href={meal.recipeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '12px', flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  title="Rezept-Website öffnen"
                >
                  🔗
                </a>
              ) : (
                <span style={{ width: '12px', flexShrink: 0 }} />
              )}
            </div>
          </div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}>
              <input
                className="input"
                type="number"
                min="1"
                value={editServings}
                onChange={(e) => setEditServings(parseInt(e.target.value) || 1)}
                style={{ width: '50px', padding: '3px 6px', fontSize: '12px' }}
                onClick={(e) => e.stopPropagation()}
              />
              <span style={{ fontSize: '12px' }}>Pers.</span>
              <button className="btn btn-primary btn-sm" onClick={handleSaveServings}>
                OK
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '2px', textAlign: 'center' }}>
              <span
                onClick={handleEditServings}
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
              >
                {entry.servings} Person{entry.servings !== 1 ? 'en' : ''}
              </span>
              {' · '}
              <span
                onClick={handleRemoveMeal}
                style={{ cursor: 'pointer', color: 'var(--color-danger)' }}
              >
                Entfernen
              </span>
            </div>
          )}

        {showRecipeCard && (
          <RecipeCardModal
            meal={meal}
            servings={entry.servings}
            onClose={() => setShowRecipeCard(false)}
          />
        )}
      </>
      )}
    </td>
  );
};

export const MealPlanTable: React.FC = () => {
  const { activePlan, defaultServings, setDefaultServings } = useMealPlan();

  if (!activePlan) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text)' }}>
        Bitte wählen Sie einen Zeitraum aus, um den Plan zu erstellen.
      </div>
    );
  }

  const entries = activePlan.entries || [];

  // Group entries by date
  const dateGroups = entries.reduce((acc, entry) => {
    if (!acc[entry.date]) {
      acc[entry.date] = {};
    }
    acc[entry.date][entry.mealType] = entry;
    return acc;
  }, {} as Record<string, Record<string, MealPlanEntry>>);

  const dates = Object.keys(dateGroups).sort();

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px', marginBottom: '12px' }}>
        <label>Standard-Portionen:</label>
        <input
          className="input"
          type="number"
          min="1"
          value={defaultServings}
          onChange={(e) => setDefaultServings(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: '60px', textAlign: 'center' }}
        />
      </div>
      <table className="meal-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Frühstück</th>
            <th>Mittagessen</th>
            <th>Abendessen</th>
          </tr>
        </thead>
        <tbody>
          {dates.map(date => (
            <tr key={date}>
              <td style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {format(parseISO(date), 'EEE, dd.MM.yyyy', { locale: de })}
              </td>
              <MealCell date={date} mealType="breakfast" />
              <MealCell date={date} mealType="lunch" />
              <MealCell date={date} mealType="dinner" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
