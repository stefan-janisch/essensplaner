export const RECIPE_CATEGORIES = [
  { value: 'hauptgericht', label: 'Hauptgericht' },
  { value: 'beilage', label: 'Beilage' },
  { value: 'vorspeise', label: 'Vorspeise' },
  { value: 'suppe', label: 'Suppe' },
  { value: 'salat', label: 'Salat' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'snack', label: 'Snack' },
  { value: 'fruehstueck', label: 'Frühstück' },
  { value: 'getraenk', label: 'Getränk' },
  { value: 'brot_gebaeck', label: 'Brot & Gebäck' },
  { value: 'sauce_dip', label: 'Sauce & Dip' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const;

export function getCategoryLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return RECIPE_CATEGORIES.find(c => c.value === value)?.label;
}
