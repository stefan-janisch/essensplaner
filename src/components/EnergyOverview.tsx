import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { calculateNutrition, getDayEnergy, goalAdjustment } from '../utils/nutritionCalculator';
import { TEF, weekdayOf } from '../utils/activityModel';
import type { ActivityModel } from '../utils/activityModel';
import { trainingLabel, trainingsForDate } from '../utils/sportModel';
import type { SportModel } from '../utils/sportModel';
import type { DayType, NutritionProfile } from '../types/index.js';

const DAY_TYPE_NAMES: Record<DayType, string> = { strength: 'Krafttag', cardio: 'Ausdauertag', rest: 'Ruhetag' };
const GOAL_NAMES = { bulk: 'Aufbau', maintain: 'Erhaltung', cut: 'Abnehmen' } as const;

const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
const signed = (n: number) => `${n >= 0 ? '+' : '−'} ${fmt(Math.abs(n))}`;

type Row = { label: string; value: string; hint?: string };

/**
 * „So entsteht dein Tagesbedarf“: which sources are active (training mode, Apple Health, goal),
 * today's target as a short calculation, and which rule applies to which days. Read-only — it
 * explains the methods in nutritionCalculator.ts, it does not add one.
 */
export function EnergyOverview({ profile, today, activity, sport }: {
  profile: NutritionProfile;
  today: string;
  activity: ActivityModel | null;
  sport: SportModel | null;
}) {
  const calc = calculateNutrition(profile, sport);
  const energy = getDayEnergy(profile, today, activity, sport);
  const goal = goalAdjustment(profile);
  const flexible = !!sport;

  const rows: Row[] = [];
  if (energy.source === 'actual' || energy.source === 'weekday') {
    const base = Math.round(calc.bmr * (1 + TEF));
    rows.push({ label: 'Grundumsatz + Verdauung', value: fmt(base) });
    rows.push({
      label: energy.source === 'actual' ? 'Aktive kcal (gemessen)' : 'Aktive kcal (Ø dieses Wochentags)',
      value: signed(energy.tdee - base),
      hint: `${fmt(energy.activeKcal ?? 0)} kcal × ${Math.round((activity?.factor ?? 1) * 100)} %${energy.samples ? ` · ${energy.samples} Messtage` : ''}`,
    });
  } else if (energy.source === 'training') {
    const todays = sport ? trainingsForDate(sport, today) : [];
    rows.push({ label: 'Grundbedarf (Grundumsatz × Alltag)', value: fmt(calc.tdee) });
    rows.push({
      label: 'Training heute',
      value: signed(energy.trainingKcal ?? 0),
      hint: todays.length > 0 ? todays.map(trainingLabel).join(', ') : 'nichts eingetragen – im Plan über 🏃',
    });
  } else {
    const dayType = profile.weekDayTypes[weekdayOf(today)];
    rows.push({ label: 'Grundbedarf inkl. Ø Training', value: fmt(calc.tdee), hint: 'Alltag + Trainings laut Wochenplan, auf 7 Tage verteilt' });
    rows.push({ label: DAY_TYPE_NAMES[dayType], value: signed(energy.tdee - calc.tdee) });
  }
  rows.push({ label: `Ziel: ${GOAL_NAMES[profile.goal]}`, value: signed(energy.targetKcal - energy.tdee) });

  const rules: { when: string; how: string }[] = [];
  if (activity) {
    rules.push({
      when: 'Vergangene Tage mit Messung',
      how: flexible ? 'gemessene aktive kcal – das Training steckt schon drin' : 'gemessene aktive kcal',
    });
    rules.push({
      when: 'Heute & kommende Tage',
      how: flexible
        ? 'Grundbedarf + die im Plan eingetragenen Trainings'
        : 'Ø dieses Wochentags aus Apple Health (ab 2 Messtagen), sonst Wochenplan',
    });
  } else {
    rules.push({
      when: 'Jeder Tag',
      how: flexible
        ? 'Grundbedarf + die im Plan eingetragenen Trainings'
        : 'Grundbedarf + Ø Training laut Wochenplan, angepasst nach Tagestyp (Ruhetag −10 %, Ausdauertag +5 %)',
    });
  }

  return (
    <div className="energy-overview">
      <div className="energy-overview-title">So entsteht dein Tagesbedarf</div>
      <div className="energy-overview-modes">
        <span className="energy-mode">{flexible ? '🏃 Training flexibel im Plan' : '📅 Fester Wochenplan'}</span>
        <span className={`energy-mode${activity ? '' : ' is-off'}`}>
          ❤ Apple Health {activity ? `an · ${Math.round(activity.factor * 100)} %` : 'aus'}
        </span>
        <span className="energy-mode">
          🎯 {GOAL_NAMES[profile.goal]}{goal !== 0 && ` ${signed(goal)} kcal`}
        </span>
      </div>

      <div className="energy-today">
        <div className="energy-today-head">Heute, {format(parseISO(today), 'EEEEEE dd.MM.', { locale: de })}</div>
        {rows.map(r => (
          <div key={r.label} className="energy-row">
            <span>
              {r.label}
              {r.hint && <small>{r.hint}</small>}
            </span>
            <span className="energy-row-value">{r.value}</span>
          </div>
        ))}
        <div className="energy-row energy-row-total">
          <span>Tagesziel</span>
          <span className="energy-row-value">{fmt(energy.targetKcal)} kcal</span>
        </div>
      </div>

      <ul className="energy-rules">
        {rules.map(r => (
          <li key={r.when}><strong>{r.when}:</strong> {r.how}</li>
        ))}
      </ul>
    </div>
  );
}
