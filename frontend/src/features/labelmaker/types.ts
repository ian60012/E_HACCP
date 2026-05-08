export type AllergenKey =
  | 'wheat'
  | 'barley'
  | 'oats'
  | 'rye'
  | 'fish'
  | 'crustacean'
  | 'mollusc'
  | 'egg'
  | 'milk'
  | 'lupin'
  | 'peanut'
  | 'soy'
  | 'sesame'
  | 'almond'
  | 'brazilNut'
  | 'cashew'
  | 'hazelnut'
  | 'macadamia'
  | 'pecan'
  | 'pineNut'
  | 'pistachio'
  | 'walnut'
  | 'sulphites';

export interface Ingredient {
  id: string;
  name: string;
  allergenTags: AllergenKey[];
  sulphitesMgPerKg?: number;
}

export interface NutritionValues {
  energyKj: number;
  proteinG: number;
  fatTotalG: number;
  fatSaturatedG: number;
  carbohydrateG: number;
  sugarsG: number;
  sodiumMg: number;
}

export interface FsanzFood {
  foodId: string;
  foodName: string;
  description: string;
  specificGravity: number;
  nutritionPer100g: NutritionValues;
}

export type RecipeIngredientSource = 'fsanz' | 'custom';
export type RecipeUnit = 'g' | 'kg' | 'mL' | 'L';

export interface RecipeIngredient {
  id: string;
  source: RecipeIngredientSource;
  foodId?: string;
  name: string;
  labelName?: string;
  showPercentage?: boolean;
  amount: number;
  unit: RecipeUnit;
  specificGravity: number;
  nutritionPer100g: NutritionValues;
}

export interface RecipeState {
  ingredients: RecipeIngredient[];
  finalWeightG: number;
  serveSizeG: number;
  servesPerPackage: number;
  lastAppliedAt?: string;
}

export interface IngredientTranslation {
  englishTerms: string[];
  displayHint: string;
  confidence: number;
}

export interface RefinedIngredientLabel {
  id: string;
  labelName: string;
  showPercentage: boolean;
}

export interface IngredientLabelRefinement {
  ingredients: RefinedIngredientLabel[];
  note: string;
}

export interface ProductTemplate {
  id: string;
  productNameZh: string;
  productNameEn: string;
  netWeightG: number;
  servingSizeG: number;
  servingsPerPackage: number;
  ingredients: Ingredient[];
  storageConditions: string;
  customerText: string;
  nutritionPer100g: NutritionValues;
  recipe?: RecipeState;
  allergensConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabelPrintData {
  product: ProductTemplate;
  expiryDate: string;
}

export interface LabelmakerApi {
  listProducts(): Promise<ProductTemplate[]>;
  saveProduct(product: ProductTemplate): Promise<ProductTemplate>;
  deleteProduct(id: string): Promise<boolean>;
  exportPdf(payload: { html: string; fileName: string }): Promise<{ canceled: boolean; filePath?: string }>;
}

declare global {
  interface Window {
    labelmaker?: LabelmakerApi;
  }
}
