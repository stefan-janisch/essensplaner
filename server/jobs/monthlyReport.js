/**
 * Monthly nutrition-report push notification.
 *
 * On the 1st of each month (and as a catch-up on server start) sends ONE push linking to the
 * just-completed month's report. Idempotent via the report_notifications table (one row/month),
 * so the startup catch-up and the cron fire can't double-send. Push is a broadcast (ntfy topic);
 * the link is generic — each user sees their own report after logging in.
 */

import cron from 'node-cron';
import db from '../db.js';
import { sendPush } from '../notify.js';

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// The most recently completed calendar month as { month: 'YYYY-MM', label: 'Mai 2026' }.
function previousMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const m = d.getMonth();
  return { month: `${d.getFullYear()}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS_DE[m]} ${d.getFullYear()}` };
}

/** Send the previous month's report push if it hasn't been sent and there is data to report. */
export async function sendDueReport() {
  const { month, label } = previousMonth();

  const already = db.prepare('SELECT 1 FROM report_notifications WHERE month = ?').get(month);
  if (already) return;

  // Only notify if at least one opted-in user actually has logged meals that month.
  const hasData = db.prepare(
    `SELECT 1 FROM nutrition_logs nl JOIN users u ON u.id = nl.user_id
     WHERE u.nutrition_log_enabled = 1 AND substr(nl.date, 1, 7) = ? LIMIT 1`
  ).get(month);
  if (!hasData) return;

  // Prefer an explicit APP_BASE_URL; otherwise reuse CLIENT_URL (set to the real origin in prod),
  // but never a localhost dev URL — that would spam the push topic with unusable links.
  const clientUrl = process.env.CLIENT_URL && !/localhost|127\.0\.0\.1/.test(process.env.CLIENT_URL)
    ? process.env.CLIENT_URL : '';
  const baseUrl = (process.env.APP_BASE_URL || clientUrl).replace(/\/$/, '');
  if (!baseUrl) {
    console.warn('[monthlyReport] No public base URL (APP_BASE_URL/CLIENT_URL) — skipping report notification.');
    return;
  }

  const ok = await sendPush({
    subject: 'Dein Monatsbericht ist da',
    body: `Dein Nährstoff-Bericht für ${label} ist verfügbar.`,
    url: `${baseUrl}/#bericht/${month}`,
  });
  if (ok) {
    db.prepare('INSERT OR IGNORE INTO report_notifications (month) VALUES (?)').run(month);
    console.log(`[monthlyReport] Sent report notification for ${month}.`);
  }
}

/** Register the monthly cron and run a one-off catch-up for a possibly-missed month. */
export function startMonthlyReportScheduler() {
  cron.schedule('0 8 1 * *', () => { sendDueReport().catch(err => console.error('[monthlyReport]', err)); });
  // Catch-up on startup (e.g. server was down on the 1st). Idempotent.
  sendDueReport().catch(err => console.error('[monthlyReport]', err));
}
