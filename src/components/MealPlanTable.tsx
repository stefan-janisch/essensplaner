import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeDetailModal } from './RecipeManagement';
import type { MealType, Meal, MealPlanEntry } from '../types/index.js';

interface MealCellItemProps {
  entry: MealPlanEntry;
  meal: Meal;
}

const MealCellItem: React.FC<MealCellItemProps> = ({ entry, meal }) => {
  const { removeEntry, toggleEntryEnabled, updateEntryServings } = useMealPlan();
  const [isEditing, setIsEditing] = useState(false);
  const [editServings, setEditServings] = useState(entry.servings);
  const [showRecipeCard, setShowRecipeCard] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry:${entry.id}`,
    data: { entryId: entry.id, meal, sourceDate: entry.date, sourceMealType: entry.mealType },
    disabled: !entry.enabled,
  });

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEntry(entry.id);
  };

  const handleToggleEnabled = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEntryEnabled(entry.id);
  };

  const handleEditServings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditServings(entry.servings);
    setIsEditing(true);
  };

  const handleSaveServings = () => {
    updateEntryServings(entry.id, editServings);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...dragStyle,
        opacity: isDragging ? 0.5 : entry.enabled ? 1 : 0.4,
        marginBottom: '4px',
        padding: '4px 0',
        borderBottom: '1px solid var(--border-light)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1.3 }}>
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
        <button
          className="btn-ghost"
          onClick={handleToggleEnabled}
          style={{ fontSize: '12px', padding: '1px 4px', flexShrink: 0 }}
          title={entry.enabled ? 'Deaktivieren' : 'Aktivieren'}
        >
          {entry.enabled ? '✓' : '✗'}
        </button>
      </div>
      {isEditing ? (
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
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
          <button className="btn btn-primary btn-sm" onClick={handleSaveServings}>OK</button>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--text)', textAlign: 'center' }}>
          <span onClick={handleEditServings} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            {entry.servings} Person{entry.servings !== 1 ? 'en' : ''}
          </span>
          {' · '}
          <span onClick={handleRemove} style={{ cursor: 'pointer', color: 'var(--color-danger)' }}>
            Entfernen
          </span>
        </div>
      )}

      {showRecipeCard && (
        <RecipeDetailModal
          meal={meal}
          servings={entry.servings}
          onClose={() => setShowRecipeCard(false)}
        />
      )}
    </div>
  );
};

interface MealCellProps {
  date: string;
  mealType: MealType;
}

const MealCell: React.FC<MealCellProps> = ({ date, mealType }) => {
  const { allMealsForActivePlan, activePlan } = useMealPlan();

  const entries = (activePlan?.entries || []).filter(
    e => e.date === date && e.mealType === mealType
  );

  const { setNodeRef, isOver } = useDroppable({
    id: `${date}-${mealType}`,
    data: { date, mealType },
  });

  return (
    <td
      ref={setNodeRef}
      style={{
        minHeight: '80px',
        backgroundColor: isOver ? 'var(--surface-drop)' : undefined,
        position: 'relative',
        verticalAlign: 'top',
      }}
    >
      {entries.length === 0 ? (
        <div style={{ color: 'var(--text)', opacity: 0.3, textAlign: 'center', padding: '8px', fontSize: '13px' }}>
          —
        </div>
      ) : (
        entries.map(entry => {
          const meal = allMealsForActivePlan.find(m => m.id === entry.mealId);
          if (!meal) return null;
          return <MealCellItem key={entry.id} entry={entry} meal={meal} />;
        })
      )}
    </td>
  );
};

export const MealPlanTable: React.FC = () => {
  const { activePlan } = useMealPlan();

  if (!activePlan) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text)' }}>
        Bitte wählen Sie einen Zeitraum aus, um den Plan zu erstellen.
      </div>
    );
  }

  // Derive dates from plan's date range
  const dates = activePlan.startDate && activePlan.endDate
    ? eachDayOfInterval({
        start: parseISO(activePlan.startDate),
        end: parseISO(activePlan.endDate),
      }).map(d => format(d, 'yyyy-MM-dd'))
    : [];

  return (
    <div style={{ overflowX: 'auto' }}>
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
