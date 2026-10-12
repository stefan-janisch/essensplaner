import { useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import { getDayEnergy } from '../utils/nutritionCalculator';
import { TRAINING_INTENSITIES, TRAINING_TYPES, trainingIcon, trainingKcal, trainingLabel, trainingsForDate } from '../utils/sportModel';
import type { TrainingIntensity, TrainingType } from '../types/index.js';
import { DayPopover } from './DayPopover';

const QUICK_MINUTES = [30, 45, 60, 90];

/**
 * 🏃 Flexible sport mode: trainings of one day, logged right in the week plan (type, intensity,
 * duration). They raise that day's kcal target; shown next to the day's ☕ chip.
 */
export function TrainingChip({ date }: { date: string }) {
  const { activePlan, flexibleSportEnabled, sport, trainings, addTraining, deleteTraining, nutritionProfile, activity } = useMealPlan();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Form defaults: the last logged training — usually the same kind again.
  const last = trainings[trainings.length - 1];
  const [type, setType] = useState<TrainingType>(last?.type ?? 'cardio');
  const [intensity, setIntensity] = useState<TrainingIntensity>(last?.intensity ?? 'moderate');
  const [minutes, setMinutes] = useState(String(last?.minutes ?? 45));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!flexibleSportEnabled || !sport || !nutritionProfile || !activePlan || activePlan.planType === 'menu') return null;

  const weight = nutritionProfile.weightKg;
  const dayTrainings = trainingsForDate(sport, date);
  const totalMinutes = dayTrainings.reduce((s, t) => s + t.minutes, 0);
  const totalKcal = dayTrainings.reduce((s, t) => s + trainingKcal(t, weight), 0);
  const measured = getDayEnergy(nutritionProfile, date, activity, sport).source === 'actual';

  const mins = Math.round(Number(minutes.replace(',', '.')));
  const valid = Number.isFinite(mins) && mins >= 1 && mins <= 600;
  const preview = valid ? trainingKcal({ type, intensity, minutes: mins }, weight) : null;

  const handleAdd = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await addTraining({ date, type, intensity, minutes: mins });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`day-persons-badge day-coffee-badge${dayTrainings.length > 0 ? ' is-set' : ''}`}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title={dayTrainings.length > 0
          ? `${dayTrainings.map(trainingLabel).join(', ')} · ≈ ${totalKcal} kcal – klicken zum Ändern`
          : 'Training eintragen'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {dayTrainings.length > 0 ? `${trainingIcon(dayTrainings[0].type)} ${totalMinutes}′` : '🏃'}
      </button>

      {open && (
        <DayPopover anchorRef={buttonRef} onClose={() => setOpen(false)} label="Training an diesem Tag" estimatedHeight={380}>
          <div className="coffee-popover-header">
            <strong>🏃 {format(parseISO(date), 'EEEEEE dd.MM.', { locale: de })}</strong>
            {totalKcal > 0 && <span>≈ {totalKcal} kcal</span>}
          </div>

          {dayTrainings.length > 0 && (
            <ul className="coffee-list">
              {dayTrainings.map(t => (
                <li key={t.id} className="coffee-row">
                  <span className="coffee-row-text">
                    <span className="coffee-row-name">{trainingIcon(t.type)} {trainingLabel(t)}</span>
                    <span className="coffee-row-meta">≈ {trainingKcal(t, weight)} kcal</span>
                  </span>
                  <button type="button" className="btn-ghost training-delete" onClick={() => deleteTraining(t.id)}
                    aria-label={`${trainingLabel(t)} löschen`} title="Löschen">✕</button>
                </li>
              ))}
            </ul>
          )}
          {measured && dayTrainings.length > 0 && (
            <p className="training-note">Apple Health hat diesen Tag gemessen – das Training steckt schon in der Messung und wird nicht zusätzlich gezählt.</p>
          )}

          <div className="training-form">
            <div className="training-seg" role="radiogroup" aria-label="Art">
              {TRAINING_TYPES.map(t => (
                <button key={t.key} type="button" role="radio" aria-checked={type === t.key}
                  className={type === t.key ? 'is-active' : ''} onClick={() => setType(t.key)}>
                  <span aria-hidden>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
            <div className="training-seg" role="radiogroup" aria-label="Intensität">
              {TRAINING_INTENSITIES.map(i => (
                <button key={i.key} type="button" role="radio" aria-checked={intensity === i.key}
                  className={intensity === i.key ? 'is-active' : ''} onClick={() => setIntensity(i.key)}>
                  {i.label}
                </button>
              ))}
            </div>
            <div className="training-minutes">
              <input className="input" type="text" inputMode="numeric" value={minutes} aria-label="Dauer in Minuten"
                onChange={e => setMinutes(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} />
              <span>min</span>
              {QUICK_MINUTES.map(m => (
                <button key={m} type="button" className={`pill${mins === m ? ' pill-active' : ''}`} onClick={() => setMinutes(String(m))}>
                  {m}
                </button>
              ))}
            </div>
            {error && <div className="quick-meal-error">{error}</div>}
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!valid || saving}>
              {saving ? 'Speichere…' : `＋ Eintragen${preview !== null ? ` · ≈ ${preview} kcal` : ''}`}
            </button>
          </div>
        </DayPopover>
      )}
    </>
  );
}
