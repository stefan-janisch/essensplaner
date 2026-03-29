import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import { MealCellItem, ExtraItemRow } from './MealPlanTable';
import type { MenuCourse } from '../types/index.js';

type MenuColumnType = 'food' | 'drinks';

const MenuExtrasCell: React.FC<{ courseId: number; columnType: MenuColumnType }> = ({ courseId, columnType }) => {
  const { activePlan, addExtra, allMealsForActivePlan } = useMealPlan();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('Stück');

  const courseDate = `course_${courseId}`;

  const entries = (activePlan?.entries || []).filter(
    e => e.date === courseDate && e.mealType === columnType
  );

  const extras = (activePlan?.extras || []).filter(
    e => e.courseId === courseId && e.category === columnType
  );

  const { setNodeRef, isOver } = useDroppable({
    id: `${courseDate}-${columnType}`,
    data: { date: courseDate, mealType: columnType },
  });

  const handleAdd = () => {
    if (!name.trim()) return;
    addExtra(columnType, name.trim(), parseFloat(amount) || 1, unit || 'Stück', courseId);
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

const CommentCell: React.FC<{ course: MenuCourse }> = ({ course }) => {
  const { updateCourse } = useMealPlan();
  const [value, setValue] = useState(course.comment);

  // Sync if course changes externally
  React.useEffect(() => {
    setValue(course.comment);
  }, [course.comment]);

  const handleBlur = () => {
    if (value !== course.comment) {
      updateCourse(course.id, { comment: value });
    }
  };

  return (
    <td style={{ verticalAlign: 'top' }}>
      <textarea
        className="input"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Notizen..."
        style={{ width: '100%', minHeight: '60px', padding: '6px', fontSize: '13px', resize: 'vertical' }}
      />
    </td>
  );
};

const CourseLabel: React.FC<{ course: MenuCourse }> = ({ course }) => {
  const { updateCourse, removeCourse } = useMealPlan();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.label);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== course.label) {
      updateCourse(course.id, { label: trimmed });
    }
    setEditing(false);
  };

  return (
    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {editing ? (
          <input
            className="input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            style={{ width: '80px', padding: '2px 4px', fontSize: '12px' }}
          />
        ) : (
          <span
            style={{ cursor: 'pointer', fontWeight: 600 }}
            onClick={() => { setValue(course.label); setEditing(true); }}
            title="Klicken zum Umbenennen"
          >
            {course.label}
          </span>
        )}
        <button
          className="btn-ghost"
          onClick={() => removeCourse(course.id)}
          style={{ fontSize: '12px', padding: '1px 4px', color: 'var(--color-danger)', flexShrink: 0 }}
          title="Gang entfernen"
        >
          ✗
        </button>
      </div>
    </td>
  );
};

export const MenuPlanTable: React.FC = () => {
  const { activePlan, addCourse } = useMealPlan();

  if (!activePlan) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text)' }}>
        Bitte wählen Sie einen Menüplan aus.
      </div>
    );
  }

  const courses = (activePlan.courses || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="meal-table">
        <thead>
          <tr>
            <th>Gang</th>
            <th>Essen</th>
            <th>Getränke</th>
            <th>Kommentar</th>
          </tr>
        </thead>
        <tbody>
          {courses.map(course => (
            <tr key={course.id}>
              <CourseLabel course={course} />
              <MenuExtrasCell courseId={course.id} columnType="food" />
              <MenuExtrasCell courseId={course.id} columnType="drinks" />
              <CommentCell course={course} />
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn btn-muted btn-sm"
        onClick={addCourse}
        style={{ marginTop: '12px' }}
      >
        + Gang hinzufügen
      </button>
    </div>
  );
};
