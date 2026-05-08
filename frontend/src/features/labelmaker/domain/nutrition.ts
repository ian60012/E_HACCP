import type { NutritionValues, ProductTemplate } from '../types';

export const emptyNutrition = (): NutritionValues => ({
  energyKj: 0,
  proteinG: 0,
  fatTotalG: 0,
  fatSaturatedG: 0,
  carbohydrateG: 0,
  sugarsG: 0,
  sodiumMg: 0,
});

export function perServing(product: ProductTemplate): NutritionValues {
  const factor = product.servingSizeG / 100;
  return {
    energyKj: product.nutritionPer100g.energyKj * factor,
    proteinG: product.nutritionPer100g.proteinG * factor,
    fatTotalG: product.nutritionPer100g.fatTotalG * factor,
    fatSaturatedG: product.nutritionPer100g.fatSaturatedG * factor,
    carbohydrateG: product.nutritionPer100g.carbohydrateG * factor,
    sugarsG: product.nutritionPer100g.sugarsG * factor,
    sodiumMg: product.nutritionPer100g.sodiumMg * factor,
  };
}

export function formatEnergy(value: number): string {
  return `${Math.round(value)} kJ`;
}

export function formatGrams(value: number): string {
  if (value === 0) return '0 g';
  if (value < 1) return `${trimNumber(value, 2)} g`;
  if (value < 10) return `${trimNumber(value, 1)} g`;
  return `${Math.round(value)} g`;
}

export function formatMilligrams(value: number): string {
  return `${Math.round(value)} mg`;
}

export function trimNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function validateNutrition(values: NutritionValues): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${key} must be zero or greater.`);
    }
  }
  return errors;
}
