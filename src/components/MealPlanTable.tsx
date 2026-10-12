import React, { useState, useContext } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeDetailModal, EditRecipeModal } from './RecipeManagement';
import type { MealType, Meal, MealPlanEntry, ExtraItem } from '../types/index.js';
import { DayLabel } from './DayLabel';
import { DayPersonsBadge } from './DayPersonsBadge';
import { CoffeeChip } from './CoffeeChip';
import { TrainingChip } from './TrainingChip';
import { MenuAddContext } from './PlanViewLayout';
import { useSlotNote } from '../hooks/useSlotNote';
import { useMealCellItemActions } from '../hooks/useMealCellItemActions';
import { useVisualMode } from '../hooks/useVisualMode';
import { VisualMealCell } from './VisualMealCell';
import { formatPortionWeight, portionWeightTitle } from '../utils/portionWeight';
import { ServingsInput } from './ServingsInput';

export interface MealCellItemProps {
  entry: MealPlanEntry;
  meal: Meal;
}

export const MealCellItem: React.FC<MealCellItemProps> = ({ entry, meal }) => {
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
  const portionWeightHint = portionWeightTitle(meal, entry.servings);

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
          <ServingsInput
            value={editServings}
            onChange={setEditServings}
            onSubmit={handleSaveServings}
            style={{ width: '50px', padding: '3px 6px', fontSize: '12px' }}
          />
          <span style={{ fontSize: '12px' }}>Port.</span>
          <button className="btn btn-primary btn-sm" onClick={handleSaveServings}>OK</button>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--text)', textAlign: 'center' }}>
          <span onClick={handleEditServings} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            {entry.servings.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Portion{entry.servings !== 1 ? 'en' : ''}
          </span>
          {portionWeight && (
            <span className="portion-weight" title={portionWeightHint}> · {portionWeight}</span>
          )}
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

  const { slotNote, editingNote, noteText, setNoteText, openNoteEditor, saveNote, handleNoteKeyDown } =
    useSlotNote(date, mealType);

  const { setNodeRef, isOver } = useDroppable({
    id: `${date}-${mealType}`,
    data: { date, mealType },
  });

  const noteIconButton = onAddRequest && (
    <button
      className="btn-ghost"
      onClick={openNoteEditor}
      style={{ fontSize: '13px', padding: '0 4px', opacity: 0.5 }}
      title="Notiz hinzufügen"
    >
      📝
    </button>
  );

  const noteDisplay = slotNote && !editingNote && (
    <div
      onClick={openNoteEditor}
      style={{ fontSize: '12px', color: 'var(--color-muted)', fontStyle: 'italic', cursor: 'pointer', marginBottom: '4px', whiteSpace: 'pre-wrap' }}
      title="Notiz bearbeiten"
    >
      📝 {slotNote.note}
    </div>
  );

  const noteEditor = editingNote && (
    <input
      className="input"
      type="text"
      autoFocus
      value={noteText}
      placeholder="Notiz…"
      onChange={e => setNoteText(e.target.value)}
      onKeyDown={handleNoteKeyDown}
      onBlur={saveNote}
      style={{ width: '100%', padding: '3px 6px', fontSize: '12px', marginBottom: '4px' }}
    />
  );

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
      {noteDisplay}
      {noteEditor}
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '8px', fontSize: '13px' }}>
          {isSlotDisabled ? (
            <span style={{ color: 'var(--text)', cursor: 'pointer' }} onClick={() => toggleSlotDisabled(date, mealType)} title="Slot aktivieren">✗</span>
          ) : (
            <>
              <div style={{ color: 'var(--text)', opacity: 0.3, cursor: 'pointer' }} onClick={() => toggleSlotDisabled(date, mealType)} title="Slot deaktivieren">—</div>
              {onAddRequest && (
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                  <button className="btn-ghost" onClick={() => onAddRequest(date, mealType)} style={{ color: 'var(--accent)', fontSize: '14px', padding: '0 4px', opacity: 0.5 }} title="Rezept hinzufügen">+</button>
                  {noteIconButton}
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
            <div style={{ textAlign: 'center', marginTop: '4px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
              <button className="btn-ghost" onClick={() => onAddRequest(date, mealType)} style={{ color: 'var(--accent)', fontSize: '14px', padding: '0 4px', opacity: 0.5 }} title="Weiteres Rezept hinzufügen">+</button>
              {noteIconButton}
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
  const [visualMode] = useVisualMode();

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
      {visualMode ? (
        <div className="visual-plan-grid">
          <div className="visual-plan-grid-header-cell">Datum</div>
          <div className="visual-plan-grid-header-cell">Frühstück</div>
          <div className="visual-plan-grid-header-cell">Mittagessen</div>
          <div className="visual-plan-grid-header-cell">Abendessen</div>
          <div className="visual-plan-grid-header-cell">Snacks</div>
          {dates.map(date => (
            <React.Fragment key={date}>
              <div className="visual-day-label">
                <DayLabel date={date} layout="stacked" />
                <span className="day-badges">
                  <DayPersonsBadge date={date} />
                  <CoffeeChip date={date} />
                  <TrainingChip date={date} />
                </span>
              </div>
              <VisualMealCell date={date} mealType="breakfast" />
              <VisualMealCell date={date} mealType="lunch" />
              <VisualMealCell date={date} mealType="dinner" />
              <VisualMealCell date={date} mealType="snacks" />
            </React.Fragment>
          ))}
        </div>
      ) : (
        <table className="meal-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Frühstück</th>
              <th>Mittagessen</th>
              <th>Abendessen</th>
              <th>Snacks</th>
            </tr>
          </thead>
          <tbody>
            {dates.map(date => (
              <tr key={date}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '12px', lineHeight: 1.4 }}>
                  <DayLabel date={date} layout="stacked" />
                  <span className="day-badges">
                    <DayPersonsBadge date={date} />
                    <CoffeeChip date={date} />
                    <TrainingChip date={date} />
                  </span>
                </td>
                <MealCell date={date} mealType="breakfast" />
                <MealCell date={date} mealType="lunch" />
                <MealCell date={date} mealType="dinner" />
                <MealCell date={date} mealType="snacks" />
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="extras-caption">Für den ganzen Plan — nur Einkaufsliste, ohne Nährwerte</div>
      <table className="meal-table" style={{ marginTop: '6px' }}>
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
