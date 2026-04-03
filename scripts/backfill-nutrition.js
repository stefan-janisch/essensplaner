#!/usr/bin/env node
/**
 * Backfill nutrition estimates for all meals that have ingredients but no nutrition_per_serving.
 * Run with: node scripts/backfill-nutrition.js
 * Directly accesses DB and OpenAI — no running server needed.
 */

import Database from 'better-sqlite3';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import toml from '@iarna/toml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Init DB
const db = new Database(join(rootDir, 'server/data/essensplaner.db'));
db.pragma('journal_mode = WAL');

// Init OpenAI
const config = toml.parse(readFileSync(join(rootDir, 'openai_credentials.toml'), 'utf-8'));
const openai = new OpenAI({ apiKey: config.key });

const meals = db.prepare(`
  SELECT id, name, ingredients, default_servings, user_id
  FROM meals
  WHERE nutrition_per_serving IS NULL AND ingredients != '[]' AND ingredients IS NOT NULL
`).all();

console.log(`Found ${meals.length} meals without nutrition estimates.\n`);

const updateStmt = db.prepare('UPDATE meals SET nutrition_per_serving = ? WHERE id = ?');
const updateTagsStmt = db.prepare('UPDATE meals SET nutrition_per_serving = ?, tags = ? WHERE id = ?');

let success = 0, failed = 0;

for (const meal of meals) {
  try {
    const ingredients = JSON.parse(meal.ingredients);
    if (ingredients.length === 0) continue;

    const servings = meal.default_servings || 1;
    const ingredientList = ingredients.map(ing => {
      if (ing.unit === 'NB') return `${ing.name} (nach Belieben)`;
      const normalized = Number((ing.amount / servings).toFixed(2));
      return `${normalized} ${ing.unit} ${ing.name}`;
    }).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `Du bist ein Ernährungsexperte. Schätze die Nährwerte für die folgenden Zutaten. Die Mengen sind bereits für EINE Portion angegeben.

Gib das Ergebnis als JSON zurück:
{ "kcal": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number, "tags": string[] }

- kcal: Kilokalorien
- protein: Protein in Gramm
- carbs: Kohlenhydrate in Gramm
- fat: Fett in Gramm
- fiber: Ballaststoffe in Gramm
- sugar: ZUGESETZTER Zucker in Gramm (NUR Haushaltszucker, Honig, Sirup — NICHT natürlicher Zucker aus Obst, Milch etc.)
- tags: Array mit 0-2 Einträgen aus ["gesund", "kalorienarm"]:
  - "kalorienarm": wenn ≤ 500 kcal und fettarm
  - "gesund": ausgewogenes Verhältnis, reich an Ballaststoffen/Gemüse

Runde alle Nährwerte auf ganze Zahlen.
Antworte NUR mit dem JSON-Objekt.`
        },
        { role: 'user', content: `Zutaten für 1 Portion "${meal.name}":\n${ingredientList}` }
      ],
    });

    const text = completion.choices[0]?.message?.content || '{}';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const nutrition = {
      kcal: Math.round(Math.max(0, Number(parsed.kcal) || 0)),
      protein: Math.round(Math.max(0, Number(parsed.protein) || 0)),
      carbs: Math.round(Math.max(0, Number(parsed.carbs) || 0)),
      fat: Math.round(Math.max(0, Number(parsed.fat) || 0)),
      fiber: Math.round(Math.max(0, Number(parsed.fiber) || 0)),
      sugar: Math.round(Math.max(0, Number(parsed.sugar) || 0)),
    };

    // Auto-tagging
    const aiTags = Array.isArray(parsed.tags) ? parsed.tags.filter(t => ['gesund', 'kalorienarm'].includes(t)) : [];
    if (aiTags.length > 0) {
      const existingTags = meal.tags ? JSON.parse(meal.tags) : [];
      const nutritionTagSet = new Set(['eigenschaft:gesund', 'eigenschaft:kalorienarm']);
      const filteredTags = existingTags.filter(t => !nutritionTagSet.has(t));
      const newTags = [...filteredTags, ...aiTags.map(t => `eigenschaft:${t}`)];
      updateTagsStmt.run(JSON.stringify(nutrition), JSON.stringify(newTags), meal.id);
    } else {
      updateStmt.run(JSON.stringify(nutrition), meal.id);
    }

    console.log(`  ✓ ${meal.name}: ${nutrition.kcal} kcal [${aiTags.join(', ') || '-'}]`);
    success++;

    // Rate limit: small delay
    await new Promise(r => setTimeout(r, 300));
  } catch (err) {
    console.log(`  ✗ ${meal.name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${success} estimated, ${failed} failed.`);
db.close();
