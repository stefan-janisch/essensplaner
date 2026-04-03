CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  default_servings INTEGER NOT NULL DEFAULT 2,
  is_admin INTEGER NOT NULL DEFAULT 0,
  nutrition_targets TEXT,
  meals_per_day INTEGER NOT NULL DEFAULT 3,
  nutrition_profile TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weight_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight REAL NOT NULL,
  body_fat REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_weight_history_user ON weight_history(user_id, date);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  default_servings INTEGER NOT NULL DEFAULT 2,
  starred INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  category TEXT,
  tags TEXT,
  photo_url TEXT,
  recipe_url TEXT,
  comment TEXT,
  recipe_text TEXT,
  prep_time INTEGER,
  total_time INTEGER,
  nutrition_per_serving TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);

CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'weekly' CHECK(plan_type IN ('weekly', 'menu')),
  start_date TEXT,
  end_date TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  default_servings INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'misc', 'food')),
  meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  servings INTEGER NOT NULL DEFAULT 2,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_entries_plan_id ON meal_plan_entries(plan_id);
CREATE INDEX IF NOT EXISTS idx_entries_slot ON meal_plan_entries(plan_id, date, meal_type);

CREATE TABLE IF NOT EXISTS plan_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('snacks', 'drinks', 'misc', 'food')),
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Stück',
  enabled INTEGER NOT NULL DEFAULT 1,
  course_id INTEGER REFERENCES menu_courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_extras_plan_id ON plan_extras(plan_id);

CREATE TABLE IF NOT EXISTS menu_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_menu_courses_plan_id ON menu_courses(plan_id);

CREATE TABLE IF NOT EXISTS plan_collaborators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plan_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_collaborators_user ON plan_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_collaborators_plan ON plan_collaborators(plan_id);

CREATE TABLE IF NOT EXISTS plan_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plan_shares_token ON plan_shares(token);

CREATE TABLE IF NOT EXISTS disabled_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
  UNIQUE(plan_id, date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_disabled_slots_plan ON disabled_slots(plan_id);

CREATE TABLE IF NOT EXISTS ingredient_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_name TEXT NOT NULL,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ingredient_name, from_unit, to_unit)
);
CREATE INDEX IF NOT EXISTS idx_conv_name ON ingredient_conversions(ingredient_name);
