import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Weekly lunch menu of NAPO at TU Graz Campus Inffeldgasse (https://www.napopizza.at/campus),
 * parsed from the page text (no AI). Personal feature: only enabled for the listed accounts.
 */
const NAPO_URL = 'https://www.napopizza.at/campus';
const NAPO_EMAILS = new Set(['janisch.stef@gmail.com']);
const CACHE_MS = 60 * 60 * 1000;
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

export function hasNapoAccess(email) {
  return NAPO_EMAILS.has(String(email || '').toLowerCase());
}

let cache = null; // { at: number, menu }

// Named entities that show up in dish names (Italian accents, German umlauts, typographic quotes).
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201e', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
  agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í',
  ograve: 'ò', oacute: 'ó', ugrave: 'ù', uacute: 'ú', ccedil: 'ç',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
};

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function pageToLines(html) {
  const text = decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n'))
    .replace(/[\u200b\u00a0]/g, ' ');
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

/** "28.9" + today → ISO date, choosing the year that puts the date closest to today. */
function toIsoDate(day, month, today = new Date()) {
  const candidates = [-1, 0, 1].map(dy => new Date(Date.UTC(today.getFullYear() + dy, month - 1, day)));
  const best = candidates.reduce((a, b) => (Math.abs(b - today) < Math.abs(a - today) ? b : a));
  return best.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function parseNapoMenu(html) {
  const lines = pageToLines(html);
  // Header like "TAGESGERICHT 28.9-02.10" (other lines mention "Tagesgericht" too).
  const RANGE = /(\d{1,2})\.(\d{1,2})\.?\s*[-–]\s*(\d{1,2})\.(\d{1,2})/;
  const headerIdx = lines.findIndex(l => /TAGESGERICHT/i.test(l) && RANGE.test(l));
  if (headerIdx < 0) throw new Error('Kein Wochenmenü auf der Seite gefunden');
  const range = lines[headerIdx].match(RANGE);
  const monday = toIsoDate(Number(range[1]), Number(range[2]));

  const days = [];
  let current = null;
  for (const line of lines.slice(headerIdx + 1)) {
    if (/^Kombiniere/i.test(line)) break;
    const weekday = WEEKDAYS.find(w => line.replace(/:$/, '').trim() === w);
    if (weekday) {
      current = { weekday, date: addDays(monday, WEEKDAYS.indexOf(weekday)), dishes: [] };
      days.push(current);
      continue;
    }
    if (current && line.startsWith('-')) {
      const dish = line.replace(/^-\s*/, '').replace(/\s*\([A-Z0-9,*\s]+\)\s*$/, '').trim();
      if (dish) current.dishes.push(dish);
    }
  }
  if (days.length === 0 || days.every(d => d.dishes.length === 0)) {
    throw new Error('Tagesgerichte nicht erkennbar');
  }
  return { label: lines[headerIdx].replace(/^TAGESGERICHT\s*/i, '').trim(), days, combos: parseCombos(lines) };
}

/**
 * Prices exist only for the combos below the dishes ("MENU I", "Salat + Tagesgericht", "EUR 9,9").
 * Only the ones with a Tagesgericht — Suppli aren't offered in the app.
 */
function parseCombos(lines) {
  const start = lines.findIndex(l => /^Kombiniere/i.test(l));
  if (start < 0) return [];
  const combos = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^ÖFFNUNGSZEITEN/i.test(line)) break;
    const menu = line.match(/^MENU\s+([IVX]+)\b/i);
    if (menu) {
      current = { name: `Menü ${menu[1].toUpperCase()}`, contents: '', price: null };
      combos.push(current);
      continue;
    }
    if (!current) continue;
    const price = line.match(/^(?:EUR|€)\s*(\d+(?:[.,]\d{1,2})?)/i);
    if (price) current.price = Number(price[1].replace(',', '.'));
    else current.contents = `${current.contents} ${line}`.replace(/\s+/g, ' ').trim();
  }
  return combos.filter(c => c.price && /Tagesgericht/i.test(c.contents) && !/Suppli/i.test(c.contents));
}

/** Current weekly menu (fetched from the NAPO page, cached for an hour). Throws on fetch/parse errors. */
export async function getNapoMenu() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.menu;
  const response = await fetch(NAPO_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Essensplaner/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const menu = parseNapoMenu(await response.text());
  cache = { at: Date.now(), menu };
  return menu;
}

export function userHasNapoAccess(userId) {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  return !!user && hasNapoAccess(user.email);
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  if (!userHasNapoAccess(req.userId)) return res.status(403).json({ error: 'Nicht verfügbar' });
  try {
    res.json(await getNapoMenu());
  } catch (err) {
    console.error('NAPO menu error:', err.message);
    res.status(502).json({ error: `Napo-Menü konnte nicht geladen werden (${err.message})` });
  }
});

export default router;
