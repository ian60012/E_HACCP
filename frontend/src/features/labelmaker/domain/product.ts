import type { ProductTemplate } from '../types';
import { emptyNutrition, validateNutrition } from './nutrition';
import { createEmptyRecipe } from './recipeNutrition';

export const defaultFactoryInformation = 'FD CATERING SERVICE PTY LTD\nUnit 3, 31 Ascot Vale Road, Flemington VIC 3031';

export function normalizeFactoryInformation(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'FD CATERING SERVICE' || trimmed === 'FD CATERING SERVICE PTY LTD') {
    return defaultFactoryInformation;
  }
  if (!trimmed.includes('31 Ascot Vale Road')) {
    return `${trimmed}\nUnit 3, 31 Ascot Vale Road, Flemington VIC 3031`;
  }
  return value;
}

export function createProductTemplate(): ProductTemplate {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    productNameZh: '',
    productNameEn: '',
    netWeightG: 2500,
    servingSizeG: 2500,
    servingsPerPackage: 1,
    ingredients: [],
    storageConditions: 'To be stored and distributed at refrigerated temperatures -18°C for 12 months.',
    customerText: normalizeFactoryInformation(defaultFactoryInformation),
    nutritionPer100g: emptyNutrition(),
    recipe: createEmptyRecipe(2500, 1),
    createdAt: now,
    updatedAt: now,
  };
}

export function createBeefBoneTemplate(): ProductTemplate {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    productNameZh: '熟制牛汤骨海底捞专供',
    productNameEn: 'Cooked Beef Soup Bone',
    netWeightG: 2500,
    servingSizeG: 2500,
    servingsPerPackage: 1,
    ingredients: [
      {
        id: crypto.randomUUID(),
        name: 'Beef Soup Bone',
        allergenTags: [],
      },
    ],
    storageConditions: 'To be stored and distributed at refrigerated temperatures -18°C for 12 months.',
    customerText: normalizeFactoryInformation(defaultFactoryInformation),
    nutritionPer100g: {
      energyKj: 820,
      proteinG: 25.3,
      fatTotalG: 10.6,
      fatSaturatedG: 0,
      carbohydrateG: 0,
      sugarsG: 0,
      sodiumMg: 59,
    },
    recipe: createEmptyRecipe(2500, 1),
    createdAt: now,
    updatedAt: now,
  };
}

export function validateProduct(product: ProductTemplate, expiryDate?: string): string[] {
  const errors: string[] = [];
  if (!product.productNameEn.trim()) errors.push('English product name is required.');
  if (!product.productNameZh.trim()) errors.push('Chinese product name is required.');
  if (!Number.isFinite(product.netWeightG) || product.netWeightG <= 0) errors.push('Net weight must be greater than zero.');
  if (!Number.isFinite(product.servingSizeG) || product.servingSizeG <= 0) errors.push('Serving size must be greater than zero.');
  if (!Number.isFinite(product.servingsPerPackage) || product.servingsPerPackage <= 0) errors.push('Servings per package must be greater than zero.');
  if (product.ingredients.length === 0 || product.ingredients.some((ingredient) => !ingredient.name.trim())) {
    errors.push('At least one ingredient name is required.');
  }
  if (!product.storageConditions.trim()) errors.push('Storage conditions are required.');
  if (!product.allergensConfirmedAt) errors.push('Allergen review must be confirmed before printing.');
  if (expiryDate !== undefined && !expiryDate) errors.push('Expiry date is required before printing.');
  errors.push(...validateNutrition(product.nutritionPer100g));
  return errors;
}
