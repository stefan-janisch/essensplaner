import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { COLOR_HEX } from '../utils/nutritionColors';
import type { NutrientColor } from '../utils/nutritionColors';
import { MICRO_REFERENCES, getMicroReference, getSupplementedMicros } from '../utils/microReference';
import { getDayEnergy } from '../utils/nutritionCalculator';
import type { ActivityModel } from '../utils/activityModel';
import type { SportModel } from '../utils/sportModel';
import type { DayScoreComponent, PlanScore, TargetsForDate } from '../utils/dayScore';
import type { NutritionInfo, NutritionProfile } from '../types/index.js';

/**
 * Breakdowns behind the "Zielabdeckung Ø pro Tag" chips of the plan score.
 *
 * A single average percentage says a plan is at 133 % of its calories but not what that means
 * in practice. Each chip opens the view that answers the obvious follow-up question:
 * calories → the energy balance and the weight change it implies, micros → which of the 13
 * are actually short, macros → how the days are distributed and which ones drag.
 */

/** Energy density of body tissue lost/gained — the standard 7700 kcal ≈ 1 kg rule of thumb. */
const KCAL_PER_KG = 7700;
const DAYS_PER_MONTH = 30;

const fmtDay = (date: string) => format(parseISO(date), 'EEE dd.MM.', { locale: de });
const fmtSigned = (n: number, unit: string) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('de-DE')} ${unit}`;
const fmtKg = (kg: number) =>
  `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${Math.abs(kg).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

function Row({ label, value, muted, color }: { label: string; value: string; muted?: boolean; color?: string }) {
  return (
    <div className="chip-detail-row">
      <span className={muted ? 'plan-score-muted' : undefined}>{label}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
    </div>
  );
}

/**
 * Calories: what the plan actually delivers against the day targets, and — when a nutrition
 * profile exists — against total daily expenditure, which is what a weight projection needs.
 * The day targets already contain the goal adjustment, so "on target" is not "maintenance".
 */
function KcalDetail({ score, targetsFor, profile, activity, sport }: {
  score: PlanScore;
  targetsFor: TargetsForDate;
  profile: NutritionProfile | null;
  activity: ActivityModel | null;
  sport: SportModel | null;
}) {
  const n = score.days.length;
  if (n === 0) return null;

  const avgIntake = score.days.reduce((s, d) => s + d.totals.kcal, 0) / n;
  const avgTarget = score.days.reduce((s, d) => s + targetsFor(d.date).kcal, 0) / n;
  const vsTarget = avgIntake - avgTarget;

  // Estimated expenditure per day, the same one the day target is built on (Apple Health measurement
  // or weekday average when available, otherwise the profile estimate adjusted for the training type),
  // so a mixed week is not judged by one number.
  const energies = profile ? score.days.map(d => getDayEnergy(profile, d.date, activity, sport)) : null;
  const avgBurn = energies ? energies.reduce((s, e) => s + e.tdee, 0) / n : null;
  const measuredDays = energies ? energies.filter(e => e.source === 'actual').length : 0;
  const averagedDays = energies ? energies.filter(e => e.source === 'weekday').length : 0;
  const balance = avgBurn === null ? null : avgIntake - avgBurn;
  const kgPerMonth = balance === null ? null : (balance * DAYS_PER_MONTH) / KCAL_PER_KG;

  const over = score.days
    .map(d => ({ date: d.date, pct: d.day.components.find(c => c.key === 'kcal')?.percent ?? 0 }))
    .filter(d => d.pct > 110)
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="chip-detail">
      <Row label="Ø Zufuhr" value={`${Math.round(avgIntake).toLocaleString('de-DE')} kcal/Tag`} />
      <Row label="Ø Tagesziel" value={`${Math.round(avgTarget).toLocaleString('de-DE')} kcal/Tag`} muted />
      <Row
        label="Ø Abweichung vom Ziel"
        value={fmtSigned(vsTarget, 'kcal/Tag')}
        color={Math.abs(vsTarget) < 100 ? COLOR_HEX.green : vsTarget > 0 ? COLOR_HEX.red : COLOR_HEX.yellow}
      />

      {balance !== null && kgPerMonth !== null ? (
        <>
          <div className="chip-detail-sep" />
          <Row label="Ø Gesamtumsatz" value={`${Math.round(avgBurn!).toLocaleString('de-DE')} kcal/Tag`} muted />
          <Row
            label={balance < 0 ? 'Ø Defizit' : 'Ø Überschuss'}
            value={fmtSigned(balance, 'kcal/Tag')}
            color={balance < 0 ? COLOR_HEX.green : COLOR_HEX.red}
          />
          <Row
            label="Rechnerisch pro Monat"
            value={fmtKg(kgPerMonth)}
            color={kgPerMonth < 0 ? COLOR_HEX.green : COLOR_HEX.red}
          />
          <div className="chip-detail-note plan-score-muted">
            Modellrechnung: {KCAL_PER_KG.toLocaleString('de-DE')} kcal ≈ 1 kg Körpergewicht, {DAYS_PER_MONTH} Tage,
            hochgerechnet aus den {n} bewerteten Tagen. Tatsächlicher Verlauf hängt von Wasserhaushalt,
            Aktivität und Stoffwechselanpassung ab.
            {(measuredDays > 0 || averagedDays > 0) && (
              <> Umsatz aus Apple Health: {measuredDays > 0 && `${measuredDays} Tag${measuredDays !== 1 ? 'e' : ''} gemessen`}
                {measuredDays > 0 && averagedDays > 0 && ', '}
                {averagedDays > 0 && `${averagedDays} Tag${averagedDays !== 1 ? 'e' : ''} aus dem Wochentags-Schnitt`}
                {measuredDays + averagedDays < n && ', Rest geschätzt'}.</>
            )}
          </div>
        </>
      ) : (
        <div className="chip-detail-note plan-score-muted">
          Für die Gewichtsprognose fehlt der Gesamtumsatz — leg dazu in den Einstellungen ein
          Ernährungsprofil an (Ernährungsrechner).
        </div>
      )}

      {over.length > 0 && (
        <div className="chip-detail-note">
          <span className="plan-score-muted">Tage über dem Ziel: </span>
          {over.map(d => `${fmtDay(d.date)} (${d.pct} %)`).join(' · ')}
        </div>
      )}
    </div>
  );
}

/** Micros: which of the 13 are actually short, instead of one averaged number. */
function MicroDetail({ score, profile }: { score: PlanScore; profile: NutritionProfile | null }) {
  const refs = getMicroReference(profile);
  const supplemented = getSupplementedMicros(profile);
  const withData = score.days.filter(d => d.micros !== null);

  if (withData.length === 0) {
    return (
      <div className="chip-detail">
        <div className="chip-detail-note plan-score-muted">
          Für diese Tage liegen noch keine Mikronährstoff-Daten vor.
        </div>
      </div>
    );
  }

  const rows = MICRO_REFERENCES.map(m => {
    const avg = withData.reduce((s, d) => s + (d.micros![m.key] || 0), 0) / withData.length;
    const ref = refs[m.key];
    const percent = ref > 0 ? Math.round((avg / ref) * 100) : 0;
    const color: NutrientColor = percent >= 80 ? 'green' : percent >= 50 ? 'yellow' : 'red';
    return { ...m, avg, ref, percent, color, supplemented: supplemented.has(m.key) };
  }).sort((a, b) => a.percent - b.percent);

  const short = rows.filter(r => !r.supplemented && r.percent < 80);

  return (
    <div className="chip-detail">
      {rows.map(r => (
        <div key={r.key} className="chip-detail-micro" title={r.supplemented ? `${r.hint} — als Supplement markiert, zählt nicht in den Score` : r.hint}>
          <span className="chip-detail-micro-label">
            {r.label}{r.supplemented && <span className="plan-score-muted"> 💊</span>}
          </span>
          <span className="chip-detail-micro-bar">
            <span
              style={{
                width: `${Math.min(100, r.percent)}%`,
                background: r.supplemented ? 'var(--border-light)' : COLOR_HEX[r.color],
              }}
            />
          </span>
          <span className="chip-detail-micro-value plan-score-muted">
            {r.avg < 10 ? Math.round(r.avg * 10) / 10 : Math.round(r.avg)} / {r.ref} {r.unit}
          </span>
          <span
            className="chip-detail-micro-pct"
            style={{ color: r.supplemented ? undefined : COLOR_HEX[r.color] }}
          >
            {r.percent} %
          </span>
        </div>
      ))}
      <div className="chip-detail-note plan-score-muted">
        Ø über {withData.length} Tag{withData.length !== 1 ? 'e' : ''} mit Nährstoffdaten, gegen den Tagesbedarf.
        {short.length > 0 && <> Am knappsten: <strong>{short.slice(0, 3).map(r => r.label).join(', ')}</strong>.</>}
        {supplemented.size > 0 && ' 💊 = per Supplement abgedeckt, zählt nicht in den Score.'}
      </div>
    </div>
  );
}

/** Any other macro: average per day, how the days distribute, and which ones drag. */
function MacroDetail({ macroKey, score, targetsFor }: {
  macroKey: keyof NutritionInfo;
  score: PlanScore;
  targetsFor: TargetsForDate;
}) {
  const n = score.days.length;
  if (n === 0) return null;

  const avg = score.days.reduce((s, d) => s + d.totals[macroKey], 0) / n;
  const avgTarget = score.days.reduce((s, d) => s + targetsFor(d.date)[macroKey], 0) / n;
  const unit = macroKey === 'kcal' ? 'kcal' : 'g';

  const perDay = score.days.map(d => {
    const c = d.day.components.find(x => x.key === macroKey)!;
    return { date: d.date, percent: c.percent, color: c.color };
  });
  const counts = { green: 0, yellow: 0, red: 0 } as Record<NutrientColor, number>;
  for (const d of perDay) counts[d.color]++;
  const worst = [...perDay].sort((a, b) => a.percent - b.percent).slice(0, 3).filter(d => d.color !== 'green');

  return (
    <div className="chip-detail">
      <Row label="Ø pro Tag" value={`${Math.round(avg).toLocaleString('de-DE')} ${unit}`} />
      <Row label="Ø Tagesziel" value={`${Math.round(avgTarget).toLocaleString('de-DE')} ${unit}`} muted />
      <Row
        label="Ø Abweichung"
        value={fmtSigned(avg - avgTarget, unit)}
        color={counts.green >= n / 2 ? COLOR_HEX.green : COLOR_HEX.yellow}
      />
      <div className="chip-detail-sep" />
      <div className="chip-detail-days">
        {perDay.map(d => (
          <span key={d.date} className="chip-detail-day" title={`${fmtDay(d.date)}: ${d.percent} %`}>
            <span className="chip-detail-day-dot" style={{ background: COLOR_HEX[d.color] }} />
            {format(parseISO(d.date), 'EEEEEE', { locale: de })}
          </span>
        ))}
      </div>
      <div className="chip-detail-note plan-score-muted">
        {counts.green} von {n} Tagen im grünen Bereich
        {counts.red > 0 && `, ${counts.red} im roten`}.
        {worst.length > 0 && ` Schwächste Tage: ${worst.map(d => `${fmtDay(d.date)} (${d.percent} %)`).join(' · ')}.`}
      </div>
    </div>
  );
}

export function PlanScoreChipDetail({ chipKey, score, targetsFor, profile, activity, sport }: {
  chipKey: DayScoreComponent['key'];
  score: PlanScore;
  targetsFor: TargetsForDate;
  profile: NutritionProfile | null;
  activity: ActivityModel | null;
  sport: SportModel | null;
}) {
  if (chipKey === 'kcal') return <KcalDetail score={score} targetsFor={targetsFor} profile={profile} activity={activity} sport={sport} />;
  if (chipKey === 'micros') return <MicroDetail score={score} profile={profile} />;
  return <MacroDetail macroKey={chipKey} score={score} targetsFor={targetsFor} />;
}
