import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { decodeEntities } from './napo.js';

/**
 * Weekly menu of the Mensa at TU Graz Campus Inffeldgasse
 * (https://www.mensen.at/standort/mensa-m-cafe-inffeldgasse/). The page renders in the browser;
 * the menu comes as structured JSON from the site's GraphQL backend (no AI). Personal feature:
 * only enabled for the listed accounts.
 */
const MENSA_API_URL = 'https://backend.mensen.at/api';
const MENSA_LOCATION_URI = '/standort/mensa-m-cafe-inffeldgasse/';
const MENSA_EMAILS = new Set(['janisch.stef@gmail.com']);
const CACHE_MS = 60 * 60 * 1000;
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Both weeks come as JSON strings (menuplanCurrentWeek/NextWeek), so they can't be narrowed further.
const MENU_QUERY = `query MensaMenu($uri: String!) {
  nodeByUri(uri: $uri) { ... on Location { menuplanCurrentWeek menuplanNextWeek } }
}`;

// "Suppe I Dessert" holds the soups (klare Suppe = 97, Cremesuppe = 98) and the dessert (107).
const SOUP_CATEGORY_IDS = new Set([97, 98]);
const SOUP_TITLE = /suppe|minestrone|bouillon|consomm|brühe/i;

export function hasMensaAccess(email) {
  return MENSA_EMAILS.has(String(email || '').toLowerCase());
}

let cache = null; // { at: number, menu }

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso) {
  return WEEKDAYS[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7];
}

const CONNECTOR_START = /^(mit|und|&|dazu|an|auf|in|im|vom|von)(?=\s|$)/i;
const CONNECTOR_END = /(?:^|\s)(mit|und|&|dazu|an)$/i;

/**
 * Menu titles are multi-line HTML ("Gyros vom Huhn <br />\nmit Zwiebelreis<br />\n& Tzatziki"),
 * some with marketing prose and a credits line. → short dish name + the prose as details (helps
 * the estimate: "Linsen und Walnüsse liefern …").
 */
export function cleanMensaTitle(raw) {
  const lines = decodeEntities(String(raw || ''))
    .split(/<br\s*\/?>/i)
    .map(l => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const parts = [];
  const details = [];
  for (const line of lines) {
    if (/^in zusammenarbeit/i.test(line) || /^brain\s*food$/i.test(line)) continue;
    if (line.length > 60 && /[.!]$/.test(line)) details.push(line);
    else parts.push(line);
  }
  let name = '';
  for (const part of parts) {
    if (!name) name = part;
    else name += CONNECTOR_START.test(part) || CONNECTOR_END.test(name) ? ` ${part}` : `, ${part}`;
  }
  name = name
    .replace(/^brain\s*food\s+/i, '')
    .replace(/\s+I\s+/g, ', ') // "Risotto I Grillgemüse I Zitronenbutter"
    .replace(/\s+/g, ' ')
    .replace(/ ,/g, ',')
    .trim();
  return { name, details: details.join(' ') };
}

/** "Tagesangebot VEGGIE / VEGAN / Study Teller € 5,20" → "Veggie / Vegan / Study Teller € 5,20". */
function cleanCategory(name) {
  return String(name || '')
    .replace(/^(Tages|Wochen)angebot\s*[|:–-]?\s*/i, '')
    .replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, first, rest) => first + rest.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** "7.70" → 7.7; missing/0 → undefined. */
function parsePrice(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** One week JSON (menuplanCurrentWeek/NextWeek) → days with main dishes and soups (desserts dropped). */
export function parseMensaWeek(json) {
  if (!json) return [];
  const week = typeof json === 'string' ? JSON.parse(json) : json;
  if (!week?.available || !week.first_day || !Array.isArray(week.menus)) return [];

  const byDay = new Map(); // dayNo → { dishes, soups }
  for (const category of week.menus) {
    const perDay = category?.menus;
    if (!perDay || typeof perDay !== 'object') continue; // e.g. "M-Cafe" without a menu
    const isSoupCategory = /suppe/i.test(category.name || '');
    const label = cleanCategory(category.name);
    for (const [dayNo, items] of Object.entries(perDay)) {
      if (!Array.isArray(items)) continue;
      if (!byDay.has(dayNo)) byDay.set(dayNo, { dishes: [], soups: [] });
      const day = byDay.get(dayNo);
      for (const item of items) {
        const { name, details } = cleanMensaTitle(item?.title_de);
        if (!name) continue;
        const price = parsePrice(item.price);
        const priceReduced = parsePrice(item.price_reduced);
        if (isSoupCategory) {
          // Only the soups — the dessert of the day is not offered as an option.
          if ((SOUP_CATEGORY_IDS.has(item.category_id) || SOUP_TITLE.test(name)) && !day.soups.some(s => s.name === name)) {
            day.soups.push({ name, ...(price && { price }) });
          }
        } else if (!day.dishes.some(d => d.name === name)) {
          day.dishes.push({ name, category: label, ...(details && { details }), ...(price && { price }), ...(priceReduced && { priceReduced }) });
        }
      }
    }
  }

  return [...byDay.entries()]
    .map(([dayNo, d]) => {
      const date = addDays(week.first_day, Number(dayNo) - 1);
      return { weekday: weekdayOf(date), date, ...d };
    })
    .filter(d => d.dishes.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Current + next week's menu (one GraphQL request, cached for an hour). Empty `days` when nothing
 * is published (holidays); throws on fetch errors.
 */
export async function getMensaMenu() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.menu;
  const response = await fetch(MENSA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Essensplaner/1.0)' },
    body: JSON.stringify({ query: MENU_QUERY, variables: { uri: MENSA_LOCATION_URI } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  const location = body?.data?.nodeByUri;
  if (!location) throw new Error(body?.errors?.[0]?.message || 'Standort nicht gefunden');

  const days = [...parseMensaWeek(location.menuplanCurrentWeek), ...parseMensaWeek(location.menuplanNextWeek)];
  const menu = { days };
  cache = { at: Date.now(), menu };
  return menu;
}

export function userHasMensaAccess(userId) {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  return !!user && hasMensaAccess(user.email);
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  if (!userHasMensaAccess(req.userId)) return res.status(403).json({ error: 'Nicht verfügbar' });
  try {
    res.json(await getMensaMenu());
  } catch (err) {
    console.error('Mensa menu error:', err.message);
    res.status(502).json({ error: `Mensa-Menü konnte nicht geladen werden (${err.message})` });
  }
});

export default router;
