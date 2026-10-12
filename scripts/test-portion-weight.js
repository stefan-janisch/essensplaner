#!/usr/bin/env node
/**
 * Plausibility test for the portion weight estimation (server/portionWeight.js).
 *
 * Runs the real prompt on recipes whose ready-to-eat weight can be reasoned about by hand,
 * and checks the answer lands in a generous plausible band. The point is to catch GROSS
 * errors — raw ingredient sums for dishes that soak up water, forgetting that a stew boils
 * down for an hour, or 10x unit slips — not to pin down exact grams.
 *
 * Usage: node scripts/test-portion-weight.js [--model gpt-5.2]
 */

import OpenAI from 'openai';
import { readFileSync } from 'fs';
import toml from '@iarna/toml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { NUTRITION_MODEL, cleanJsonResponse } from '../server/nutritionEstimate.js';
import { PORTION_WEIGHT_SYSTEM_PROMPT, buildPortionWeightUserMessage, parsePortionWeight } from '../server/portionWeight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const modelArg = process.argv.indexOf('--model');
const MODEL = modelArg !== -1 ? process.argv[modelArg + 1] : NUTRITION_MODEL;

const config = toml.parse(readFileSync(join(rootDir, 'openai_credentials.toml'), 'utf-8'));
const openai = new OpenAI({ apiKey: config.key });

// Each fixture is a recipe for `servings` people; `expect` is the plausible band in grams
// for ONE ready-to-eat serving, with the reasoning that produced it.
const FIXTURES = [
  {
    name: 'Spaghetti Bolognese',
    servings: 2,
    ingredients: [
      { name: 'Spaghetti', amount: 250, unit: 'g' },
      { name: 'Rinderfaschiertes', amount: 300, unit: 'g' },
      { name: 'Passierte Tomaten', amount: 400, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'Stück' },
      { name: 'Olivenöl', amount: 20, unit: 'ml' },
    ],
    recipeText: 'Zwiebel anschwitzen, Faschiertes anbraten, Tomaten zugeben und 30 Minuten offen köcheln lassen. Spaghetti in Salzwasser al dente kochen und abgießen.',
    totalTime: 45,
    // 125 g Nudeln roh → ~290 g gegart, Sauce ~415 g roh minus Einkochen → ~340 g; großzügiges Rezept
    expect: [400, 700],
    why: 'Nudeln nehmen Wasser auf, Sauce kocht 30 Min offen ein',
  },
  {
    name: 'Porridge mit Beeren',
    servings: 1,
    ingredients: [
      { name: 'Haferflocken', amount: 80, unit: 'g' },
      { name: 'Milch', amount: 300, unit: 'ml' },
      { name: 'Heidelbeeren', amount: 100, unit: 'g' },
    ],
    recipeText: 'Haferflocken mit Milch aufkochen und 5 Minuten quellen lassen, Beeren untermischen.',
    totalTime: 10,
    // 480 g Zutaten, kaum Verdampfung bei 5 Minuten
    expect: [400, 500],
    why: 'Flüssigkeit wird aufgenommen, kaum Verlust',
  },
  {
    name: 'Linseneintopf',
    servings: 4,
    ingredients: [
      { name: 'Rote Linsen', amount: 300, unit: 'g' },
      { name: 'Gemüsebrühe', amount: 1500, unit: 'ml' },
      { name: 'Karotten', amount: 300, unit: 'g' },
      { name: 'Sellerie', amount: 200, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'Stück' },
    ],
    recipeText: 'Alles zusammen aufsetzen und 75 Minuten offen köcheln lassen, bis der Eintopf eindickt.',
    totalTime: 90,
    // ~2400 g roh, ~25 % der Brühe verdampft über 75 Min offen → ~2000 g / 4
    expect: [400, 650],
    why: 'langes offenes Köcheln reduziert deutlich',
  },
  {
    name: 'Rührei mit Vollkornbrot',
    servings: 1,
    ingredients: [
      { name: 'Eier', amount: 3, unit: 'Stück' },
      { name: 'Butter', amount: 15, unit: 'g' },
      { name: 'Vollkornbrot', amount: 60, unit: 'g' },
    ],
    recipeText: 'Eier in Butter stocken lassen, mit Brot servieren.',
    totalTime: 10,
    // 3 Eier ≈ 165 g, beim Braten etwas Wasserverlust, + 60 g Brot + Butter
    expect: [180, 280],
    why: 'kleine Mahlzeit, Stück→Gramm muss stimmen',
  },
  {
    name: 'Hähnchensalat',
    servings: 2,
    ingredients: [
      { name: 'Blattsalat', amount: 200, unit: 'g' },
      { name: 'Hähnchenbrust', amount: 300, unit: 'g' },
      { name: 'Tomaten', amount: 250, unit: 'g' },
      { name: 'Gurke', amount: 150, unit: 'g' },
      { name: 'Olivenöl', amount: 30, unit: 'ml' },
      { name: 'Salz', amount: 0, unit: 'NB' },
    ],
    recipeText: 'Hähnchenbrust braten, in Streifen schneiden, mit dem Gemüse und dem Öl vermengen.',
    totalTime: 20,
    // ~930 g roh, Hähnchen verliert ~25 % → ~890 g / 2
    expect: [350, 500],
    why: 'nur das Fleisch verliert Wasser, Rohkost bleibt',
  },
  {
    name: 'Ofengemüse mit Feta',
    servings: 2,
    ingredients: [
      { name: 'Zucchini', amount: 400, unit: 'g' },
      { name: 'Paprika', amount: 300, unit: 'g' },
      { name: 'Feta', amount: 200, unit: 'g' },
      { name: 'Olivenöl', amount: 30, unit: 'ml' },
    ],
    recipeText: '40 Minuten bei 200 °C im Ofen rösten.',
    totalTime: 50,
    // ~930 g roh, Gemüse verliert im Ofen ~20 % → ~790 g / 2
    expect: [300, 480],
    why: 'Röstverlust muss abgezogen werden',
  },
];

async function estimate(fixture) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: PORTION_WEIGHT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildPortionWeightUserMessage(
          fixture.name, fixture.ingredients, fixture.servings, fixture.recipeText, fixture.totalTime
        ),
      },
    ],
  });
  const text = completion.choices[0]?.message?.content || '{}';
  return parsePortionWeight(JSON.parse(cleanJsonResponse(text)));
}

console.log(`Portionsgewicht-Plausibilitätstest — Modell: ${MODEL}\n`);

let passed = 0, failed = 0;

for (const fixture of FIXTURES) {
  const [low, high] = fixture.expect;
  try {
    const grams = await estimate(fixture);
    if (grams === null) {
      console.log(`  ✗ ${fixture.name}: keine verwertbare Schätzung`);
      failed++;
      continue;
    }
    const ok = grams >= low && grams <= high;
    console.log(`  ${ok ? '✓' : '✗'} ${fixture.name}: ${grams} g/Portion (erwartet ${low}–${high} g — ${fixture.why})`);
    ok ? passed++ : failed++;
  } catch (err) {
    console.log(`  ✗ ${fixture.name}: ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${FIXTURES.length} plausibel, ${failed} auffällig.`);
process.exit(failed > 0 ? 1 : 0);
