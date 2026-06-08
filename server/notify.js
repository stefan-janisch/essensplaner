/**
 * Push notifications via the local mailerdaemon service (/opt/mailerdaemon).
 * Mirrors the pattern used by /opt/kalender. Fire-and-forget — never throws.
 */

const NOTIFY_URL = 'http://127.0.0.1:8025/notify';
const SERVICE_NAME = '🍽️';

/**
 * Send a push notification (ntfy broadcast topic). Optional clickable url.
 * Returns true on HTTP 200, false otherwise (failures are logged, not thrown).
 */
export async function sendPush({ subject, body, url }) {
  const payload = { service: SERVICE_NAME, subject, body, channels: ['push'] };
  if (url) payload.url = url;
  try {
    const resp = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.warn(`Notification failed (${resp.status}): ${await resp.text().catch(() => '')}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to send notification:', err.message);
    return false;
  }
}
