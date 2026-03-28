import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'data', 'essensplaner.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations
const version = db.pragma('user_version', { simple: true });

if (version < 1) {
  console.log('Running migration v1: multi-meal slots...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_plan_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
      meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      servings INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO meal_plan_entries_new (id, plan_id, date, meal_type, meal_id, servings, enabled)
      SELECT id, plan_id, date, meal_type, meal_id, servings, enabled
      FROM meal_plan_entries WHERE meal_id IS NOT NULL;
    DROP TABLE meal_plan_entries;
    ALTER TABLE meal_plan_entries_new RENAME TO meal_plan_entries;
    CREATE INDEX idx_entries_plan_id ON meal_plan_entries(plan_id);
    CREATE INDEX idx_entries_slot ON meal_plan_entries(plan_id, date, meal_type);
  `);
  db.pragma('user_version = 1');
  console.log('✓ Migration v1 complete');
}

if (version < 2) {
  console.log('Running migration v2: cooking times...');
  // Check if columns already exist (fresh DB has them from schema)
  const cols = db.prepare("PRAGMA table_info(meals)").all().map(c => c.name);
  if (!cols.includes('prep_time')) {
    db.exec('ALTER TABLE meals ADD COLUMN prep_time INTEGER');
  }
  if (!cols.includes('total_time')) {
    db.exec('ALTER TABLE meals ADD COLUMN total_time INTEGER');
  }
  db.pragma('user_version = 2');
  console.log('✓ Migration v2 complete');
}

export default db;
