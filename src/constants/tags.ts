export const TAG_GROUPS = [
  { key: 'küche', label: 'Küche', values: [
    'italienisch', 'französisch', 'asiatisch', 'mexikanisch', 'indisch',
    'griechisch', 'türkisch', 'deutsch', 'japanisch', 'thailändisch',
    'orientalisch', 'mediterran', 'amerikanisch', 'österreichisch', 'ungarisch', 'russisch',
  ]},
  { key: 'schwierigkeit', label: 'Schwierigkeit', values: [
    'leicht', 'mittel', 'anspruchsvoll',
  ]},
  { key: 'ernährung', label: 'Ernährung', values: [
    'vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'low-carb', 'high-protein',
  ]},
  { key: 'eigenschaft', label: 'Eigenschaften', values: [
    'schnell', 'günstig', 'kinderfreundlich', 'meal-prep', 'einfrierbar', 'one-pot', 'kalorienarm', 'gesund', 'haute-cuisine',
  ]},
];

export function parseTag(tag: string): { key: string; value: string } | null {
  const idx = tag.indexOf(':');
  if (idx === -1) return null;
  return { key: tag.substring(0, idx), value: tag.substring(idx + 1) };
}

export function formatTag(key: string, value: string): string {
  return `${key}:${value}`;
}

export function getGroupLabel(key: string): string {
  return TAG_GROUPS.find(g => g.key === key)?.label || key;
}
