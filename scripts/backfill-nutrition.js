#!/usr/bin/env node
/**
 * Backfill nutrition estimates for all meals that have ingredients but no nutrition_per_serving
 * (or are missing micronutrients), plus the estimated portion weight for meals that lack it.
 * Uses the same prompts/parsing/auto-tags as the live endpoint (server/nutritionEstimate.js,
 * server/portionWeight.js).
 * Run with: node scripts/backfill-nutrition.js
 * Directly accesses DB and OpenAI — no running server needed.
 */

import Database from 'better-sqlite3';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import toml from '@iarna/toml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MICRO_KEYS } from '../server/nutritionMicros.js';
import {
  NUTRITION_MODEL, NUTRITION_SYSTEM_PROMPT, buildNutritionUserMessage, cleanJsonResponse,
  parseNutritionEstimate, mergeNutritionTags,
} from '../server/nutritionEstimate.js';
import {
  PORTION_WEIGHT_SYSTEM_PROMPT, buildPortionWeightUserMessage, parsePortionWeight,
} from '../server/portionWeight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Init DB
const db = new Database(join(rootDir, 'server/data/essensplaner.db'));
db.pragma('journal_mode = WAL');

// Init OpenAI
const config = toml.parse(readFileSync(join(rootDir, 'openai_credentials.toml'), 'utf-8'));
const openai = new OpenAI({ apiKey: config.key });

// Meals are candidates if they have no nutrition yet, OR have macros but are missing the
// micronutrient fields (added later). The JSON-key check is done in JS below.
const allMeals = db.prepare(`
  SELECT id, name, ingredients, default_servings, user_id, nutrition_per_serving, tags,
         portion_weight_g, recipe_text, total_time
  FROM meals
  WHERE ingredients != '[]' AND ingredients IS NOT NULL
`).all();

function needsEstimation(meal) {
  if (!meal.nutrition_per_serving) return true;
  let nutrition;
  try {
    nutrition = JSON.parse(meal.nutrition_per_serving);
  } catch {
    return true;
  }
  // Re-estimate if any micro field is missing (e.g. estimated before micros existed).
  return MICRO_KEYS.some(m => nutrition[m.key] === undefined);
}

const meals = allMeals.filter(needsEstimation);

// The portion weight is a separate, cheaper call: meals that already have valid nutrition
// only need the weight added, not a full re-estimate.
const weightOnly = allMeals.filter(m => !needsEstimation(m) && m.portion_weight_g == null);

console.log(`Found ${meals.length} meals needing (re-)estimation (incl. missing micronutrients).`);
console.log(`Found ${weightOnly.length} meals needing only a portion weight.\n`);

const updateStmt = db.prepare('UPDATE meals SET nutrition_per_serving = ? WHERE id = ?');
const updateTagsStmt = db.prepare('UPDATE meals SET nutrition_per_serving = ?, tags = ? WHERE id = ?');
const updateWeightStmt = db.prepare('UPDATE meals SET portion_weight_g = ? WHERE id = ?');

/** Estimate + store the weight of one ready-to-eat serving. Returns the grams, or null. */
async function backfillPortionWeight(meal) {
  const ingredients = JSON.parse(meal.ingredients);
  if (ingredients.length === 0) return null;

  const completion = await openai.chat.completions.create({
    model: NUTRITION_MODEL,
    messages: [
      { role: 'system', content: PORTION_WEIGHT_SYSTEM_PROMPT },
      { role: 'user', content: buildPortionWeightUserMessage(meal.name, ingredients, meal.default_servings, meal.recipe_text, meal.total_time) },
    ],
  });

  const weight = parsePortionWeight(JSON.parse(cleanJsonResponse(completion.choices[0]?.message?.content || '{}')));
  if (weight !== null) updateWeightStmt.run(weight, meal.id);
  return weight;
}

let success = 0, failed = 0;
let weightSuccess = 0, weightFailed = 0;

for (const meal of meals) {
  try {
    const ingredients = JSON.parse(meal.ingredients);
    if (ingredients.length === 0) continue;

    const completion = await openai.chat.completions.create({
      model: NUTRITION_MODEL,
      messages: [
        { role: 'system', content: NUTRITION_SYSTEM_PROMPT },
        { role: 'user', content: buildNutritionUserMessage(meal.name, ingredients, meal.default_servings) },
      ],
    });

    const text = completion.choices[0]?.message?.content || '{}';
    const { nutrition, aiTags } = parseNutritionEstimate(JSON.parse(cleanJsonResponse(text)));

    const existingTags = meal.tags ? JSON.parse(meal.tags) : [];
    const newTags = mergeNutritionTags(existingTags, aiTags, nutrition);
    if (JSON.stringify([...newTags].sort()) !== JSON.stringify([...existingTags].sort())) {
      updateTagsStmt.run(JSON.stringify(nutrition), JSON.stringify(newTags), meal.id);
    } else {
      updateStmt.run(JSON.stringify(nutrition), meal.id);
    }

    const weight = await backfillPortionWeight({ ...meal, portion_weight_g: null });
    if (weight !== null) weightSuccess++; else weightFailed++;

    console.log(`  ✓ ${meal.name}: ${nutrition.kcal} kcal [${aiTags.join(', ') || '-'}]${weight !== null ? ` · ${weight} g/Portion` : ''}`);
    success++;

    // Rate limit: small delay
    await new Promise(r => setTimeout(r, 300));
  } catch (err) {
    console.log(`  ✗ ${meal.name}: ${err.message}`);
    failed++;
  }
}

for (const meal of weightOnly) {
  try {
    const weight = await backfillPortionWeight(meal);
    if (weight === null) throw new Error('keine plausible Schätzung');
    console.log(`  ✓ ${meal.name}: ${weight} g/Portion`);
    weightSuccess++;
    await new Promise(r => setTimeout(r, 300));
  } catch (err) {
    console.log(`  ✗ ${meal.name} (Portionsgewicht): ${err.message}`);
    weightFailed++;
  }
}

console.log(`\nDone: ${success} estimated, ${failed} failed.`);
console.log(`Portion weights: ${weightSuccess} estimated, ${weightFailed} failed.`);
db.close();
