import React, { useState, useContext } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeDetailModal, EditRecipeModal } from './RecipeManagement';
import type { MealType, Meal, MealPlanEntry, ExtraItem } from '../types/index.js';
import { DayNutritionDot } from './DayNutritionDot';
import { MenuAddContext } from './PlanViewLayout';

export interface MealCellItemProps {
  entry: MealPlanEntry;
  meal: Meal;
}

export const MealCellItem: React.FC<MealCellItemProps> = ({ entry, meal }) => {
  const { removeEntry, toggleEntryEnabled, updateEntryServings, toggleMealStar, updateMeal } = useMealPlan();
  const [isEditing, setIsEditing] = useState(false);
  const [editServings, setEditServings] = useState(entry.servings);
  const [showRecipeCard, setShowRecipeCard] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

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
            onChange={(e) => setEditServings(parseFloat(e.target.value) || 0)}
            onBlur={() => { if (!editServings) setEditServings(1); }}
            style={{ width: '50px', padding: '3px 6px', fontSize: '12px' }}
            onClick={(e) => e.stopPropagation()}
          />
          <span style={{ fontSize: '12px' }}>Port.</span>
          <button className="btn btn-primary btn-sm" onClick={handleSaveServings}>OK</button>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--text)', textAlign: 'center' }}>
          <span onClick={handleEditServings} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            {entry.servings} Portion{entry.servings !== 1 ? 'en' : ''}
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

interface MealCellProps {
  date: string;
  mealType: MealType;
}

const MealCell: React.FC<MealCellProps> = ({ date, mealType }) => {
  const { allMealsForActivePlan, activePlan, toggleSlotDisabled } = useMealPlan();
  const onAddRequest = useContext(MenuAddContext);

  const entries = (activePlan?.entries || []).filter(
    e => e.date === date && e.mealType === mealType
  );

  const isSlotDisabled = (activePlan?.disabledSlots || []).some(
    s => s.date === date && s.mealType === mealType
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
        opacity: entries.length === 0 && isSlotDisabled ? 0.4 : undefined,
      }}
    >
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '8px', fontSize: '13px' }}>
          {isSlotDisabled ? (
            <span style={{ color: 'var(--text)', cursor: 'pointer' }} onClick={() => toggleSlotDisabled(date, mealType)} title="Slot aktivieren">✗</span>
          ) : (
            <>
              <div style={{ color: 'var(--text)', opacity: 0.3, cursor: 'pointer' }} onClick={() => toggleSlotDisabled(date, mealType)} title="Slot deaktivieren">—</div>
              {onAddRequest && (
                <div style={{ marginTop: '4px' }}>
                  <button className="btn-ghost" onClick={() => onAddRequest(date, mealType)} style={{ color: 'var(--accent)', fontSize: '14px', padding: '0 4px', opacity: 0.5 }} title="Rezept hinzufügen">+</button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {entries.map(entry => {
            const meal = allMealsForActivePlan.find(m => m.id === entry.mealId);
            if (!meal) return null;
            return <MealCellItem key={entry.id} entry={entry} meal={meal} />;
          })}
          {onAddRequest && (
            <div style={{ textAlign: 'center', marginTop: '4px' }}>
              <button className="btn-ghost" onClick={() => onAddRequest(date, mealType)} style={{ color: 'var(--accent)', fontSize: '14px', padding: '0 4px', opacity: 0.5 }} title="Weiteres Rezept hinzufügen">+</button>
            </div>
          )}
        </>
      )}
    </td>
  );
};

export const ExtraItemRow: React.FC<{ item: ExtraItem }> = ({ item }) => {
  const { updateExtra, removeExtra } = useMealPlan();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px',
      padding: '3px 0', borderBottom: '1px solid var(--border-light)',
      opacity: item.enabled ? 1 : 0.4,
    }}>
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{item.name}</span>
      <span style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {item.amount} {item.unit}
      </span>
      <button
        className="btn-ghost"
        onClick={() => updateExtra(item.id, { enabled: !item.enabled })}
        style={{ fontSize: '12px', padding: '1px 4px', flexShrink: 0 }}
        title={item.enabled ? 'Deaktivieren' : 'Aktivieren'}
      >
        {item.enabled ? '✓' : '✗'}
      </button>
      <button
        className="btn-ghost"
        onClick={() => removeExtra(item.id)}
        style={{ fontSize: '12px', padding: '1px 4px', flexShrink: 0, color: 'var(--color-danger)' }}
        title="Entfernen"
      >
        ✗
      </button>
    </div>
  );
};

const ExtrasCell: React.FC<{ category: ExtraItem['category'] }> = ({ category }) => {
  const { activePlan, addExtra, allMealsForActivePlan } = useMealPlan();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('Stück');

  const extras = (activePlan?.extras || []).filter(e => e.category === category);

  // Also show meal cards dropped into this category
  const entries = (activePlan?.entries || []).filter(
    e => e.date === '_extras' && e.mealType === category
  );

  const { setNodeRef, isOver } = useDroppable({
    id: `_extras-${category}`,
    data: { date: '_extras', mealType: category },
  });

  const handleAdd = () => {
    if (!name.trim()) return;
    addExtra(category, name.trim(), parseFloat(amount) || 1, unit || 'Stück');
    setName('');
    setAmount('');
    setUnit('Stück');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <td
      ref={setNodeRef}
      style={{
        minHeight: '80px',
        backgroundColor: isOver ? 'var(--surface-drop)' : undefined,
        verticalAlign: 'top',
      }}
    >
      {entries.map(entry => {
        const meal = allMealsForActivePlan.find(m => m.id === entry.mealId);
        if (!meal) return null;
        return <MealCellItem key={entry.id} entry={entry} meal={meal} />;
      })}

      {extras.map(item => (
        <ExtraItemRow key={item.id} item={item} />
      ))}

      <div style={{ display: 'flex', gap: '3px', marginTop: '6px' }}>
        <input
          className="input"
          type="text"
          placeholder="Bezeichnung"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 2, padding: '3px 6px', fontSize: '12px' }}
        />
        <input
          className="input"
          type="number"
          placeholder="Menge"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ width: '50px', minWidth: '50px', padding: '3px 6px', fontSize: '12px' }}
        />
        <input
          className="input"
          type="text"
          placeholder="Einh."
          value={unit}
          onChange={e => setUnit(e.target.value)}
          onFocus={e => { const el = e.target; setTimeout(() => el.select()); }}
          onKeyDown={handleKeyDown}
          style={{ width: '50px', minWidth: '50px', padding: '3px 6px', fontSize: '12px' }}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleAdd}
          disabled={!name.trim()}
          style={{ padding: '3px 8px', fontSize: '12px' }}
        >
          +
        </button>
      </div>
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
              <td style={{ whiteSpace: 'nowrap', fontSize: '12px', lineHeight: 1.4 }}>
                <div style={{ fontWeight: 600 }}>{format(parseISO(date), 'EEEE', { locale: de })}</div>
                <div style={{ color: 'var(--text)' }}>{format(parseISO(date), 'dd.MM.yyyy')}</div>
                <DayNutritionDot date={date} />
              </td>
              <MealCell date={date} mealType="breakfast" />
              <MealCell date={date} mealType="lunch" />
              <MealCell date={date} mealType="dinner" />
            </tr>
          ))}
        </tbody>
      </table>

      <table className="meal-table" style={{ marginTop: '24px' }}>
        <thead>
          <tr>
            <th>Snacks</th>
            <th>Getränke</th>
            <th>Sonstiges</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <ExtrasCell category="snacks" />
            <ExtrasCell category="drinks" />
            <ExtrasCell category="misc" />
          </tr>
        </tbody>
      </table>
    </div>
  );
};
