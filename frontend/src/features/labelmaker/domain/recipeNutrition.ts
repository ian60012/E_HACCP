import fsanzFoodsJson from '../data/fsanzFoods.json';
import type { FsanzFood, NutritionValues, RecipeIngredient, RecipeState, RecipeUnit } from '../types';
import { createClientId } from './clientId';
import { emptyNutrition } from './nutrition';

export const fsanzFoods = fsanzFoodsJson as FsanzFood[];

export interface RecipeIngredientContribution {
  ingredient: RecipeIngredient;
  weightG: number;
  contributionPer100g: NutritionValues;
}

export interface RecipeCalculation {
  initialWeightG: number;
  finalWeightG: number;
  weightChangePercent: number;
  initialPer100g: NutritionValues;
  finalPer100g: NutritionValues;
  contributions: RecipeIngredientContribution[];
}

export function createEmptyRecipe(productServingSizeG = 0, servingsPerPackage = 0): RecipeState {
  return {
    ingredients: [],
    finalWeightG: 0,
    serveSizeG: productServingSizeG,
    servesPerPackage: servingsPerPackage,
  };
}

export function createFsanzRecipeIngredient(food: FsanzFood): RecipeIngredient {
  return {
    id: createClientId('recipe-ingredient'),
    source: 'fsanz',
    foodId: food.foodId,
    name: food.foodName,
    labelName: suggestLabelIngredientName(food.foodName),
    showPercentage: false,
    amount: 0,
    unit: 'g',
    specificGravity: food.specificGravity || 1,
    nutritionPer100g: food.nutritionPer100g,
  };
}

export function createCustomRecipeIngredient(): RecipeIngredient {
  return {
    id: createClientId('recipe-ingredient'),
    source: 'custom',
    name: 'Custom ingredient',
    labelName: 'Custom ingredient',
    showPercentage: false,
    amount: 0,
    unit: 'g',
    specificGravity: 1,
    nutritionPer100g: emptyNutrition(),
  };
}

export function ingredientWeightG(ingredient: Pick<RecipeIngredient, 'amount' | 'unit' | 'specificGravity'>): number {
  const amount = finiteOrZero(ingredient.amount);
  if (amount <= 0) return 0;
  if (ingredient.unit === 'kg') return amount * 1000;
  if (ingredient.unit === 'mL') return amount * positiveGravity(ingredient.specificGravity);
  if (ingredient.unit === 'L') return amount * 1000 * positiveGravity(ingredient.specificGravity);
  return amount;
}

export function calculateRecipe(recipe: RecipeState): RecipeCalculation {
  const weightedTotals = emptyNutrition();
  const initialPer100g = emptyNutrition();
  const contributions = recipe.ingredients.map((ingredient) => {
    const weightG = ingredientWeightG(ingredient);
    addWeightedNutrition(weightedTotals, ingredient.nutritionPer100g, weightG / 100);
    return {
      ingredient,
      weightG,
      contributionPer100g: emptyNutrition(),
    };
  });
  const initialWeightG = contributions.reduce((sum, item) => sum + item.weightG, 0);
  const finalWeightG = finiteOrZero(recipe.finalWeightG) > 0 ? finiteOrZero(recipe.finalWeightG) : initialWeightG;
  const finalPer100g = emptyNutrition();

  if (initialWeightG > 0) {
    for (const contribution of contributions) {
      contribution.contributionPer100g = scaleNutrition(contribution.ingredient.nutritionPer100g, contribution.weightG / initialWeightG);
      addNutrition(initialPer100g, contribution.contributionPer100g);
    }
  }

  if (finalWeightG > 0) {
    copyNutrition(finalPer100g, scaleNutrition(weightedTotals, 100 / finalWeightG));
  }

  return {
    initialWeightG,
    finalWeightG,
    weightChangePercent: initialWeightG > 0 ? ((finalWeightG - initialWeightG) / initialWeightG) * 100 : 0,
    initialPer100g,
    finalPer100g,
    contributions,
  };
}

export function searchFsanzFoods(query: string, limit = 20): FsanzFood[] {
  return searchFsanzFoodsByTerms([query], limit);
}

export function searchFsanzFoodsByTerms(queries: string[], limit = 20): FsanzFood[] {
  const termGroups = queries
    .map((query) =>
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    )
    .filter((terms) => terms.length > 0);
  if (termGroups.length === 0) return [];

  return fsanzFoods
    .map((food) => ({ food, score: Math.max(...termGroups.map((terms) => scoreFood(food, terms))) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.foodName.localeCompare(b.food.foodName))
    .slice(0, limit)
    .map((item) => item.food);
}

export function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(value);
}

export function generateIngredientsText(recipe: RecipeState): string {
  const names = recipeIngredientNames(recipe);
  return names.length > 0 ? `Ingredients: ${names.join(', ')}` : 'Ingredients:';
}

export function recipeIngredientNames(recipe: RecipeState): string[] {
  const percentages = recipeIngredientPercentages(recipe);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const ingredient of recipe.ingredients
    .slice()
    .sort((a, b) => ingredientWeightG(b) - ingredientWeightG(a))) {
    const name = formatLabelIngredient(ingredient, percentages.get(ingredient.id) ?? 0);
    const key = stripPercentage(name).toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export function recipeIngredientLabel(ingredient: RecipeIngredient): string {
  const explicit = ingredient.labelName?.trim();
  if (explicit) return normalizeLabelIngredientName(explicit);
  return ingredient.source === 'fsanz' ? suggestLabelIngredientName(ingredient.name) : ingredient.name.trim();
}

export function recipeIngredientPercentages(recipe: RecipeState): Map<string, number> {
  const initialWeightG = recipe.ingredients.reduce((sum, ingredient) => sum + ingredientWeightG(ingredient), 0);
  return new Map(
    recipe.ingredients.map((ingredient) => [
      ingredient.id,
      initialWeightG > 0 ? (ingredientWeightG(ingredient) / initialWeightG) * 100 : 0,
    ]),
  );
}

export function formatLabelIngredient(ingredient: RecipeIngredient, percentage: number): string {
  const label = recipeIngredientLabel(ingredient);
  if (!label) return '';
  return ingredient.showPercentage ? `${label} (${formatCharacterisingPercentage(percentage)})` : label;
}

export function formatCharacterisingPercentage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value < 5) return `${roundToNearest(value, 0.5).toFixed(1).replace(/\.0$/, '')}%`;
  return `${Math.round(value)}%`;
}

export function chooseDefaultCharacterisingIngredient(recipe: RecipeState): string | null {
  let selected: RecipeIngredient | null = null;
  let selectedWeight = 0;
  for (const ingredient of recipe.ingredients) {
    const weight = ingredientWeightG(ingredient);
    if (weight > selectedWeight) {
      selected = ingredient;
      selectedWeight = weight;
    }
  }
  return selected?.id ?? null;
}

export function suggestLabelIngredientName(foodName: string): string {
  const parts = foodName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return foodName.trim();

  const usefulParts = parts.filter((part, index) => index === 0 || !isDatabaseDescriptor(part));
  const selected = reorderIngredientParts(usefulParts).slice(0, 3);
  const label = selected.join(' ').replace(/\s+/g, ' ').trim();
  return normalizeLabelIngredientName(titleCaseIngredient(label || parts[0]));
}

export const recipeUnits: RecipeUnit[] = ['g', 'kg', 'mL', 'L'];

function scoreFood(food: FsanzFood, terms: string[]): number {
  const name = food.foodName.toLowerCase();
  const description = food.description.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (name === term) score += 100;
    else if (name.startsWith(term)) score += 45;
    else if (name.includes(term)) score += 25;
    else if (description.includes(term)) score += 6;
    else return 0;
  }
  return score;
}

function isDatabaseDescriptor(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === 'raw' ||
    normalized === 'cooked' ||
    normalized === 'boiled' ||
    normalized === 'baked' ||
    normalized === 'fried' ||
    normalized === 'grilled' ||
    normalized === 'roasted' ||
    normalized === 'stewed' ||
    normalized === 'steamed' ||
    normalized === 'drained' ||
    normalized === 'undrained' ||
    normalized === 'unprepared' ||
    normalized === 'prepared' ||
    normalized === 'commercial' ||
    normalized === 'homemade' ||
    normalized === 'regular' ||
    normalized === 'asian' ||
    normalized === 'style' ||
    normalized === 'asian style' ||
    normalized === 'fully-trimmed' ||
    normalized === 'semi-trimmed' ||
    normalized === 'untrimmed' ||
    normalized.startsWith('with ') ||
    normalized.startsWith('without ') ||
    normalized.startsWith('no added ') ||
    normalized.startsWith('added ') ||
    normalized.startsWith('reduced ') ||
    normalized.includes('not further defined') ||
    normalized.includes('nfd')
  );
}

function reorderIngredientParts(parts: string[]): string[] {
  if (parts.length < 2) return parts;
  const first = parts[0].toLowerCase();
  if (postpositiveIngredientClasses.has(first)) {
    return [parts[1], parts[0], ...parts.slice(2)];
  }
  return parts;
}

const postpositiveIngredientClasses = new Set([
  'sauce',
  'paste',
  'dressing',
  'marinade',
  'seasoning',
  'stock',
  'broth',
  'soup',
  'gravy',
]);

function normalizeLabelIngredientName(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return value.trim();
  const normalizedWords = words.map((word) => word.toLowerCase());

  for (const ingredientClass of postpositiveIngredientClasses) {
    const classIndex = normalizedWords.indexOf(ingredientClass);
    if (classIndex === 0 && words.length >= 2) {
      return titleCaseIngredient([words[1], words[0], ...words.slice(2)].join(' '));
    }
  }

  return titleCaseIngredient(words.filter((word) => !isDatabaseDescriptor(word)).join(' '));
}

function titleCaseIngredient(value: string): string {
  return value
    .split(' ')
    .map((word) => {
      if (word.length <= 2 && word === word.toUpperCase()) return word;
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
}

function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function stripPercentage(value: string): string {
  return value.replace(/\s*\(\d+(?:\.\d+)?%\)/g, '').trim();
}

function addWeightedNutrition(target: NutritionValues, values: NutritionValues, factor: number) {
  target.energyKj += values.energyKj * factor;
  target.proteinG += values.proteinG * factor;
  target.fatTotalG += values.fatTotalG * factor;
  target.fatSaturatedG += values.fatSaturatedG * factor;
  target.carbohydrateG += values.carbohydrateG * factor;
  target.sugarsG += values.sugarsG * factor;
  target.sodiumMg += values.sodiumMg * factor;
}

function addNutrition(target: NutritionValues, values: NutritionValues) {
  addWeightedNutrition(target, values, 1);
}

function scaleNutrition(values: NutritionValues, factor: number): NutritionValues {
  return {
    energyKj: values.energyKj * factor,
    proteinG: values.proteinG * factor,
    fatTotalG: values.fatTotalG * factor,
    fatSaturatedG: values.fatSaturatedG * factor,
    carbohydrateG: values.carbohydrateG * factor,
    sugarsG: values.sugarsG * factor,
    sodiumMg: values.sodiumMg * factor,
  };
}

function copyNutrition(target: NutritionValues, values: NutritionValues) {
  target.energyKj = values.energyKj;
  target.proteinG = values.proteinG;
  target.fatTotalG = values.fatTotalG;
  target.fatSaturatedG = values.fatSaturatedG;
  target.carbohydrateG = values.carbohydrateG;
  target.sugarsG = values.sugarsG;
  target.sodiumMg = values.sodiumMg;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function positiveGravity(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
