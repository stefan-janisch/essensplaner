/**
 * "Sammelbegriffe" (umbrella terms) for the cook-from-pantry feature.
 *
 * When a user enters an umbrella term (e.g. "Gewürze") into their pantry, all of
 * its `members` are treated as available. Members match a recipe ingredient
 * DIRECTIONALLY: the (normalized) recipe ingredient name must CONTAIN the member
 * fragment. This is intentionally stricter than the bidirectional fuzzy match
 * used for free-text ingredients — otherwise a member like "paprikapulver" would
 * wrongly match the fresh vegetable "Paprika" (because the member string contains
 * "paprika"). Directional containment ("paprikapulver" ∈ recipe name) avoids that.
 *
 * All `aliases` and `members` must be lowercase/trimmed (normalized form).
 */
export interface IngredientGroup {
  /** Display label, also surfaced as an autocomplete suggestion. */
  key: string;
  /** Normalized terms that trigger this group when entered into the pantry. */
  aliases: string[];
  /** Normalized member fragments, matched directionally (recipeName.includes(member)). */
  members: string[];
}

export const INGREDIENT_GROUPS: IngredientGroup[] = [
  {
    key: 'Gewürze',
    aliases: ['gewürze', 'gewürz'],
    members: [
      'gewürz', 'salz', 'pfeffer', 'paprikapulver', 'currypulver', 'curry',
      'kreuzkümmel', 'kümmel', 'koriander', 'kurkuma', 'zimt', 'muskat', 'nelke',
      'kardamom', 'chilipulver', 'chiliflocken', 'cayenne', 'knoblauchpulver',
      'zwiebelpulver', 'oregano', 'thymian', 'rosmarin', 'majoran', 'lorbeer',
      'piment', 'anis', 'fenchelsamen', 'senf', 'safran', 'garam masala', 'sumach',
      'vanille', 'wacholder', 'bockshornklee', 'galgant', 'ingwerpulver',
    ],
  },
  {
    key: 'Frische Kräuter',
    aliases: ['frische kräuter', 'kräuter', 'kraeuter'],
    members: [
      'basilikum', 'petersilie', 'schnittlauch', 'dill', 'minze', 'salbei',
      'koriander', 'kerbel', 'estragon', 'bärlauch', 'liebstöckel',
      'zitronenmelisse', 'kresse', 'rosmarin', 'thymian', 'oregano',
    ],
  },
  {
    key: 'Öle',
    aliases: ['öle', 'öl', 'oel', 'speiseöl'],
    members: ['öl'],
  },
  {
    key: 'Essig',
    aliases: ['essig'],
    members: ['essig', 'balsamico'],
  },
  {
    key: 'Backzutaten',
    aliases: ['backzutaten', 'backsachen'],
    members: [
      'mehl', 'zucker', 'backpulver', 'natron', 'vanillezucker', 'vanillinzucker',
      'stärke', 'speisestärke', 'hefe', 'puderzucker', 'backkakao',
    ],
  },
];

/** Display labels for all umbrella terms (for autocomplete suggestions). */
export const INGREDIENT_GROUP_LABELS = INGREDIENT_GROUPS.map(g => g.key);
