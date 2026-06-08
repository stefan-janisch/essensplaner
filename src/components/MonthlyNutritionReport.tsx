import { useState, useEffect, useMemo } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { api } from '../api/client';
import { buildMonthlyReport } from '../utils/monthlyReport';
import type { NutritionLogEntry, MicroStatus } from '../utils/monthlyReport';
import type { NutrientStatus } from '../utils/nutritionColors';
import { COLOR_HEX } from '../utils/nutritionColors';

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_DE[m - 1]} ${y}`;
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function MacroDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const total = protein + carbs + fat;
  if (total === 0) return null;
  const r = 40, circumference = 2 * Math.PI * r;
  const fLen = (fat / total) * circumference, cLen = (carbs / total) * circumference, pLen = (protein / total) * circumference;
  return (
    <svg viewBox="0 0 100 100" className="macro-donut">
      <circle cx={50} cy={50} r={r} fill="none" stroke="#e9ecef" strokeWidth="14" />
      <circle cx={50} cy={50} r={r} fill="none" stroke="#ff6b6b" strokeWidth="14"
        strokeDasharray={`${fLen} ${circumference - fLen}`} strokeDashoffset={0} transform="rotate(-90 50 50)" />
      <circle cx={50} cy={50} r={r} fill="none" stroke="#ffd43b" strokeWidth="14"
        strokeDasharray={`${cLen} ${circumference - cLen}`} strokeDashoffset={-fLen} transform="rotate(-90 50 50)" />
      <circle cx={50} cy={50} r={r} fill="none" stroke="#4dabf7" strokeWidth="14"
        strokeDasharray={`${pLen} ${circumference - pLen}`} strokeDashoffset={-(fLen + cLen)} transform="rotate(-90 50 50)" />
    </svg>
  );
}

function Bar({ label, actual, target, percent, color, unit }:
  { label: string; actual: number; target: number; percent: number; color: string; unit: string }) {
  return (
    <div className="report-bar-row">
      <span className="report-bar-label">{label}</span>
      <div className="report-bar-track">
        <div className="report-bar-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: COLOR_HEX[color as keyof typeof COLOR_HEX] }} />
      </div>
      <span className="report-bar-value">{actual}{unit} <span className="report-bar-target">/ {target}{unit}</span> · {percent}%</span>
    </div>
  );
}

export function MonthlyNutritionReport({ month: initialMonth }: { month?: string }) {
  const { nutritionProfile, nutritionTargets, nutritionLogEnabled } = useMealPlan();
  const [month, setMonth] = useState(initialMonth || currentMonth());
  const [months, setMonths] = useState<string[]>([]);
  const [logs, setLogs] = useState<NutritionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (initialMonth) setMonth(initialMonth); }, [initialMonth]);

  useEffect(() => {
    const load = async () => {
      try { setMonths(await api.get<string[]>('/api/nutrition-logs/months')); }
      catch { setMonths([]); }
    };
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await api.get<NutritionLogEntry[]>(`/api/nutrition-logs?month=${month}`);
        if (!cancelled) setLogs(rows);
      } catch {
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [month]);

  const report = useMemo(
    () => buildMonthlyReport(logs, nutritionProfile, nutritionTargets, month),
    [logs, nutritionProfile, nutritionTargets, month],
  );

  const isCurrent = month === currentMonth();

  return (
    <div className="report-view">
      <div className="report-header">
        <h2>Nährstoff-Bericht</h2>
        <div className="report-month-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} title="Vorheriger Monat">◀</button>
          <select className="input report-month-select" value={month} onChange={e => setMonth(e.target.value)}>
            {(months.includes(month) ? months : [month, ...months]).map(m => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isCurrent} title="Nächster Monat">▶</button>
        </div>
      </div>

      {!nutritionLogEnabled && (
        <div className="report-banner">
          Das Nährwert-Log ist deaktiviert. Aktiviere es in den <strong>Einstellungen</strong>, damit abgehakte Mahlzeiten erfasst werden.
        </div>
      )}

      {loading ? (
        <p className="report-muted">Lädt…</p>
      ) : report.daysWithData === 0 ? (
        <div className="report-empty">
          <p>Für {monthLabel(month)} liegen noch keine gekochten Mahlzeiten vor.</p>
          <p className="report-muted">Markiere Mahlzeiten im Plan als gekocht (Status ✗) – sie werden bis einschließlich heute automatisch erfasst.</p>
        </div>
      ) : (
        <>
          {/* Coverage cards */}
          <div className="report-cards">
            <div className="report-card">
              <div className="report-card-num">{report.daysWithData}<span className="report-card-sub">/ {report.daysInMonth}</span></div>
              <div className="report-card-label">Tage mit Daten</div>
            </div>
            <div className="report-card">
              <div className="report-card-num">{report.loggedMeals}</div>
              <div className="report-card-label">geloggte Mahlzeiten</div>
            </div>
            <div className="report-card">
              <div className="report-card-num">{Math.round(report.microCoverage * 100)}%</div>
              <div className="report-card-label">mit Mikro-Daten</div>
            </div>
          </div>
          <p className="report-muted report-note">
            Durchschnitt pro <strong>geloggtem Tag</strong> – nicht über alle Kalendertage. So verzerren ungeloggte Tage die Werte nicht.
          </p>

          {/* Deficiencies */}
          <section className="report-section">
            <h3>Mögliche Mängel</h3>
            {report.deficiencies.length === 0 ? (
              <p className="report-muted">Keine auffälligen Mängel{report.microDataSufficient ? '' : ' (Mikros wegen geringer Datenabdeckung ausgenommen)'}.</p>
            ) : (
              <ul className="report-deficiencies">
                {report.deficiencies.map(d => (
                  <li key={d.key}>
                    <span className="report-def-name">{d.label}</span>
                    <span className="report-def-pct" style={{ color: COLOR_HEX.red }}>{d.percent}% des Ziels</span>
                    {d.hint && <span className="report-def-hint">{d.hint}</span>}
                    {report.topFoods[d.key]?.length ? (
                      <span className="report-def-top">Top-Quellen: {report.topFoods[d.key].map(f => f.name).join(', ')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Macros + donut */}
          <section className="report-section">
            <h3>Makronährstoffe (Ø/Tag vs. Ziel)</h3>
            <div className="report-macro-grid">
              <div className="report-bars">
                {report.macros.map((s: NutrientStatus) => (
                  <Bar key={s.key} label={s.label} actual={s.actual} target={s.target} percent={s.percent} color={s.color} unit={s.key === 'kcal' ? '' : 'g'} />
                ))}
              </div>
              <div className="report-donut-wrap">
                <MacroDonut protein={report.donut.protein} carbs={report.donut.carbs} fat={report.donut.fat} />
                <div className="report-donut-legend">
                  <span><i style={{ background: '#4dabf7' }} />Protein {report.donut.protein}g</span>
                  <span><i style={{ background: '#ffd43b' }} />Kohlenh. {report.donut.carbs}g</span>
                  <span><i style={{ background: '#ff6b6b' }} />Fett {report.donut.fat}g</span>
                </div>
              </div>
            </div>
          </section>

          {/* Micros */}
          <section className="report-section">
            <h3>Mikronährstoffe (Ø/Tag vs. Referenz)</h3>
            {!report.microDataSufficient && (
              <div className="report-banner report-banner-warn">
                Nur {Math.round(report.microCoverage * 100)}% der Mahlzeiten haben Mikrodaten – die Mikrowerte sind untererfasst und werden nicht als Mängel gewertet. Tipp: Mikro-Backfill ausführen.
              </div>
            )}
            <div className={`report-bars report-micro-bars${report.microDataSufficient ? '' : ' report-dimmed'}`}>
              {report.micros.map((m: MicroStatus) => (
                <Bar key={m.key} label={m.label} actual={m.actual} target={m.target} percent={m.percent} color={m.color} unit={m.unit} />
              ))}
            </div>
          </section>

          {/* Heatmap */}
          <section className="report-section">
            <h3>Tagesübersicht</h3>
            <div className="report-heatmap">
              {report.heatmap.map(h => (
                <div key={h.date} className="report-heat-cell" title={h.date}
                  style={{ background: h.color === 'gray' ? COLOR_HEX.gray : COLOR_HEX[h.color] }}>
                  {Number(h.date.slice(-2))}
                </div>
              ))}
            </div>
            <div className="report-heat-legend">
              <span><i style={{ background: COLOR_HEX.green }} />ausgewogen</span>
              <span><i style={{ background: COLOR_HEX.yellow }} />grenzwertig</span>
              <span><i style={{ background: COLOR_HEX.red }} />unausgewogen</span>
              <span><i style={{ background: COLOR_HEX.gray }} />keine Daten</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
