import type { AllergenKey, Ingredient } from '../types';

export const allergenLabels: Record<AllergenKey, string> = {
  wheat: 'wheat',
  barley: 'barley',
  oats: 'oats',
  rye: 'rye',
  fish: 'fish',
  crustacean: 'crustacean',
  mollusc: 'mollusc',
  egg: 'egg',
  milk: 'milk',
  lupin: 'lupin',
  peanut: 'peanut',
  soy: 'soy',
  sesame: 'sesame',
  almond: 'almond',
  brazilNut: 'Brazil nut',
  cashew: 'cashew',
  hazelnut: 'hazelnut',
  macadamia: 'macadamia',
  pecan: 'pecan',
  pineNut: 'pine nut',
  pistachio: 'pistachio',
  walnut: 'walnut',
  sulphites: 'sulphites',
};

export const allergenOrder: AllergenKey[] = [
  'wheat',
  'barley',
  'oats',
  'rye',
  'fish',
  'crustacean',
  'mollusc',
  'egg',
  'milk',
  'lupin',
  'peanut',
  'soy',
  'sesame',
  'almond',
  'brazilNut',
  'cashew',
  'hazelnut',
  'macadamia',
  'pecan',
  'pineNut',
  'pistachio',
  'walnut',
  'sulphites',
];

const patterns: Array<[AllergenKey, RegExp]> = [
  ['wheat', /\b(wheat|flour|semolina|spelt|durum|gluten)\b|小麦|小麥|面粉|麵粉/iu],
  ['barley', /\b(barley|malt)\b|大麦|大麥|麦芽|麥芽/iu],
  ['oats', /\b(oat|oats)\b|燕麦|燕麥/iu],
  ['rye', /\brye\b|黑麦|黑麥/iu],
  ['fish', /\b(fish|anchovy|bonito|cod|salmon|tuna|snapper)\b|鱼|魚|鲣|鮭|三文鱼/iu],
  ['crustacean', /\b(crustacean|crab|prawn|shrimp|lobster|crayfish)\b|虾|蝦|蟹|龙虾|龍蝦/iu],
  ['mollusc', /\b(mollusc|oyster|scallop|clam|mussel|squid|octopus|abalone)\b|蚝|蠔|扇贝|扇貝|鱿鱼|魷魚|鲍|鮑/iu],
  ['egg', /\b(egg|albumen|mayonnaise)\b|鸡蛋|雞蛋|蛋白|蛋黄|蛋黃/iu],
  ['milk', /\b(milk|whey|casein|cream|butter|cheese|lactose)\b|牛奶|乳|奶油|黄油|黃油|芝士|乳清/iu],
  ['lupin', /\blupin\b|羽扇豆/iu],
  ['peanut', /\b(peanut|groundnut)\b|花生/iu],
  ['soy', /\b(soy|soya|soybean|tofu|edamame)\b|大豆|黄豆|黃豆|豆腐|酱油|醬油/iu],
  ['sesame', /\bsesame\b|芝麻/iu],
  ['almond', /\balmond\b|杏仁/iu],
  ['brazilNut', /\bbrazil nut\b|巴西坚果|巴西堅果/iu],
  ['cashew', /\bcashew\b|腰果/iu],
  ['hazelnut', /\bhazelnut\b|榛子/iu],
  ['macadamia', /\bmacadamia\b|夏威夷果/iu],
  ['pecan', /\bpecan\b|碧根果|胡桃/iu],
  ['pineNut', /\bpine nut\b|松子/iu],
  ['pistachio', /\bpistachio\b|开心果|開心果/iu],
  ['walnut', /\bwalnut\b|核桃/iu],
  ['sulphites', /\b(sulphite|sulfite|sulphur dioxide|sulfur dioxide|metabisulphite|metabisulfite)\b|亚硫酸|亞硫酸/iu],
];

export function detectAllergens(name: string, sulphitesMgPerKg?: number): AllergenKey[] {
  const detected = new Set<AllergenKey>();
  for (const [key, pattern] of patterns) {
    if (pattern.test(name)) detected.add(key);
  }
  if (typeof sulphitesMgPerKg === 'number' && sulphitesMgPerKg >= 10) {
    detected.add('sulphites');
  }
  return sortAllergens([...detected]);
}

export function detectIngredientAllergens(ingredient: Ingredient): Ingredient {
  return {
    ...ingredient,
    allergenTags: detectAllergens(ingredient.name, ingredient.sulphitesMgPerKg),
  };
}

export function summariseAllergens(ingredients: Ingredient[]): AllergenKey[] {
  const tags = new Set<AllergenKey>();
  for (const ingredient of ingredients) {
    for (const tag of ingredient.allergenTags) tags.add(tag);
  }
  return sortAllergens([...tags]);
}

export function formatContains(ingredients: Ingredient[]): string {
  const tags = summariseAllergens(ingredients);
  if (tags.length === 0) return 'No FSANZ allergens identified from ingredients.';
  return `Contains: ${tags.map((tag) => allergenLabels[tag]).join(', ')}`;
}

function sortAllergens(tags: AllergenKey[]): AllergenKey[] {
  return tags.sort((a, b) => allergenOrder.indexOf(a) - allergenOrder.indexOf(b));
}
