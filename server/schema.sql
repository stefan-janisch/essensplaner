CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  default_servings INTEGER NOT NULL DEFAULT 2,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_approved INTEGER NOT NULL DEFAULT 0,
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

-- Daily "Active Energy" from Apple Health, pushed by an iOS Shortcut via /api/activity/ingest
-- (token auth, users.health_token_hash). A later push for the same day overwrites it, so a
-- day sent while still in progress gets its final value on the next run.
CREATE TABLE IF NOT EXISTS activity_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  active_kcal REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);

-- Per-user nutrition log (opt-in via users.nutrition_log_enabled). Each row is a denormalized
-- snapshot of a planned entry up to today, kept in sync with the plan while the entry exists
-- (reconcileNutritionLogs) and kept as history once plan or recipe are deleted; only user_id
-- cascades. Normalization per person happens at report time.
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL,
  meal_id TEXT,
  meal_name TEXT,
  date TEXT NOT NULL,
  meal_type TEXT,
  servings INTEGER NOT NULL,
  persons INTEGER NOT NULL,
  nutrition_per_serving TEXT,
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON nutrition_logs(user_id, date);

-- Idempotency log for the monthly report push (one broadcast per month).
CREATE TABLE IF NOT EXISTS report_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month)
);

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
  -- Estimated weight of one ready-to-eat serving in grams (AI, see server/portionWeight.js).
  portion_weight_g INTEGER,
  is_quick INTEGER NOT NULL DEFAULT 0,
  -- Drink template for the ☕ counter (a QuickMeal that is hidden from the QuickMeal picker).
  is_drink INTEGER NOT NULL DEFAULT 0,
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
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  UNIQUE(plan_id, date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_disabled_slots_plan ON disabled_slots(plan_id);

-- Per-day person count for a plan. Overrides meal_plans.default_servings for that one day;
-- it is what day totals are divided by to get per-person values, and the default portion
-- count for meals added to that day. Absent row = use the plan's count.
CREATE TABLE IF NOT EXISTS plan_day_persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  persons INTEGER NOT NULL,
  UNIQUE(plan_id, date)
);
CREATE INDEX IF NOT EXISTS idx_day_persons_plan ON plan_day_persons(plan_id);

CREATE TABLE IF NOT EXISTS plan_slot_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  note TEXT NOT NULL,
  UNIQUE(plan_id, date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_slot_notes_plan ON plan_slot_notes(plan_id);

CREATE TABLE IF NOT EXISTS excluded_shopping_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  UNIQUE(plan_id, ingredient_name)
);
CREATE INDEX IF NOT EXISTS idx_excluded_plan ON excluded_shopping_ingredients(plan_id);

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

CREATE TABLE IF NOT EXISTS meal_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_shares_token ON meal_shares(token);

-- AI estimate of a canteen's day menu (NAPO, Mensa): every dish and side of that day separately,
-- so switching dishes later costs no new AI call. Kept 24 h and at least until the menu day is
-- over; menu_key changes when the published menu does.
CREATE TABLE IF NOT EXISTS canteen_estimates (
  canteen TEXT NOT NULL,
  date TEXT NOT NULL,
  menu_key TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (canteen, date)
);
