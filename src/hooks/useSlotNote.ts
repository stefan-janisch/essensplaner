import { useRef, useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import type { MealType } from '../types/index.js';

/**
 * Kapselt die Slot-Notiz-Logik (Anzeige, Bearbeitung, Speichern) für eine
 * Datum/Mahlzeit-Kombination. Wird sowohl von der Desktop-Tabelle (MealCell)
 * als auch von der mobilen Tagesansicht (MobileMealSection) genutzt.
 */
export function useSlotNote(date: string, mealType: MealType) {
  const { activePlan, setSlotNote } = useMealPlan();

  const slotNote = (activePlan?.slotNotes || []).find(
    n => n.date === date && n.mealType === mealType
  );

  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const cancelNoteRef = useRef(false);

  const openNoteEditor = () => {
    cancelNoteRef.current = false;
    setNoteText(slotNote?.note ?? '');
    setEditingNote(true);
  };

  const saveNote = () => {
    if (cancelNoteRef.current) {
      cancelNoteRef.current = false;
      setEditingNote(false);
      return;
    }
    setSlotNote(date, mealType, noteText);
    setEditingNote(false);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNote();
    } else if (e.key === 'Escape') {
      cancelNoteRef.current = true;
      setEditingNote(false);
    }
  };

  return {
    slotNote,
    editingNote,
    noteText,
    setNoteText,
    openNoteEditor,
    saveNote,
    handleNoteKeyDown,
  };
}
