import React, { useContext, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import type { MealType } from '../types/index.js';
import { MenuAddContext } from './PlanViewLayout';
import { useSlotNote } from '../hooks/useSlotNote';
import { VisualMealCellItem } from './VisualMealCellItem';
import { VisualMealSlotOverflowModal } from './VisualMealSlotOverflowModal';

export interface VisualMealCellProps {
  date: string;
  mealType: MealType;
}

export const VisualMealCell: React.FC<VisualMealCellProps> = ({ date, mealType }) => {
  const { allMealsForActivePlan, activePlan, toggleSlotDisabled } = useMealPlan();
  const onAddRequest = useContext(MenuAddContext);
  const [showOverflow, setShowOverflow] = useState(false);

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

  const primaryEntry = entries.find(e => e.enabled) || entries[0];
  const primaryMeal = primaryEntry ? allMealsForActivePlan.find(m => m.id === primaryEntry.mealId) : undefined;

  const noteBadge = slotNote && !editingNote && (
    <button
      className="visual-meal-slot-note-badge"
      onClick={(e) => { e.stopPropagation(); openNoteEditor(); }}
      title={slotNote.note}
    >
      📝
    </button>
  );

  const noteEditor = editingNote && (
    <div className="visual-meal-slot-note-popover" onClick={(e) => e.stopPropagation()}>
      <input
        className="input"
        type="text"
        autoFocus
        value={noteText}
        placeholder="Notiz…"
        onChange={e => setNoteText(e.target.value)}
        onKeyDown={handleNoteKeyDown}
        onBlur={saveNote}
        style={{ width: '100%', padding: '3px 6px', fontSize: '12px' }}
      />
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className="visual-meal-slot"
      style={{
        backgroundColor: isOver ? 'var(--surface-drop)' : undefined,
      }}
    >
      {entries.length === 0 || !primaryMeal ? (
        <div className="visual-meal-slot-empty" style={{ opacity: isSlotDisabled ? 0.4 : undefined }}>
          {isSlotDisabled ? (
            <span
              style={{ cursor: 'pointer', fontSize: '20px' }}
              onClick={() => toggleSlotDisabled(date, mealType)}
              title="Slot aktivieren"
            >
              ✗
            </span>
          ) : (
            <>
              <span
                style={{ cursor: 'pointer', opacity: 0.3, fontSize: '20px' }}
                onClick={() => toggleSlotDisabled(date, mealType)}
                title="Slot deaktivieren"
              >
                —
              </span>
              {onAddRequest && (
                <button
                  className="btn-ghost"
                  onClick={() => onAddRequest(date, mealType)}
                  style={{ color: 'var(--accent)', fontSize: '20px', padding: '0 4px', opacity: 0.5 }}
                  title="Rezept hinzufügen"
                >
                  +
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <VisualMealCellItem
            entry={primaryEntry}
            meal={primaryMeal}
            onAddAnother={onAddRequest ? () => onAddRequest(date, mealType) : undefined}
          />
          {entries.length > 1 && (
            <button
              className="visual-meal-card-overflow-badge"
              onClick={(e) => { e.stopPropagation(); setShowOverflow(true); }}
              title="Weitere Gerichte in diesem Slot anzeigen"
            >
              +{entries.length - 1}
            </button>
          )}
        </>
      )}

      {noteBadge}
      {noteEditor}

      {showOverflow && (
        <VisualMealSlotOverflowModal
          date={date}
          mealType={mealType}
          entries={entries}
          onClose={() => setShowOverflow(false)}
        />
      )}
    </div>
  );
};
