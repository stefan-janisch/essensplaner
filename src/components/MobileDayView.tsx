import React, { useState, useRef, useEffect, useCallback } from 'react';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeDetailModal, EditRecipeModal } from './RecipeManagement';
import { ExtraItemRow } from './MealPlanTable';
import type { MealType, Meal, MealPlanEntry, ExtraItem } from '../types/index.js';
import { DayNutritionDot } from './DayNutritionDot';

interface MobileDayViewProps {
  onAddRequest: (date: string, mealType: MealType) => void;
}

const MEAL_TYPES: { type: MealType; label: string }[] = [
  { type: 'breakfast', label: 'Frühstück' },
  { type: 'lunch', label: 'Mittagessen' },
  { type: 'dinner', label: 'Abendessen' },
];

function MobileMealItem({ entry, meal }: { entry: MealPlanEntry; meal: Meal }) {
  const { removeEntry, toggleEntryEnabled, updateEntryServings, toggleMealStar, updateMeal } = useMealPlan();
  const [showRecipe, setShowRecipe] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isEditingServings, setIsEditingServings] = useState(false);
  const [editServings, setEditServings] = useState(entry.servings);

  const handleSaveServings = () => {
    updateEntryServings(entry.id, editServings);
    setIsEditingServings(false);
  };

  return (
    <div className="mobile-meal-item" style={{ opacity: entry.enabled ? 1 : 0.4 }}>
      <span className="mobile-meal-item-name" onClick={() => setShowRecipe(true)}>
        {meal.name}
      </span>
      <div className="mobile-meal-item-meta">
        {meal.recipeUrl && (
          <a
            href={meal.recipeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '14px' }}
            onClick={(e) => e.stopPropagation()}
          >
            🔗
          </a>
        )}
        {isEditingServings ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              className="input"
              type="number"
              min="1"
              value={editServings}
              onChange={(e) => setEditServings(parseInt(e.target.value) || 1)}
              style={{ width: '44px', padding: '2px 4px', fontSize: '12px' }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSaveServings} style={{ padding: '2px 6px' }}>OK</button>
          </div>
        ) : (
          <span
            onClick={() => { setEditServings(entry.servings); setIsEditingServings(true); }}
            style={{ cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}
          >
            {entry.servings}P
          </span>
        )}
        <button
          className="btn-ghost"
          onClick={() => toggleEntryEnabled(entry.id)}
          style={{ fontSize: '14px', padding: '2px 4px', minHeight: 'unset' }}
        >
          {entry.enabled ? '\u2713' : '\u2717'}
        </button>
        <button
          className="btn-ghost"
          onClick={() => removeEntry(entry.id)}
          style={{ fontSize: '14px', padding: '2px 4px', color: 'var(--color-danger)', minHeight: 'unset' }}
          title="Entfernen"
        >
          {'\u2717'}
        </button>
      </div>

      {showRecipe && (
        <RecipeDetailModal
          meal={meal}
          servings={entry.servings}
          onClose={() => setShowRecipe(false)}
          onEdit={() => { setShowRecipe(false); setShowEdit(true); }}
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
}

function MobileExtrasSection() {
  const { activePlan, addExtra } = useMealPlan();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('Stück');
  const [activeCategory, setActiveCategory] = useState<ExtraItem['category']>('snacks');

  const categories: { type: ExtraItem['category']; label: string }[] = [
    { type: 'snacks', label: 'Snacks' },
    { type: 'drinks', label: 'Getränke' },
    { type: 'misc', label: 'Sonstiges' },
  ];

  const extras = (activePlan?.extras || []).filter(e => e.category === activeCategory);

  const handleAdd = () => {
    if (!name.trim()) return;
    addExtra(activeCategory, name.trim(), parseFloat(amount) || 1, unit || 'Stück');
    setName('');
    setAmount('');
    setUnit('Stück');
  };

  return (
    <div className="mobile-meal-section" style={{ marginTop: '8px' }}>
      <div className="mobile-meal-section-header">
        <div style={{ display: 'flex', gap: '6px' }}>
          {categories.map(cat => (
            <button
              key={cat.type}
              className={`pill ${activeCategory === cat.type ? 'pill-active' : ''}`}
              onClick={() => setActiveCategory(cat.type)}
              style={{ fontSize: '11px', padding: '2px 8px', minHeight: 'unset' }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mobile-meal-section-body">
        {extras.map(item => (
          <ExtraItemRow key={item.id} item={item} />
        ))}
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <input
            className="input"
            type="text"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ flex: 2, padding: '4px 8px', fontSize: '13px' }}
          />
          <input
            className="input"
            type="number"
            placeholder="Menge"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ width: '52px', padding: '4px 6px', fontSize: '13px' }}
          />
          <input
            className="input"
            type="text"
            placeholder="Einh."
            value={unit}
            onChange={e => setUnit(e.target.value)}
            onFocus={e => { const el = e.target; setTimeout(() => el.select()); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ width: '52px', padding: '4px 6px', fontSize: '13px' }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!name.trim()} style={{ padding: '4px 8px' }}>+</button>
        </div>
      </div>
    </div>
  );
}

export const MobileDayView: React.FC<MobileDayViewProps> = ({ onAddRequest }) => {
  const { activePlan, allMealsForActivePlan } = useMealPlan();
  const carouselRef = useRef<HTMLDivElement>(null);
  const hasScrolledToToday = useRef(false);

  const dates = activePlan?.startDate && activePlan?.endDate
    ? eachDayOfInterval({
        start: parseISO(activePlan.startDate),
        end: parseISO(activePlan.endDate),
      }).map(d => format(d, 'yyyy-MM-dd'))
    : [];

  // Find today's index (or 0 if not in range)
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayIndex = Math.max(0, dates.indexOf(todayStr));

  const [activeDayIndex, setActiveDayIndex] = useState(todayIndex);

  // Scroll to today on first mount
  useEffect(() => {
    if (hasScrolledToToday.current || !carouselRef.current || dates.length === 0) return;
    hasScrolledToToday.current = true;
    if (todayIndex > 0) {
      carouselRef.current.scrollTo({ left: todayIndex * carouselRef.current.clientWidth, behavior: 'instant' });
    }
  }, [dates.length, todayIndex]);

  const handleScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || dates.length === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveDayIndex(Math.max(0, Math.min(index, dates.length - 1)));
  }, [dates.length]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToDay = (index: number) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  };

  if (!activePlan || dates.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text)' }}>
        Kein Plan ausgewählt.
      </div>
    );
  }

  return (
    <div>
      {/* Day indicator dots */}
      <div className="mobile-day-dots">
        {dates.map((_, i) => (
          <button
            key={i}
            className={`mobile-day-dot ${i === activeDayIndex ? 'active' : ''}`}
            onClick={() => scrollToDay(i)}
          />
        ))}
      </div>

      {/* Swipeable day carousel */}
      <div className="mobile-day-carousel" ref={carouselRef}>
        {dates.map(date => {
          const entries = activePlan.entries || [];

          return (
            <div key={date} className="mobile-day-page">
              <div className="mobile-day-header">
                {format(parseISO(date), 'EEEE', { locale: de })}
                <span className="mobile-day-date"> {format(parseISO(date), 'dd.MM.')}</span>
                <DayNutritionDot date={date} />
              </div>

              {MEAL_TYPES.map(({ type, label }) => {
                const mealEntries = entries.filter(e => e.date === date && e.mealType === type);

                return (
                  <div key={type} className="mobile-meal-section">
                    <div className="mobile-meal-section-header">
                      <span>{label}</span>
                      <button
                        className="mobile-add-btn"
                        onClick={() => onAddRequest(date, type)}
                        title={`${label} hinzufügen`}
                      >
                        +
                      </button>
                    </div>
                    <div className="mobile-meal-section-body">
                      {mealEntries.length === 0 ? (
                        <div className="mobile-empty-slot">—</div>
                      ) : (
                        mealEntries.map(entry => {
                          const meal = allMealsForActivePlan.find(m => m.id === entry.mealId);
                          if (!meal) return null;
                          return <MobileMealItem key={entry.id} entry={entry} meal={meal} />;
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              <MobileExtrasSection />
            </div>
          );
        })}
      </div>
    </div>
  );
};
