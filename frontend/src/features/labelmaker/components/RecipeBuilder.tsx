import { useEffect, useMemo, useState } from 'react';
import type { FsanzFood, IngredientTranslation, NutritionValues, RecipeIngredient, RecipeState, RecipeUnit } from '../types';
import {
  calculateRecipe,
  createCustomRecipeIngredient,
  createFsanzRecipeIngredient,
  generateIngredientsText,
  hasCjkText,
  recipeIngredientLabel,
  recipeUnits,
  searchFsanzFoodsByTerms,
} from '../domain/recipeNutrition';
import { trimNumber } from '../domain/nutrition';
import { fallbackIngredientLabelRefinement, refineIngredientLabels } from '../services/ingredientLabels';
import { translateIngredientQuery } from '../services/translation';

interface RecipeBuilderProps {
  productName: string;
  recipe: RecipeState;
  onRecipeChange: (recipe: RecipeState) => void;
  onApplyRecipe: (recipe: RecipeState, nutrition: NutritionValues) => void;
  onApplyIngredientsText: (recipe: RecipeState) => void;
}

const nutritionFields: Array<{ key: keyof NutritionValues; label: string; unit: string }> = [
  { key: 'energyKj', label: 'Energy', unit: 'kJ' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'fatTotalG', label: 'Fat (tot)', unit: 'g' },
  { key: 'fatSaturatedG', label: 'Fat (sat)', unit: 'g' },
  { key: 'carbohydrateG', label: 'Carb (tot)', unit: 'g' },
  { key: 'sugarsG', label: 'Sugars', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
];

export function RecipeBuilder({ productName, recipe, onRecipeChange, onApplyRecipe, onApplyIngredientsText }: RecipeBuilderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [translation, setTranslation] = useState<IngredientTranslation | null>(null);
  const [translationError, setTranslationError] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [refinementNote, setRefinementNote] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const searchTerms = useMemo(
    () => [searchQuery, ...(translation?.englishTerms ?? [])].filter(Boolean),
    [searchQuery, translation],
  );
  const searchResults = useMemo(() => searchFsanzFoodsByTerms(searchTerms, 12), [searchTerms]);
  const calculation = useMemo(() => calculateRecipe(recipe), [recipe]);
  const ingredientsText = useMemo(() => generateIngredientsText(recipe), [recipe]);

  useEffect(() => {
    const query = searchQuery.trim();
    setTranslationError('');
    if (!hasCjkText(query)) {
      setTranslation(null);
      setIsTranslating(false);
      return;
    }

    let ignore = false;
    setIsTranslating(true);
    const timeoutId = window.setTimeout(() => {
      translateIngredientQuery(query)
        .then((result) => {
          if (!ignore) setTranslation(result);
        })
        .catch((error: unknown) => {
          if (!ignore) {
            setTranslation(null);
            setTranslationError(error instanceof Error ? error.message : 'Translation service is unavailable.');
          }
        })
        .finally(() => {
          if (!ignore) setIsTranslating(false);
        });
    }, 350);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  function updateRecipe(patch: Partial<RecipeState>) {
    onRecipeChange({ ...recipe, ...patch });
  }

  function addFood(food: FsanzFood) {
    onRecipeChange({
      ...recipe,
      ingredients: [...recipe.ingredients, createFsanzRecipeIngredient(food)],
    });
    setSearchQuery('');
  }

  function addCustomIngredient() {
    onRecipeChange({
      ...recipe,
      ingredients: [...recipe.ingredients, createCustomRecipeIngredient()],
    });
  }

  function clearIngredients() {
    onRecipeChange({
      ...recipe,
      ingredients: [],
      finalWeightG: 0,
    });
  }

  function updateIngredient(id: string, patch: Partial<RecipeIngredient>) {
    onRecipeChange({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, ...patch } : ingredient,
      ),
    });
  }

  function updateIngredientNutrition(id: string, key: keyof NutritionValues, value: number) {
    onRecipeChange({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) =>
        ingredient.id === id
          ? { ...ingredient, nutritionPer100g: { ...ingredient.nutritionPer100g, [key]: value } }
          : ingredient,
      ),
    });
  }

  function removeIngredient(id: string) {
    onRecipeChange({
      ...recipe,
      ingredients: recipe.ingredients.filter((ingredient) => ingredient.id !== id),
    });
  }

  function applyRecipe() {
    onApplyRecipe(
      {
        ...recipe,
        finalWeightG: calculation.finalWeightG,
        serveSizeG: finiteOrZero(recipe.serveSizeG),
        servesPerPackage: finiteOrZero(recipe.servesPerPackage),
        lastAppliedAt: new Date().toISOString(),
      },
      calculation.finalPer100g,
    );
  }

  async function refineLabelsWithAi() {
    if (recipe.ingredients.length === 0) return;
    setIsRefining(true);
    setRefinementNote('');
    try {
      const result = await refineIngredientLabels(productName, recipe);
      applyRefinement(result);
    } catch (error) {
      const fallback = fallbackIngredientLabelRefinement(recipe);
      applyRefinement(fallback);
      setRefinementNote(error instanceof Error ? `${fallback.note} ${error.message}` : fallback.note);
    } finally {
      setIsRefining(false);
    }
  }

  function applyRefinement(result: { ingredients: Array<{ id: string; labelName: string; showPercentage: boolean }>; note: string }) {
    onRecipeChange({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => {
        const refined = result.ingredients.find((item) => item.id === ingredient.id);
        return refined
          ? { ...ingredient, labelName: refined.labelName, showPercentage: refined.showPercentage }
          : ingredient;
      }),
    });
    setRefinementNote(result.note);
  }

  return (
    <section className="recipe-builder">
      <div className="recipe-titlebar">
        <div>
          <h2>Build recipe and NIP</h2>
          <strong>Recipe Name : {productName || 'Untitled product'}</strong>
        </div>
      </div>

      <StepHeader number={1} title="Create recipe by adding ingredients and amounts" />
      <div className="recipe-search-row">
        <div className="recipe-search">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search FSANZ ingredients, e.g. beef or 牛肉"
          />
          {(translation || isTranslating || translationError) && (
            <div className={`translation-hint ${translationError ? 'error' : ''}`}>
              {isTranslating && 'Translating Chinese ingredient query...'}
              {!isTranslating && translation && `Translation hint: ${translation.displayHint || translation.englishTerms.join(', ')}`}
              {!isTranslating && translationError && translationError}
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="recipe-search-results">
              {searchResults.map((food) => (
                <button key={food.foodId} type="button" onClick={() => addFood(food)}>
                  <span>{food.foodName}</span>
                  <small>{food.description}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="recipe-action" onClick={addCustomIngredient}>
          + Create custom ingredient
        </button>
        <button type="button" className="recipe-action" onClick={refineLabelsWithAi} disabled={recipe.ingredients.length === 0 || isRefining}>
          {isRefining ? 'Refining...' : 'AI refine ingredients'}
        </button>
        <button type="button" className="recipe-action" onClick={clearIngredients} disabled={recipe.ingredients.length === 0}>
          Clear all ingredients
        </button>
      </div>

      <div className="recipe-table-wrap">
        <table className="recipe-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Unit</th>
              <th>Specific gravity</th>
              <th>Food name</th>
              {nutritionFields.map((field) => (
                <th key={field.key}>{field.label}<br />({field.unit})</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.length === 0 && (
              <tr className="recipe-note-row">
                <td colSpan={11}>
                  Values in this table indicate how much each ingredient contributes to the components per 100 g of the recipe before adjustments are made in Step 2 and Step 3.
                </td>
              </tr>
            )}
            {calculation.contributions.map(({ ingredient, contributionPer100g }) => (
              <tr key={ingredient.id}>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={ingredient.amount}
                    onChange={(event) => updateIngredient(ingredient.id, { amount: toNumber(event.target.value) })}
                  />
                </td>
                <td>
                  <select
                    value={ingredient.unit}
                    onChange={(event) => updateIngredient(ingredient.id, { unit: event.target.value as RecipeUnit })}
                  >
                    {recipeUnits.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={ingredient.specificGravity}
                    onChange={(event) => updateIngredient(ingredient.id, { specificGravity: toNumber(event.target.value) })}
                  />
                </td>
                <td>
                  {ingredient.source === 'custom' ? (
                    <div className="recipe-food-cell">
                      <input
                        value={ingredient.name}
                        onChange={(event) => updateIngredient(ingredient.id, { name: event.target.value, labelName: event.target.value })}
                      />
                      <label className="percentage-toggle">
                        <input
                          type="checkbox"
                          checked={ingredient.showPercentage === true}
                          onChange={(event) => updateIngredient(ingredient.id, { showPercentage: event.target.checked })}
                        />
                        Main ingredient %
                      </label>
                    </div>
                  ) : (
                    <div className="recipe-food-cell">
                      <span className="recipe-food-name">{ingredient.name}</span>
                      <input
                        aria-label={`Label ingredient name for ${ingredient.name}`}
                        value={ingredient.labelName ?? recipeIngredientLabel(ingredient)}
                        onChange={(event) => updateIngredient(ingredient.id, { labelName: event.target.value })}
                      />
                      <label className="percentage-toggle">
                        <input
                          type="checkbox"
                          checked={ingredient.showPercentage === true}
                          onChange={(event) => updateIngredient(ingredient.id, { showPercentage: event.target.checked })}
                        />
                        Main ingredient %
                      </label>
                    </div>
                  )}
                </td>
                {nutritionFields.map((field) => (
                  <td key={field.key}>{formatNumber(contributionPer100g[field.key])}</td>
                ))}
                <td>
                  <button type="button" onClick={() => removeIngredient(ingredient.id)}>Remove</button>
                </td>
              </tr>
            ))}
            <tr className="recipe-total-row">
              <td colSpan={4}>Total per 100 g</td>
              {nutritionFields.map((field) => (
                <td key={field.key}>{formatNumber(calculation.initialPer100g[field.key])}</td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {recipe.ingredients.some((ingredient) => ingredient.source === 'custom') && (
        <div className="custom-nutrients">
          {recipe.ingredients.filter((ingredient) => ingredient.source === 'custom').map((ingredient) => (
            <div className="custom-nutrient-card" key={ingredient.id}>
              <strong>{ingredient.name || 'Custom ingredient'}</strong>
              <div className="custom-nutrient-grid">
                {nutritionFields.map((field) => (
                  <label key={field.key}>
                    {field.label} ({field.unit})
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ingredient.nutritionPer100g[field.key]}
                      onChange={(event) => updateIngredientNutrition(ingredient.id, field.key, toNumber(event.target.value))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <StepHeader number={2} title="Enter recipe weights" />
      <div className="recipe-info-strip">Has your recipe gained or lost moisture? Enter the final cooked or packed recipe weight.</div>
      <div className="recipe-weight-grid">
        <MetricInput label="Initial weight" value={calculation.initialWeightG} suffix="g" readOnly />
        <MetricInput
          label="Final weight"
          value={recipe.finalWeightG || calculation.initialWeightG}
          suffix="g"
          onChange={(value) => updateRecipe({ finalWeightG: value })}
        />
        <MetricInput label="Weight change" value={calculation.weightChangePercent} suffix="%" readOnly />
      </div>

      <StepHeader number={3} title="Generate Nutrition Information Panel (NIP)" />
      <div className="recipe-serving-row">
        <MetricInput label="Serve size" value={recipe.serveSizeG} suffix="g" onChange={(value) => updateRecipe({ serveSizeG: value })} />
        <MetricInput
          label="Serves per package"
          value={recipe.servesPerPackage}
          onChange={(value) => updateRecipe({ servesPerPackage: value })}
        />
        <button className="primary" type="button" onClick={applyRecipe} disabled={calculation.initialWeightG <= 0}>
          Generate NIP and update label
        </button>
      </div>

      <div className="ingredients-text-panel">
        <div>
          <strong>English ingredients text</strong>
          <p>{ingredientsText}</p>
          <small>Edit the label ingredient names in the Food name column before applying.</small>
          {refinementNote && <small>{refinementNote}</small>}
        </div>
        <button type="button" onClick={() => onApplyIngredientsText(recipe)} disabled={recipe.ingredients.length === 0}>
          Apply ingredients text to label
        </button>
      </div>

      <div className="recipe-table-wrap compact">
        <table className="recipe-table">
          <thead>
            <tr>
              <th>Recipe name</th>
              {nutritionFields.map((field) => (
                <th key={field.key}>{field.label}<br />({field.unit})</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="recipe-note-row">
              <td colSpan={8}>All values are per 100 g/mL of the final recipe food as displayed on the NIP</td>
            </tr>
            <tr className="recipe-total-row">
              <td>{productName || 'Untitled product'}</td>
              {nutritionFields.map((field) => (
                <td key={field.key}>{formatNumber(calculation.finalPer100g[field.key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {recipe.lastAppliedAt && <div className="recipe-applied">Last applied {new Date(recipe.lastAppliedAt).toLocaleString()}</div>}
    </section>
  );
}

function StepHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="recipe-step-header">
      <span>STEP {number}</span>
      <strong>{title}</strong>
    </div>
  );
}

function MetricInput({
  label,
  value,
  suffix,
  readOnly,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  readOnly?: boolean;
  onChange?: (value: number) => void;
}) {
  return (
    <label className="metric-input">
      <span>{label}:</span>
      <input
        type="number"
        min={readOnly ? undefined : 0}
        step="0.1"
        value={Number.isFinite(value) ? trimNumber(value, 2) : '0'}
        readOnly={readOnly}
        onChange={(event) => onChange?.(toNumber(event.target.value))}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return trimNumber(Math.abs(value) < 0.005 ? 0 : value, 2);
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
