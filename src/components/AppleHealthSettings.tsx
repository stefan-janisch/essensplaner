import { useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { useMealPlan } from '../context/MealPlanContext';
import { API_URL } from '../api/client.js';
import { calculateNutrition, getDayEnergy } from '../utils/nutritionCalculator';
import { nextDateForWeekday, MIN_SAMPLES, MIN_VALID_KCAL, WINDOW_DAYS, TEF } from '../utils/activityModel';
import type { WeekdayKey } from '../utils/activityModel';
import type { NutritionProfile } from '../types/index.js';

const DAYS: { key: WeekdayKey; label: string }[] = [
  { key: 'mon', label: 'Mo' }, { key: 'tue', label: 'Di' }, { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' }, { key: 'fri', label: 'Fr' }, { key: 'sat', label: 'Sa' }, { key: 'sun', label: 'So' },
];
const INGEST_URL = `${API_URL}/api/activity/ingest`;
/** Warn when the Shortcut has not delivered for longer than this. */
const STALE_DAYS = 2;

const fmtKcal = (n: number) => Math.round(n).toLocaleString('de-DE');

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
      {copied ? 'Kopiert ✓' : 'Kopieren'}
    </button>
  );
}

/** Weekday averages and the day expenditure/target they lead to, as the plan uses them. */
function WeekdayTable({ profile }: { profile: NutritionProfile }) {
  const { activity } = useMealPlan();
  if (!activity) return null;
  const bmr = calculateNutrition(profile).bmr;

  return (
    <>
      <table className="health-week-table">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Ø aktiv</th>
            <th>Umsatz</th>
            <th>Ziel</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map(({ key, label }) => {
            const avg = activity.weekdayAvg[key];
            const energy = getDayEnergy(profile, nextDateForWeekday(activity.today, key), activity);
            const measured = energy.source !== 'profile';
            return (
              <tr key={key} className={measured ? undefined : 'health-week-fallback'}>
                <td>{label}</td>
                <td>
                  {avg ? `${fmtKcal(avg.avg)} kcal` : '–'}
                  <span className="health-muted"> ({avg?.n ?? 0})</span>
                </td>
                <td>{fmtKcal(energy.tdee)} kcal</td>
                <td>
                  <strong>{fmtKcal(energy.targetKcal)} kcal</strong>
                  {!measured && <span className="health-muted"> Profil</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="health-hint">
        Umsatz = Grundumsatz {fmtKcal(bmr)} kcal × {(1 + TEF).toLocaleString('de-DE')} (Verdauung) + Ø aktive kcal × {Math.round(activity.factor * 100)} %.
        Ø über die letzten {WINDOW_DAYS / 7} Wochen (in Klammern: Anzahl Messtage); unter {MIN_SAMPLES} Werten gilt die
        Schätzung aus dem Ernährungsprofil („Profil“). Vergangene Tage mit Messwert nutzen den echten Tageswert;
        Tage unter {MIN_VALID_KCAL} kcal gelten als „Watch nicht getragen“ und zählen nicht.
      </p>
    </>
  );
}

/** Apple Health section of the nutrition calculator; `profile` is the one being edited there. */
export function AppleHealthSettings({ profile }: { profile: NutritionProfile }) {
  const {
    healthEnabled, setHealthEnabled, healthActiveFactor, setHealthActiveFactor,
    healthTokenSet, createHealthToken, revokeHealthToken, activityDays, activityLastReceivedAt, clearActivity,
    flexibleSportEnabled,
  } = useMealPlan();
  const [factorPct, setFactorPct] = useState(Math.round(healthActiveFactor * 100));
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const commitFactor = () => {
    if (factorPct !== Math.round(healthActiveFactor * 100)) setHealthActiveFactor(factorPct / 100);
  };

  const handleCreateToken = async () => {
    if (healthTokenSet && !confirm('Neuen Token erzeugen? Der bisherige funktioniert dann nicht mehr – der Kurzbefehl muss angepasst werden.')) return;
    setBusy(true);
    try {
      setNewToken(await createHealthToken());
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('Token widerrufen? Der Kurzbefehl kann dann keine Daten mehr senden.')) return;
    setBusy(true);
    try {
      await revokeHealthToken();
      setNewToken(null);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!confirm(`Alle ${activityDays.length} gespeicherten Aktivitätstage löschen?`)) return;
    await clearActivity();
  };

  const lastReceived = activityLastReceivedAt ? new Date(activityLastReceivedAt) : null;
  const lastDay = activityDays.length > 0 ? activityDays[activityDays.length - 1].date : null;
  const stale = !lastReceived || differenceInCalendarDays(new Date(), lastReceived) > STALE_DAYS;

  return (
    <div className="calc-section">
      <h4><span className="calc-step">3</span>Apple Health <span className="calc-step-optional">optional</span></h4>
      <label className="settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input type="checkbox" checked={healthEnabled} onChange={e => setHealthEnabled(e.target.checked)} />
        <span>Gemessene aktive Kalorien nutzen</span>
      </label>
      <p className="health-hint" style={{ marginTop: '4px' }}>
        {flexibleSportEnabled
          ? 'Vergangene Tage mit Messung zählen mit dem echten Verbrauch statt der Schätzung. Heute und kommende Tage bleiben bei Grundbedarf + eingetragenen Trainings.'
          : 'Vergangene Tage mit Messung zählen mit dem echten Verbrauch; für heute und kommende Tage gilt der Ø des jeweiligen Wochentags statt des Wochenplans.'}
        {' '}Die Daten sendet ein iOS-Kurzbefehl.
      </p>

      {healthEnabled && (
        <div className="health-body">
          <div className="settings-field">
            <label htmlFor="health-factor">Anrechnung aktiver kcal</label>
            <input
              id="health-factor" type="range" min="50" max="100" step="5" value={factorPct}
              onChange={e => setFactorPct(Number(e.target.value))}
              onPointerUp={commitFactor} onKeyUp={commitFactor} onBlur={commitFactor}
            />
            <strong style={{ fontSize: '14px', minWidth: '44px' }}>{factorPct} %</strong>
          </div>
          <p className="health-hint">
            Die Apple Watch überschätzt aktive Kalorien häufig. Mit weniger als 100 % bleibt ein geplantes Defizit sicherer.
          </p>

          <div className="health-status">
            {lastReceived ? (
              <span className={stale ? 'health-warning' : undefined}>
                Letzter Empfang: {format(lastReceived, 'dd.MM.yyyy HH:mm')}
                {lastDay && <> · neuester Tag {format(parseISO(lastDay), 'dd.MM.')}</>}
                {' · '}{activityDays.length} Tage gespeichert
                {stale && ' – seit über 2 Tagen keine Daten, läuft der Kurzbefehl?'}
              </span>
            ) : (
              <span className="health-warning">Noch keine Daten empfangen.</span>
            )}
          </div>

          {!flexibleSportEnabled && (
            <details className="health-setup">
              <summary>Ø pro Wochentag</summary>
              <WeekdayTable profile={profile} />
            </details>
          )}

          <details className="health-setup" open={!healthTokenSet || activityDays.length === 0}>
            <summary>Verbindung & Kurzbefehl{healthTokenSet ? ' · Token aktiv' : ' · noch nicht eingerichtet'}</summary>
          <div className="health-token-row" style={{ marginTop: '8px' }}>
            <button className="btn btn-muted btn-sm" onClick={handleCreateToken} disabled={busy}>
              {healthTokenSet ? 'Neuen Token erzeugen' : 'Token erzeugen'}
            </button>
            {healthTokenSet && (
              <button className="btn btn-ghost btn-sm" onClick={handleRevoke} disabled={busy}>Widerrufen</button>
            )}
            {healthTokenSet && !newToken && <span className="health-muted">Token aktiv</span>}
          </div>
          {newToken && (
            <div className="health-token">
              <code>{newToken}</code>
              <CopyButton text={newToken} />
              <p className="health-hint" style={{ width: '100%' }}>
                Nur jetzt sichtbar – gleich in den Kurzbefehl übernehmen.
              </p>
            </div>
          )}

          <details className="health-setup">
            <summary>Anleitung: Kurzbefehl einrichten</summary>
            <ol>
              <li>
                Kurzbefehle-App → neuer Kurzbefehl. Aktion <b>„Health-Samples suchen“</b>: Typ <i>Aktive Energie</i>,
                Filter <i>Startdatum ist in den letzten 7 Tagen</i>, <b>Gruppieren nach: Tag</b>, Einheit kcal.
              </li>
              <li>
                <b>„Wiederholen mit jedem“</b> Objekt in den Health-Samples, darin nacheinander:
                <ol type="a">
                  <li><b>„Details von Health-Samples abrufen“</b>: <i>Startdatum</i> vom Wiederholungsobjekt</li>
                  <li><b>„Datum formatieren“</b>: Datumsformat <i>Eigenes</i>, Format <code>yyyy-MM-dd</code></li>
                  <li><b>„Details von Health-Samples abrufen“</b>: <i>Wert</i> vom Wiederholungsobjekt</li>
                  <li>
                    <b>„Inhalte von URL abrufen“</b>:
                    <div className="health-copy-line"><code>{INGEST_URL}</code><CopyButton text={INGEST_URL} /></div>
                    Methode <i>POST</i>, Header <code>Authorization</code> = <code>Bearer {newToken ?? '<dein Token>'}</code>,
                    Hauptteil <i>JSON</i> mit zwei Feldern: <code>date</code> = <i>Formatiertes Datum</i> (aus b),
                    <code>activeKcal</code> = <i>Details von Health-Samples</i> aus c – nicht die aus a.
                  </li>
                </ol>
                Ein Wörterbuch oder eigene Variablen braucht es nicht; jeder Tag wird einzeln gesendet.
              </li>
              <li>
                Einmal ausführen – jede Anfrage sollte <code>{'{"ok":true,"saved":1}'}</code> liefern, und oben erscheint „Letzter Empfang“.
              </li>
              <li>
                Automationen → <b>Tageszeit, täglich</b>, <i>Sofort ausführen</i> – am besten mehrmals, z. B. 7:00, 13:00 und 23:50.
                Bei gesperrtem iPhone sind Health-Daten nicht lesbar; jeder erfolgreiche Lauf holt die letzten 7 Tage nach.
                Der laufende Tag zählt nie – erst ab dem nächsten Tag mit seinem Endwert.
              </li>
            </ol>
          </details>

          {activityDays.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClear} style={{ marginTop: '8px' }}>
              Aktivitätsdaten löschen
            </button>
          )}
          </details>
        </div>
      )}
    </div>
  );
}
