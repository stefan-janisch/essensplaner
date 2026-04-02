import type { Meal } from '../types/index.js';
import { parseTag } from '../constants/tags';
import { getCategoryLabel } from '../constants/categories';

export type RatingComparator = 'gte' | 'eq' | 'lte';

export interface MealFilterOptions {
  starFilter: 'all' | 'starred';
  categoryFilter: string;
  tagFilter: string[];
  maxPrepTime: number | '' | null;
  maxTotalTime: number | '' | null;
  searchQuery: string;
  ratingFilter?: number | '';
  ratingComparator?: RatingComparator;
  minProtein?: number | '';
}

export type SortBy = 'name' | 'rating' | 'newest' | 'kcal' | 'protein' | 'fiber';

export function filterMeals(meals: Meal[], options: MealFilterOptions): Meal[] {
  const { starFilter, categoryFilter, tagFilter, maxPrepTime, maxTotalTime, searchQuery } = options;

  return meals.filter(meal => {
    if (starFilter === 'starred' && !meal.starred) return false;
    if (categoryFilter && meal.category !== categoryFilter) return false;
    if (tagFilter.length > 0) {
      const filtersByGroup: Record<string, string[]> = {};
      tagFilter.forEach(t => {
        const p = parseTag(t);
        if (p) {
          if (!filtersByGroup[p.key]) filtersByGroup[p.key] = [];
          filtersByGroup[p.key].push(t);
        }
      });
      for (const groupTags of Object.values(filtersByGroup)) {
        if (!groupTags.some(t => meal.tags?.includes(t))) return false;
      }
    }
    if (options.ratingFilter !== undefined && options.ratingFilter !== '') {
      const r = meal.rating || 0;
      const cmp = options.ratingComparator || 'gte';
      if (cmp === 'gte' && r < options.ratingFilter) return false;
      if (cmp === 'eq' && r !== options.ratingFilter) return false;
      if (cmp === 'lte' && r > options.ratingFilter) return false;
    }
    if (options.minProtein !== undefined && options.minProtein !== '') {
      const protein = meal.nutritionPerServing?.protein ?? 0;
      if (protein < options.minProtein) return false;
    }
    if (maxPrepTime) {
      const effectivePrepTime = meal.prepTime ?? meal.totalTime;
      if (!effectivePrepTime || effectivePrepTime > maxPrepTime) return false;
    }
    if (maxTotalTime && (!meal.totalTime || meal.totalTime > maxTotalTime)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return meal.name.toLowerCase().includes(q) ||
        meal.ingredients.some(ing => ing.name.toLowerCase().includes(q)) ||
        meal.tags?.some(t => t.toLowerCase().includes(q)) ||
        (meal.category && getCategoryLabel(meal.category)?.toLowerCase().includes(q));
    }
    return true;
  });
}

export function sortMeals(meals: Meal[], sortBy: SortBy, options?: { pinStarred?: boolean }): Meal[] {
  return [...meals].sort((a, b) => {
    if (options?.pinStarred) {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
    }
    switch (sortBy) {
      case 'rating': return (b.rating || 0) - (a.rating || 0);
      case 'newest': return (b.id > a.id ? 1 : -1);
      case 'kcal': return (a.nutritionPerServing?.kcal ?? Infinity) - (b.nutritionPerServing?.kcal ?? Infinity);
      case 'protein': return (b.nutritionPerServing?.protein ?? 0) - (a.nutritionPerServing?.protein ?? 0);
      case 'fiber': return (b.nutritionPerServing?.fiber ?? 0) - (a.nutritionPerServing?.fiber ?? 0);
      case 'name':
      default: return a.name.localeCompare(b.name);
    }
  });
}

export function buildTagValuesByGroup(meals: Meal[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  meals.forEach(m => m.tags?.forEach(t => {
    const p = parseTag(t);
    if (p) {
      if (!map[p.key]) map[p.key] = new Set();
      map[p.key].add(p.value);
    }
  }));
  return map;
}
