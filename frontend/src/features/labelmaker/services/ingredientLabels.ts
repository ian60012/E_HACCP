import type { IngredientLabelRefinement, RecipeState } from '../types';
import {
  chooseDefaultCharacterisingIngredient,
  ingredientWeightG,
  recipeIngredientLabel,
  recipeIngredientPercentages,
} from '../domain/recipeNutrition';

export async function refineIngredientLabels(productName: string, recipe: RecipeState): Promise<IngredientLabelRefinement> {
  const percentages = recipeIngredientPercentages(recipe);
  const response = await fetch('/api/v1/labelmaker/refine-ingredient-labels', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      productName,
      ingredients: recipe.ingredients.map((ingredient) => ({
        id: ingredient.id,
        fsanzName: ingredient.name,
        currentLabelName: recipeIngredientLabel(ingredient),
        weightG: ingredientWeightG(ingredient),
        percentage: percentages.get(ingredient.id) ?? 0,
      })),
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  return sanitizeRefinement(await response.json(), recipe);
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function fallbackIngredientLabelRefinement(recipe: RecipeState): IngredientLabelRefinement {
  const defaultId = chooseDefaultCharacterisingIngredient(recipe);
  return {
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      labelName: recipeIngredientLabel(ingredient),
      showPercentage: ingredient.id === defaultId,
    })),
    note: 'AI unavailable; marked the largest ingoing ingredient as the main ingredient.',
  };
}

function sanitizeRefinement(value: unknown, recipe: RecipeState): IngredientLabelRefinement {
  const fallback = fallbackIngredientLabelRefinement(recipe);
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Partial<IngredientLabelRefinement>;
  const validIds = new Set(recipe.ingredients.map((ingredient) => ingredient.id));
  const ingredients = Array.isArray(record.ingredients)
    ? record.ingredients
        .map((item) => {
          const candidate = item as Partial<IngredientLabelRefinement['ingredients'][number]>;
          return {
            id: typeof candidate.id === 'string' ? candidate.id : '',
            labelName: typeof candidate.labelName === 'string' ? candidate.labelName.trim() : '',
            showPercentage: candidate.showPercentage === true,
          };
        })
        .filter((item) => validIds.has(item.id) && item.labelName)
    : [];

  return {
    ingredients: ingredients.length > 0 ? ingredients : fallback.ingredients,
    note: typeof record.note === 'string' ? record.note : fallback.note,
  };
}
