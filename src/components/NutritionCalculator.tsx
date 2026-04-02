import { useState, useMemo, useEffect, useRef } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { calculateNutrition, calculateDayAdjustment, toNutritionTargets, countSessionsFromWeek } from '../utils/nutritionCalculator';
import type { NutritionProfile, DayType, WeekDayTypes, CalculatedNutrition, MicroKey } from '../types/index.js';
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

const MICRO_LABELS: { key: MicroKey; label: string; unit: string }[] = [
  { key: 'magnesiumMg', label: 'Magnesium', unit: 'mg' },
  { key: 'zincMg', label: 'Zink', unit: 'mg' },
  { key: 'ironMg', label: 'Eisen', unit: 'mg' },
  { key: 'vitaminDIu', label: 'Vitamin D', unit: 'IU' },
  { key: 'omega3G', label: 'Omega-3', unit: 'g' },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg' },
];

function ResultsPanel({ calc, profile, onApply, onToggleSupplement }: { calc: CalculatedNutrition; profile: NutritionProfile; onApply: () => void; onToggleSupplement: (key: MicroKey) => void }) {
  const formula = profile.bodyFatPercent ? 'Katch-McArdle' : 'Harris-Benedict';
  return (
    <div className="calc-results">
      <div className="calc-results-header">
        <h4>Ergebnis</h4>
        <span className="calc-formula-badge">{formula}</span>
      </div>

      <div className="calc-energy-cards">
        <div className="calc-card">
          <div className="calc-card-value">{calc.bmr}</div>
          <div className="calc-card-label">Grundumsatz (BMR)</div>
        </div>
        <div className="calc-card">
          <div className="calc-card-value">{calc.tdee}</div>
          <div className="calc-card-label">Gesamtumsatz (TDEE)</div>
        </div>
        <div className="calc-card calc-card-accent">
          <div className="calc-card-value">{calc.targetKcal}</div>
          <div className="calc-card-label">Ziel-Kalorien</div>
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
        <h5>Mikronährstoffe <span style={{ fontWeight: 400, fontSize: '11px' }}>(supplementierte abhaken)</span></h5>
        <div className="calc-micro-grid">
          {MICRO_LABELS.map(({ key, label, unit }) => {
            const supplemented = profile.supplementedMicros?.includes(key) ?? false;
            return (
              <label key={key} className="calc-micro-item" style={{ opacity: supplemented ? 0.4 : 1 }}>
                <input type="checkbox" checked={supplemented} onChange={() => onToggleSupplement(key)} />
                <span>{label}: <strong>{supplemented ? '–' : `${calc.micros[key]} ${unit}`}</strong></span>
                {supplemented && <span className="calc-supplement-badge">Supplement</span>}
              </label>
            );
          })}
        </div>
      </div>

      <button className="btn btn-primary" onClick={onApply} style={{ marginTop: '16px', width: '100%' }}>
        Werte als Nährwert-Ziele übernehmen
      </button>
    </div>
  );
}

function WeekEditor({ profile, calc, onChange }: { profile: NutritionProfile; calc: CalculatedNutrition; onChange: (w: WeekDayTypes) => void }) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
  const types: DayType[] = ['strength', 'cardio', 'rest'];

  return (
    <div className="week-editor">
      <h4>Wochenplan</h4>
      <div className="week-grid">
        {days.map(day => {
          const dt = profile.weekDayTypes[day];
          const adj = calculateDayAdjustment(calc, dt);
          return (
            <div key={day} className="week-day-col">
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
                <span>{adj.proteinG}g P / {adj.carbsG}g K / {adj.fatG}g F</span>
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
  const { nutritionProfile, setNutritionProfile, setNutritionTargets } = useMealPlan();
  const [profile, setProfile] = useState<NutritionProfile>(nutritionProfile ?? { ...DEFAULT_NUTRITION_PROFILE });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const calc = useMemo(() => calculateNutrition(profile), [profile]);

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

  const handleApply = async () => {
    const targets = toNutritionTargets(calc);
    await setNutritionTargets(targets);
  };

  return (
    <div className="nutrition-calculator">
      {/* Personal Profile */}
      <div className="calc-section">
        <h4>Persönliches Profil</h4>
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
          <div className="settings-field">
            <label>Alltagsaktivität</label>
            <select className="input" value={profile.activityLevel}
              onChange={e => update('activityLevel', e.target.value as NutritionProfile['activityLevel'])}>
              {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Training — session counts derived from week plan below */}
      <div className="calc-section">
        <h4>Training</h4>
        {(() => {
          const sessions = countSessionsFromWeek(profile.weekDayTypes);
          return (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              {sessions.strength}x Kraft, {sessions.cardio}x Ausdauer pro Woche (aus Wochenplan unten)
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
      </div>

      {/* Goal */}
      <div className="calc-section">
        <h4>Zielsetzung</h4>
        <div className="goal-toggles" style={{ justifyContent: 'center' }}>
          {(Object.entries(GOAL_LABELS) as [NutritionProfile['goal'], string][]).map(([k, v]) => (
            <button key={k} className={`pill ${profile.goal === k ? 'pill-active' : ''}`}
              onClick={() => update('goal', k)}>{v}</button>
          ))}
        </div>
        {profile.goal !== 'maintain' && (
          <div className="settings-field" style={{ marginTop: '12px' }}>
            <label>Aggressivität ({profile.goal === 'bulk' ? '+' : '-'}{Math.round(300 + (profile.aggressiveness / 100) * 200)} kcal)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Konservativ</span>
              <input type="range" min="0" max="100" value={profile.aggressiveness} style={{ flex: 1 }}
                onChange={e => update('aggressiveness', parseInt(e.target.value))} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aggressiv</span>
            </div>
          </div>
        )}
      </div>

      {/* Week Editor — under Training */}
      <WeekEditor profile={profile} calc={calc} onChange={w => update('weekDayTypes', w)} />

      {/* Results */}
      <ResultsPanel calc={calc} profile={profile} onApply={handleApply}
        onToggleSupplement={(key) => {
          const current = profile.supplementedMicros ?? [];
          const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
          update('supplementedMicros', next);
        }}
      />
    </div>
  );
}
