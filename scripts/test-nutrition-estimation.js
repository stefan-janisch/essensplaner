#!/usr/bin/env node
/**
 * Plausibility test for the micronutrient estimation routine.
 *
 * Runs the real estimation prompt (same MICRO_PROMPT_FRAGMENT + parseMicros as production)
 * on a handful of single-ingredient reference foods with known nutrient content (USDA / BLS),
 * then checks each estimate is:
 *   - finite and >= 0
 *   - <= the field's physiological cap
 *   - within a plausible band of the reference value [ref * 0.4, ref * 2.5]
 *
 * Goal: catch GROSS errors (wrong unit, 10x mistakes, zeros where there should be substance),
 * NOT enforce exact values — micronutrients vary a lot by source/preparation.
 *
 * Usage: node scripts/test-nutrition-estimation.js [--model gpt-5.2]
 * Default model is gpt-5.2 (same as the live endpoint and the backfill script).
 */

import OpenAI from 'openai';
import { readFileSync } from 'fs';
import toml from '@iarna/toml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MICRO_PROMPT_FRAGMENT, MICRO_KEYS, parseMicros } from '../server/nutritionMicros.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const modelArg = process.argv.indexOf('--model');
const MODEL = modelArg !== -1 ? process.argv[modelArg + 1] : 'gpt-5.2';

const config = toml.parse(readFileSync(join(rootDir, 'openai_credentials.toml'), 'utf-8'));
const openai = new OpenAI({ apiKey: config.key });

const CAP = Object.fromEntries(MICRO_KEYS.map(m => [m.key, m.cap]));

// Plausibility band around each reference value (asymmetric — AI tends to be conservative).
const REL_LOW = 0.4;
const REL_HIGH = 2.5;

// Reference foods, one ingredient each, with expected per-portion micronutrient values.
// Sources: USDA FoodData Central / Bundeslebensmittelschlüssel (approximate).
const FIXTURES = [
  {
    name: 'Spinat roh',
    ingredient: '100 g Spinat',
    expect: { vitaminC_mg: 28, folate_ug: 194, iron_mg: 2.7, vitaminA_ug: 469, calcium_mg: 99, magnesium_mg: 79, potassium_mg: 558, vitaminE_mg: 2.0 },
  },
  {
    name: 'Lachs gekocht',
    ingredient: '100 g Lachs',
    expect: { omega3_g: 2.3, vitaminD_ug: 11, vitaminB12_ug: 3.2, selenium_ug: 36, potassium_mg: 380 },
  },
  {
    name: 'Orange',
    ingredient: '1 Stück Orange',
    expect: { vitaminC_mg: 70, folate_ug: 39, calcium_mg: 52, potassium_mg: 237 },
  },
  {
    name: 'Rindfleisch mager gekocht',
    ingredient: '100 g Rindfleisch',
    expect: { zinc_mg: 5.5, iron_mg: 2.6, vitaminB12_ug: 2.5, selenium_ug: 22 },
  },
  {
    name: 'Mandeln',
    ingredient: '100 g Mandeln',
    expect: { vitaminE_mg: 25.6, magnesium_mg: 270, calcium_mg: 269, potassium_mg: 733 },
  },
  {
    name: 'Vollmilch',
    ingredient: '250 ml Milch',
    expect: { calcium_mg: 300, vitaminB12_ug: 1.1, potassium_mg: 330 },
  },
  {
    name: 'Linsen gekocht',
    ingredient: '100 g Linsen',
    expect: { folate_ug: 181, iron_mg: 3.3, potassium_mg: 369, magnesium_mg: 36 },
  },
];

const SYSTEM_PROMPT = `Du bist ein Ernährungsexperte. Schätze die Nährwerte für die folgenden Zutaten. Die Mengen sind bereits für EINE Portion angegeben.

Gib das Ergebnis als JSON zurück:
{ "kcal": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number }

Runde die Makro-Nährwerte auf ganze Zahlen.
Antworte NUR mit dem JSON-Objekt.
${MICRO_PROMPT_FRAGMENT}`;

async function estimate(ingredient, name) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Zutaten für 1 Portion "${name}":\n${ingredient}` },
    ],
  });
  const text = completion.choices[0]?.message?.content || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return parseMicros(JSON.parse(cleaned));
}

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m';

let hardFails = 0, bandMisses = 0, checks = 0;

console.log(`\nMikronährstoff-Plausibilitätstest (Modell: ${MODEL})\n${'='.repeat(60)}`);

for (const fx of FIXTURES) {
  let micros;
  try {
    micros = await estimate(fx.ingredient, fx.name);
  } catch (err) {
    console.log(`\n${RED}✗ ${fx.name}: Schätzung fehlgeschlagen — ${err.message}${RESET}`);
    hardFails++;
    continue;
  }

  console.log(`\n${fx.name}  ${DIM}(${fx.ingredient})${RESET}`);
  for (const [key, ref] of Object.entries(fx.expect)) {
    checks++;
    const val = micros[key];
    const unit = MICRO_KEYS.find(m => m.key === key)?.unit ?? '';
    let status, color;
    if (val === undefined || !Number.isFinite(val) || val < 0 || val > CAP[key]) {
      status = 'HARD-FAIL'; color = RED; hardFails++;
    } else if (val < ref * REL_LOW || val > ref * REL_HIGH) {
      status = 'außerhalb Band'; color = YELLOW; bandMisses++;
    } else {
      status = 'ok'; color = GREEN;
    }
    const shown = val === undefined ? '—' : val;
    console.log(`  ${color}${status.padEnd(15)}${RESET} ${key.padEnd(14)} ${String(shown).padStart(7)} ${unit.padEnd(7)} ${DIM}(Referenz ~${ref})${RESET}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Prüfungen: ${checks} | ${GREEN}ok: ${checks - hardFails - bandMisses}${RESET} | ${YELLOW}Band verfehlt: ${bandMisses}${RESET} | ${RED}harte Fehler: ${hardFails}${RESET}`);
console.log(`${DIM}Harte Fehler = fehlend / negativ / über Cap → klares Problem. Band-Misses = unscharf, oft tolerierbar.${RESET}\n`);

process.exit(hardFails > 0 ? 1 : 0);
