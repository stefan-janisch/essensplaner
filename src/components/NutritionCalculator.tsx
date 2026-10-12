import { useState, useMemo, useEffect, useRef } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { calculateNutrition, calculateDayAdjustment, goalAdjustment, countSessionsFromWeek, getDayEnergy, getDayTargets, isHealthSource } from '../utils/nutritionCalculator';
import type { SportModel } from '../utils/sportModel';
import { nextDateForWeekday } from '../utils/activityModel';
import type { ActivityModel } from '../utils/activityModel';
import { AppleHealthSettings } from './AppleHealthSettings';
import { EnergyOverview } from './EnergyOverview';
import type { NutritionProfile, DayType, WeekDayTypes, CalculatedNutrition } from '../types/index.js';
import { MICRO_REFERENCES, getMicroReference, normalizeSupplementedMicros } from '../utils/microReference';
import type { MicroKeyName } from '../utils/microReference';
import { DEFAULT_NUTRITION_PROFILE } from '../types/index.js';

const ACTIVITY_LABELS = {
  sedentary: 'Sitzend (Büroarbeit)',
  lightly_active: 'Leicht aktiv (1-2x Sport/Woche)',
  moderate: 'Moderat aktiv (3-5x Sport/Woche)',
  very_active: 'Sehr aktiv (6-7x Sport/Woche)',
} as const;

const INTENSITY_LABELS = { light: 'Leicht', moderate: 'Moderat', intense: 'Intensiv' } as const;
const GOAL_LABELS = { bulk: 'Aufbau', maintain: 'Erhaltung', cut: 'Abnehmen' } as const;
const DAY_LABELS: Record<string, string> = { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' };
const DAY_TYPE_LABELS: Record<DayType, string> = { strength: 'Kraft', cardio: 'Ausdauer', rest: 'Ruhe' };
const DAY_TYPE_COLORS: Record<DayType, string> = { strength: '#4dabf7', cardio: '#51cf66', rest: '#dee2e6' };
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// ~7700 kcal per kg of body fat; average month = 30.44 days.
const monthlyWeightChangeKg = (dailyKcal: number) => Math.abs(dailyKcal) * 30.44 / 7700;

/**
 * The average of the coming seven day targets — exactly what the week plan shows per day — so the
 * summary matches it (weekday factors, Apple Health). `fromHealth`: at least one day is measured.
 */
function weekAverage(profile: NutritionProfile, today: string, activity: ActivityModel | null, sport: SportModel | null) {
  const dates = WEEK_DAYS.map(day => nextDateForWeekday(today, day));
  const energies = dates.map(date => getDayEnergy(profile, date, activity, sport));
  const targets = dates.map(date => getDayTargets(profile, date, activity, sport));
  const avg = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    tdee: avg(energies.map(e => e.tdee)),
    targetKcal: avg(targets.map(t => t.kcal)),
    proteinG: avg(targets.map(t => t.protein)),
    carbsG: avg(targets.map(t => t.carbs)),
    fatG: avg(targets.map(t => t.fat)),
    fromHealth: energies.some(isHealthSource),
  };
}

function MacroDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const total = protein + carbs + fat;
  if (total === 0) return null;
  const r = 40, cx = 50, cy = 50, circumference = 2 * Math.PI * r;
  const pPct = protein / total, cPct = carbs / total, fPct = fat / total;
  const pLen = pPct * circumference, cLen = cPct * circumference, fLen = fPct * circumference;

  return (
    <svg viewBox="0 0 100 100" className="macro-donut">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e9ecef" strokeWidth="14" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ff6b6b" strokeWidth="14"
        strokeDasharray={`${fLen} ${circumference - fLen}`}
        strokeDashoffset={0} transform="rotate(-90 50 50)" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffd43b" strokeWidth="14"
        strokeDasharray={`${cLen} ${circumference - cLen}`}
        strokeDashoffset={-fLen} transform="rotate(-90 50 50)" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4dabf7" strokeWidth="14"
        strokeDasharray={`${pLen} ${circumference - pLen}`}
        strokeDashoffset={-(fLen + cLen)} transform="rotate(-90 50 50)" />
    </svg>
  );
}

function ResultsPanel({ calc: base, profile, today, activity, sport, onToggleSupplement }: {
  calc: CalculatedNutrition;
  profile: NutritionProfile;
  today: string;
  activity: ActivityModel | null;
  sport: SportModel | null;
  onToggleSupplement: (key: MicroKeyName) => void;
}) {
  const formula = profile.bodyFatPercent ? 'Katch-McArdle' : 'Harris-Benedict';
  const week = weekAverage(profile, today, activity, sport);
  const calc = { ...base, ...week, proteinKcal: week.proteinG * 4, carbsKcal: week.carbsG * 4, fatKcal: week.fatG * 9 };
  const weekLabel = <><br />Ø 7 Tage</>;
  const microRefs = getMicroReference(profile);
  const supplementedSet = new Set(normalizeSupplementedMicros(profile.supplementedMicros));
  return (
    <div className="calc-results">
      <div className="calc-results-header">
        <h4><span className="calc-step">5</span>Ergebnis</h4>
        <span className="calc-formula-badge">{formula}</span>
      </div>
      <p className="calc-hint" style={{ marginTop: '-8px' }}>
        Durchschnitt der nächsten 7 Tage{week.fromHealth && ' (mit Apple Health ❤)'} – einzelne Tage weichen je nach
        Training und Messung ab, siehe Tagesziel oben.
      </p>

      <div className="calc-energy-cards">
        <div className="calc-card">
          <div className="calc-card-value">{calc.bmr}</div>
          <div className="calc-card-label">Grundumsatz (BMR)</div>
        </div>
        <div className="calc-card">
          <div className="calc-card-value">{calc.tdee}</div>
          <div className="calc-card-label">Gesamtumsatz (TDEE){weekLabel}</div>
        </div>
        <div className="calc-card calc-card-accent">
          <div className="calc-card-value">{calc.targetKcal}</div>
          <div className="calc-card-label">Ziel-Kalorien{weekLabel}</div>
        </div>
      </div>

      <div className="calc-macros">
        <div className="calc-macro-chart">
          <MacroDonut protein={calc.proteinKcal} carbs={calc.carbsKcal} fat={calc.fatKcal} />
          <div className="calc-macro-legend">
            <span><i style={{ background: '#4dabf7' }} /> Protein</span>
            <span><i style={{ background: '#ffd43b' }} /> Kohlenhydrate</span>
            <span><i style={{ background: '#ff6b6b' }} /> Fett</span>
          </div>
        </div>
        <div className="calc-macro-table">
          <div className="calc-macro-row">
            <span>Protein</span>
            <strong>{calc.proteinG}g</strong>
            <span className="calc-macro-kcal">{calc.proteinKcal} kcal</span>
          </div>
          <div className="calc-macro-row">
            <span>Kohlenhydrate</span>
            <strong>{calc.carbsG}g</strong>
            <span className="calc-macro-kcal">{calc.carbsKcal} kcal</span>
          </div>
          <div className="calc-macro-row">
            <span>Fett</span>
            <strong>{calc.fatG}g</strong>
            <span className="calc-macro-kcal">{calc.fatKcal} kcal</span>
          </div>
          <div className="calc-macro-row" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
            <span>Ballaststoffe</span>
            <strong>{calc.fiberG}g</strong>
            <span className="calc-macro-kcal" />
          </div>
        </div>
      </div>

      <div className="calc-extras">
        <div className="calc-extra-row">
          <span>Wasser</span><strong>{calc.waterL} L/Tag</strong>
        </div>
        <h5>Mikronährstoffe <span style={{ fontWeight: 400, fontSize: '11px' }}>(Tagesreferenz – supplementierte abhaken)</span></h5>
        <div className="calc-micro-grid">
          {MICRO_REFERENCES.map(({ key, label, unit }) => {
            const supplemented = supplementedSet.has(key);
            return (
              <label key={key} className="calc-micro-item" style={{ opacity: supplemented ? 0.4 : 1 }}>
                <input type="checkbox" checked={supplemented} onChange={() => onToggleSupplement(key)} />
                <span>{label}: <strong>{supplemented ? '–' : `${microRefs[key].toLocaleString('de-DE')} ${unit}`}</strong></span>
                {supplemented && <span className="calc-supplement-badge">Supplement</span>}
              </label>
            );
          })}
        </div>
        <p className="calc-micro-note">
          Dieselben Referenzwerte nutzen Tages-Score und Monatsbericht. Supplementierte Nährstoffe zählen dort nicht
          mit und werden nie als Mangel gemeldet.
        </p>
      </div>
    </div>
  );
}

function WeekEditor({ profile, calc, activity, onChange }: {
  profile: NutritionProfile;
  calc: CalculatedNutrition;
  activity: ActivityModel | null;
  onChange: (w: WeekDayTypes) => void;
}) {
  const days = WEEK_DAYS;
  const types: DayType[] = ['strength', 'cardio', 'rest'];

  // Per weekday: the Apple Health rolling average where there is enough data, else the day-type estimate.
  const dayValues = (day: typeof days[number]) => {
    const dt = profile.weekDayTypes[day];
    const adj = calculateDayAdjustment(calc, dt);
    if (!activity) return { adj, energy: null };
    const date = nextDateForWeekday(activity.today, day);
    const energy = getDayEnergy(profile, date, activity);
    if (energy.source === 'profile') return { adj, energy: null };
    const t = getDayTargets(profile, date, activity);
    return { adj: { targetKcal: t.kcal, proteinG: t.protein, carbsG: t.carbs, fatG: t.fat, hint: adj.hint }, energy };
  };

  return (
    <div className="week-editor">
      <h5 className="calc-subheading">Wochenplan</h5>
      {activity && (() => {
        const estimated = days.filter(day => !dayValues(day).energy).map(day => DAY_LABELS[day]);
        const measured = days.length - estimated.length;
        return (
          <div className="health-callout">
            <div className="health-callout-title">❤ Kalorienbedarf aus Apple Health</div>
            {measured > 0 ? (
              <>
                <strong>{measured} von 7 Wochentagen</strong> nutzen den gemessenen Umsatz – Ø der letzten 6 Wochen,
                {' '}{Math.round(activity.factor * 100)} % der aktiven kcal angerechnet. Der Tagestyp wirkt dort nur noch
                aufs Protein (+5 % an Krafttagen); Kohlenhydrate füllen den Rest.
                {estimated.length > 0 && <> Noch Profil-Schätzung (zu wenig Messwerte): {estimated.join(', ')}.</>}
              </>
            ) : (
              <>Noch zu wenig Messwerte – alle Tage nutzen vorerst die Profil-Schätzung. Ab 2 Messwerten je Wochentag übernimmt Apple Health.</>
            )}
          </div>
        );
      })()}
      <div className="week-grid">
        {days.map(day => {
          const dt = profile.weekDayTypes[day];
          const { adj, energy } = dayValues(day);
          return (
            <div key={day} className={`week-day-col${energy ? ' week-day-health' : ''}`}>
              <div className="week-day-label">{DAY_LABELS[day]}</div>
              <div className="week-day-toggles">
                {types.map(t => (
                  <button
                    key={t}
                    className={`week-day-btn ${dt === t ? 'active' : ''}`}
                    style={{ borderColor: dt === t ? DAY_TYPE_COLORS[t] : undefined, background: dt === t ? DAY_TYPE_COLORS[t] + '22' : undefined }}
                    onClick={() => onChange({ ...profile.weekDayTypes, [day]: t })}
                  >
                    {DAY_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <div className="week-day-values">
                <span>{adj.targetKcal} kcal</span>
                <span>{adj.proteinG}g P / {adj.carbsG}g KH / {adj.fatG}g F</span>
                {energy && <span className="week-day-health-line" title="Ø aktive kcal aus Apple Health (vor Anrechnung)">❤ Ø {energy.activeKcal} aktiv ({energy.samples})</span>}
              </div>
              {adj.hint && <div className="week-day-hint">{adj.hint}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NutritionCalculator() {
  const { nutritionProfile, setNutritionProfile, activity, today, sport, flexibleSportEnabled, setFlexibleSportEnabled } = useMealPlan();
  const [profile, setProfile] = useState<NutritionProfile>(nutritionProfile ?? { ...DEFAULT_NUTRITION_PROFILE });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const calc = useMemo(() => calculateNutrition(profile, sport), [profile, sport]);

  const update = <K extends keyof NutritionProfile>(key: K, value: NutritionProfile[K]) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  // Auto-save profile on change (debounced)
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setNutritionProfile(profile);
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [profile, setNutritionProfile]);

  const setTrainingMode = (flexible: boolean) => {
    if (flexible !== flexibleSportEnabled) setFlexibleSportEnabled(flexible);
  };

  return (
    <div className="nutrition-calculator">
      <EnergyOverview profile={profile} today={today} activity={activity} sport={sport} />

      {/* ① Body data */}
      <div className="calc-section">
        <h4><span className="calc-step">1</span>Körperdaten</h4>
        <div className="calc-form-grid">
          <div className="settings-field">
            <label>Alter</label>
            <input className="input" type="number" min="10" max="120" value={profile.age}
              onChange={e => update('age', Math.max(10, parseInt(e.target.value) || 25))} style={{ width: '80px' }} />
          </div>
          <div className="settings-field">
            <label>Geschlecht</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['m', 'f'] as const).map(g => (
                <button key={g} className={`pill ${profile.gender === g ? 'pill-active' : ''}`}
                  onClick={() => update('gender', g)}>{g === 'm' ? 'Männlich' : 'Weiblich'}</button>
              ))}
            </div>
          </div>
          <div className="settings-field">
            <label>Größe (cm)</label>
            <input className="input" type="number" min="100" max="250" value={profile.heightCm}
              onChange={e => update('heightCm', parseInt(e.target.value) || 170)} style={{ width: '80px' }} />
          </div>
          <div className="settings-field">
            <label>Gewicht (kg)</label>
            <input className="input" type="number" min="30" max="300" step="0.1" value={profile.weightKg}
              onChange={e => update('weightKg', parseFloat(e.target.value) || 70)} style={{ width: '80px' }} />
          </div>
          <div className="settings-field">
            <label>Körperfett % (optional)</label>
            <input className="input" type="number" min="3" max="60" step="0.1"
              value={profile.bodyFatPercent ?? ''} placeholder="–"
              onChange={e => update('bodyFatPercent', e.target.value ? parseFloat(e.target.value) : undefined)} style={{ width: '80px' }} />
          </div>
        </div>
        <p className="calc-hint">
          Grundumsatz {calc.bmr.toLocaleString('de-DE')} kcal nach {profile.bodyFatPercent ? 'Katch-McArdle (mit Körperfett genauer)' : 'Harris-Benedict – mit Körperfett-Angabe wird es genauer (Katch-McArdle)'}.
        </p>
      </div>

      {/* ② Everyday activity + how training is counted */}
      <div className="calc-section">
        <h4><span className="calc-step">2</span>Alltag & Training</h4>
        <div className="settings-field">
          <label>Alltagsaktivität</label>
          <select className="input" value={profile.activityLevel}
            onChange={e => update('activityLevel', e.target.value as NutritionProfile['activityLevel'])}>
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="mode-switch" role="radiogroup" aria-label="Wie wird Training gezählt?">
          <button type="button" role="radio" aria-checked={!flexibleSportEnabled}
            className={!flexibleSportEnabled ? 'is-active' : ''} onClick={() => setTrainingMode(false)}>
            <strong>📅 Fester Wochenplan</strong>
            <span>Trainingstage pro Wochentag festlegen</span>
          </button>
          <button type="button" role="radio" aria-checked={flexibleSportEnabled}
            className={flexibleSportEnabled ? 'is-active' : ''} onClick={() => setTrainingMode(true)}>
            <strong>🏃 Flexibel im Plan</strong>
            <span>Trainings am jeweiligen Tag eintragen</span>
          </button>
        </div>

        {flexibleSportEnabled ? (
          <p className="calc-hint">
            Trag Trainings im Wochenplaner über 🏃 neben dem Datum ein (Art, Intensität, Dauer). Sie zählen genau an
            diesem Tag. Wähle bei der Alltagsaktivität deshalb nur deine Bewegung <strong>ohne</strong> Sport, sonst
            zählt er doppelt.
          </p>
        ) : (
          <>
            {(() => {
              const sessions = countSessionsFromWeek(profile.weekDayTypes);
              return (
                <p className="calc-hint">
                  {sessions.strength}× Kraft, {sessions.cardio}× Ausdauer pro Woche laut Wochenplan. Die Trainings werden
                  auf alle Tage verteilt, Ruhetage bekommen etwas weniger.
                </p>
              );
            })()}
            <div className="calc-form-grid">
              <div className="settings-field">
                <label>Intensität Kraft</label>
                <select className="input" value={profile.strengthIntensity}
                  onChange={e => update('strengthIntensity', e.target.value as NutritionProfile['strengthIntensity'])}>
                  {Object.entries(INTENSITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="settings-field">
                <label>Intensität Ausdauer</label>
                <select className="input" value={profile.cardioIntensity}
                  onChange={e => update('cardioIntensity', e.target.value as NutritionProfile['cardioIntensity'])}>
                  {Object.entries(INTENSITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <WeekEditor profile={profile} calc={calc} activity={activity} onChange={w => update('weekDayTypes', w)} />
          </>
        )}
      </div>

      {/* ③ Apple Health */}
      <AppleHealthSettings profile={profile} />

      {/* ④ Goal */}
      <div className="calc-section">
        <h4><span className="calc-step">4</span>Ziel</h4>
        <div className="goal-toggles" style={{ justifyContent: 'center' }}>
          {(Object.entries(GOAL_LABELS) as [NutritionProfile['goal'], string][]).map(([k, v]) => (
            <button key={k} className={`pill ${profile.goal === k ? 'pill-active' : ''}`}
              onClick={() => update('goal', k)}>{v}</button>
          ))}
        </div>
        {profile.goal !== 'maintain' && (
          <div className="settings-field" style={{ marginTop: '12px' }}>
            <label>
              Aggressivität ({profile.goal === 'bulk' ? '+' : '−'}{Math.round(Math.abs(goalAdjustment(profile)))} kcal/Tag
              {' ≈ '}{profile.goal === 'bulk' ? '+' : '−'}{monthlyWeightChangeKg(goalAdjustment(profile)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg/Monat)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Konservativ</span>
              <input type="range" min="0" max="100" value={profile.aggressiveness} style={{ flex: 1 }}
                onChange={e => update('aggressiveness', parseInt(e.target.value))} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aggressiv</span>
            </div>
          </div>
        )}
      </div>

      {/* ⑤ Results */}
      <ResultsPanel calc={calc} profile={profile} today={today} activity={activity} sport={sport}
        onToggleSupplement={(key) => {
          // Normalizing also migrates keys from older profiles (e.g. 'vitaminDIu') on the next save.
          const current = normalizeSupplementedMicros(profile.supplementedMicros);
          const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
          update('supplementedMicros', next);
        }}
      />
    </div>
  );
}
