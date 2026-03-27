import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import type { MealType, Meal } from '../types/index.js';

interface RecipeCardModalProps {
  meal: Meal;
  servings: number;
  onClose: () => void;
}

const RecipeCardModal: React.FC<RecipeCardModalProps> = ({ meal, servings, onClose }) => {
  const scaleFactor = servings / meal.defaultServings;
  const hasRecipeText = meal.recipeText && meal.recipeText.trim().length > 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          maxWidth: hasRecipeText ? '1200px' : '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>{meal.name}</h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 5px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong>Portionen:</strong> {servings}
          {servings !== meal.defaultServings && (
            <span style={{ fontSize: '12px', color: '#666', marginLeft: '5px' }}>
              (skaliert von {meal.defaultServings})
            </span>
          )}
        </div>

        {meal.recipeUrl && (
          <div style={{ marginBottom: '15px' }}>
            <a
              href={meal.recipeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2196F3' }}
            >
              🔗 Zum Rezept
            </a>
          </div>
        )}

        {meal.comment && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <strong>Kommentar:</strong>
            <div style={{ marginTop: '5px' }}>{meal.comment}</div>
          </div>
        )}

        <div style={{ display: hasRecipeText ? 'grid' : 'block', gridTemplateColumns: hasRecipeText ? '1fr 1fr' : '1fr', gap: '20px' }}>
          <div>
            <h3>Zutaten</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {meal.ingredients.map((ing, index) => (
                <li key={index} style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                  <strong>{(ing.amount * scaleFactor).toFixed(1)} {ing.unit}</strong> {ing.name}
                </li>
              ))}
            </ul>
          </div>

          {hasRecipeText && (
            <div>
              <h3>Zubereitung</h3>
              <div style={{ whiteSpace: 'pre-line', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
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
  const { state, removeMealFromSlot, toggleSlotEnabled, updateMealServings } = useMealPlan();
  const [isEditing, setIsEditing] = useState(false);
  const [editServings, setEditServings] = useState(2);
  const [showRecipeCard, setShowRecipeCard] = useState(false);

  const entry = state.entries.find(e => e.date === date && e.mealType === mealType);
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
        border: '1px solid #ddd',
        padding: '10px',
        minHeight: '80px',
        backgroundColor: !entry.enabled
          ? '#f0f0f0'
          : isOver
          ? '#e3f2fd'
          : meal
          ? '#fff3e0'
          : 'white',
        opacity: entry.enabled ? 1 : 0.5,
        position: 'relative',
        verticalAlign: 'top',
      }}
    >
      <button
        onClick={handleToggleEnabled}
        style={{
          position: 'absolute',
          top: '3px',
          right: '3px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '16px',
        }}
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
            }}
          >
            <div
              style={{ fontWeight: 'bold', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <span
                ref={undefined}
                style={{ cursor: isDragging ? 'grabbing' : 'grab', color: '#999', userSelect: 'none', flexShrink: 0 }}
                title="Ziehen um zu verschieben"
                {...listeners}
                {...attributes}
              >
                ⠿
              </span>
              <span
                style={{ color: '#2196F3', cursor: 'pointer' }}
                onClick={() => setShowRecipeCard(true)}
              >
                {meal.name}
              </span>
              {meal.recipeUrl && (
                <a
                  href={meal.recipeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '14px', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                  title="Rezept-Website öffnen"
                >
                  🔗
                </a>
              )}
            </div>
          </div>
          <div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '5px' }}>
              <input
                type="number"
                min="1"
                value={editServings}
                onChange={(e) => setEditServings(parseInt(e.target.value) || 1)}
                style={{ width: '50px', padding: '2px' }}
                onClick={(e) => e.stopPropagation()}
              />
              <span>Pers.</span>
              <button
                onClick={handleSaveServings}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                }}
              >
                OK
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#666' }}>
              <span
                onClick={handleEditServings}
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
              >
                {entry.servings} Person{entry.servings !== 1 ? 'en' : ''}
              </span>
            </div>
          )}
          <button
            onClick={handleRemoveMeal}
            style={{
              marginTop: '5px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
            }}
          >
            Entfernen
          </button>
        </div>

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
  const { state, defaultServings, setDefaultServings } = useMealPlan();

  if (!state.startDate || !state.endDate) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
        Bitte wählen Sie einen Zeitraum aus, um den Plan zu erstellen.
      </div>
    );
  }

  // Group entries by date
  const dateGroups = state.entries.reduce((acc, entry) => {
    if (!acc[entry.date]) {
      acc[entry.date] = {};
    }
    acc[entry.date][entry.mealType] = entry;
    return acc;
  }, {} as Record<string, Record<string, any>>);

  const dates = Object.keys(dateGroups).sort();

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px', marginBottom: '10px' }}>
        <label style={{ fontSize: '14px', color: '#555' }}>Standard-Portionen:</label>
        <input
          type="number"
          min="1"
          value={defaultServings}
          onChange={(e) => setDefaultServings(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: '60px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center' }}
        />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#e0e0e0' }}>
            <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Datum</th>
            <th style={{ border: '1px solid #ddd', padding: '10px' }}>Frühstück</th>
            <th style={{ border: '1px solid #ddd', padding: '10px' }}>Mittagessen</th>
            <th style={{ border: '1px solid #ddd', padding: '10px' }}>Abendessen</th>
          </tr>
        </thead>
        <tbody>
          {dates.map(date => (
            <tr key={date}>
              <td style={{ border: '1px solid #ddd', padding: '10px', fontWeight: 'bold' }}>
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
