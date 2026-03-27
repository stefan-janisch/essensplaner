# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev (client + server):** `npm run dev`
- **Dev client only:** `npm run dev:client` (Vite on port 5173)
- **Dev server only:** `npm run dev:server` (Express on port 3001)
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Lint:** `npm run lint`
- **Production start:** `npm start` (serves built client from `dist/`)

No test framework is configured.

## Architecture

German-language meal planning app ("Essensplaner"). React/TypeScript frontend + Express backend.

### Frontend (src/)

- **State management:** Single React context (`MealPlanContext`) holds all app state (meals, plan entries, date range). Persisted to `localStorage` under keys `essensplaner_plan` and `essensplaner_meals`.
- **Drag-and-drop:** Uses `@dnd-kit` — meals are dragged from `MealHistory` onto slots in `MealPlanTable`. DnD wiring lives in `App.tsx`.
- **Types:** All domain types in `src/types/index.ts` — `Meal`, `Ingredient`, `MealPlanEntry`, `MealPlanState`, `MealType` (breakfast/lunch/dinner).
- **Shopping list aggregation:** `src/utils/shoppingListAggregator.ts` — scales ingredient amounts by servings and aggregates across all enabled plan entries, grouping by normalized ingredient name and unit.

### Backend (server/index.js)

Plain Express server (no TypeScript). Three API endpoints:

- `POST /api/parse-recipe-url` — fetches a recipe webpage, sends HTML to OpenAI GPT-4.1 to extract name, ingredients, recipe text, and servings.
- `POST /api/parse-ingredients` — sends raw ingredient text to GPT-4.1 for structured parsing into `{name, amount, unit}` objects. Filters out salt/pepper. Units normalized to g/ml/Stück.
- `POST /api/bring-export` + `GET /api/bring-export/:id` — generates an HTML page with schema.org Recipe JSON-LD for import into the Bring! shopping list app. Stored in-memory with 1-hour expiry.

OpenAI credentials are read from `openai_credentials.toml` at the project root.

### Key design decisions

- All LLM prompts are in German and instruct the model to return German ingredient names.
- Ingredient units are restricted to three values: `"g"`, `"ml"`, `"Stück"` (plus `"Nach Belieben"` for taste-based amounts).
- Meals have `defaultServings`; plan entries have their own `servings` count — the shopping list scales proportionally.
