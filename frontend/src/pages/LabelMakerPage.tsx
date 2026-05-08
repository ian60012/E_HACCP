import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/outline';
import { labelmakerApi, LabelTemplate, LabelTemplatePayload } from '@/api/labelmaker';
import { packTypesApi, prodProductsApi } from '@/api/production';
import { PackTypeConfig, ProdProduct } from '@/types/production';
import ErrorCard from '@/components/ErrorCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { RecipeBuilder } from '@/features/labelmaker/components/RecipeBuilder';
import type { AllergenKey, Ingredient, NutritionValues, ProductTemplate, RecipeState } from '@/features/labelmaker/types';
import { allergenLabels, allergenOrder, detectIngredientAllergens, formatContains, summariseAllergens } from '@/features/labelmaker/domain/allergens';
import { buildLabelHtml, makePdfFileName } from '@/features/labelmaker/domain/labelHtml';
import { formatEnergy, formatGrams, formatMilligrams, perServing } from '@/features/labelmaker/domain/nutrition';
import { defaultFactoryInformation, validateProduct } from '@/features/labelmaker/domain/product';
import { createEmptyRecipe, recipeIngredientNames } from '@/features/labelmaker/domain/recipeNutrition';

const nutritionFields: Array<{ key: keyof NutritionValues; label: string; unit: string }> = [
  { key: 'energyKj', label: 'Energy', unit: 'kJ' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'fatTotalG', label: 'Fat, total', unit: 'g' },
  { key: 'fatSaturatedG', label: 'Fat, saturated', unit: 'g' },
  { key: 'carbohydrateG', label: 'Carbohydrate', unit: 'g' },
  { key: 'sugarsG', label: 'Sugars', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
];

type LabelView = 'label' | 'calculator';

export default function LabelMakerPage() {
  const [products, setProducts] = useState<ProdProduct[]>([]);
  const [packTypes, setPackTypes] = useState<PackTypeConfig[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [selectedPackType, setSelectedPackType] = useState('');
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProductTemplate | null>(null);
  const [shelfLifeDays, setShelfLifeDays] = useState(365);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<LabelView>('label');

  useEffect(() => {
    Promise.all([
      prodProductsApi.list({ limit: 1000 }),
      packTypesApi.list({ show_inactive: false }),
    ])
      .then(([productRes, packTypeRes]) => {
        setProducts(productRes.items);
        setPackTypes(packTypeRes);
        setSelectedProductId(productRes.items[0]?.id ?? '');
      })
      .catch(() => setError('Failed to load product and pack type data.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const applicablePackTypes = useMemo(() => {
    if (!selectedProduct) return [];
    return packTypes.filter((packType) =>
      packType.applicable_type === 'both' || packType.applicable_type === selectedProduct.product_type
    );
  }, [packTypes, selectedProduct]);

  useEffect(() => {
    if (!applicablePackTypes.some((packType) => packType.code === selectedPackType)) {
      setSelectedPackType(applicablePackTypes[0]?.code ?? '');
    }
  }, [applicablePackTypes, selectedPackType]);

  const loadTemplate = useCallback(async () => {
    if (!selectedProduct || !selectedPackType) {
      setDraft(null);
      setTemplateId(null);
      return;
    }
    setError('');
    setMessage('');
    try {
      const template = await labelmakerApi.getTemplateByProductPack(selectedProduct.id, selectedPackType);
      setDraft(fromTemplate(template));
      setShelfLifeDays(template.shelf_life_days);
      setTemplateId(template.id);
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        setError(err?.response?.data?.detail || 'Failed to load label template.');
        return;
      }
      const packType = applicablePackTypes.find((item) => item.code === selectedPackType) ?? null;
      const next = createDefaultTemplate(selectedProduct, packType);
      setDraft(next);
      setShelfLifeDays(365);
      setTemplateId(null);
      setMessage('No template exists for this product and pack type yet.');
    }
  }, [applicablePackTypes, selectedPackType, selectedProduct]);

  useEffect(() => { loadTemplate(); }, [loadTemplate]);

  const expiryDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + shelfLifeDays);
    return date.toISOString().slice(0, 10);
  }, [shelfLifeDays]);

  const servingValues = useMemo(() => (draft ? perServing(draft) : null), [draft]);
  const containsText = useMemo(() => (draft ? formatContains(draft.ingredients) : ''), [draft]);
  const printErrors = useMemo(() => (draft ? validateProduct(draft, expiryDate) : []), [draft, expiryDate]);
  const labelHtml = useMemo(() => (draft ? buildLabelHtml({ product: draft, expiryDate }) : ''), [draft, expiryDate]);

  function updateDraft(patch: Partial<ProductTemplate>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateNutrition(key: keyof NutritionValues, value: number) {
    setDraft((current) =>
      current
        ? { ...current, nutritionPer100g: { ...current.nutritionPer100g, [key]: value } }
        : current,
    );
  }

  function updateRecipe(recipe: RecipeState) {
    updateDraft({ recipe });
  }

  function applyRecipe(recipe: RecipeState, nutritionPer100g: NutritionValues) {
    setDraft((current) =>
      current
        ? {
            ...current,
            recipe,
            servingSizeG: recipe.serveSizeG > 0 ? recipe.serveSizeG : current.servingSizeG,
            servingsPerPackage: recipe.servesPerPackage > 0 ? recipe.servesPerPackage : current.servingsPerPackage,
            nutritionPer100g,
          }
        : current,
    );
    setMessage('Recipe NIP values applied to the label nutrition panel.');
  }

  function applyRecipeIngredients(recipe: RecipeState) {
    const names = recipeIngredientNames(recipe);
    if (names.length === 0) return;
    setDraft((current) => {
      if (!current) return current;
      const existingByName = new Map(current.ingredients.map((ingredient) => [ingredient.name.trim().toLowerCase(), ingredient]));
      return {
        ...current,
        allergensConfirmedAt: undefined,
        ingredients: names.map((name) => {
          const existing = existingByName.get(name.toLowerCase());
          return existing ? { ...existing, name } : { id: crypto.randomUUID(), name, allergenTags: [] };
        }),
      };
    });
    setMessage('Recipe ingredients applied to the label ingredients list.');
  }

  function updateIngredient(id: string, patch: Partial<Ingredient>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            allergensConfirmedAt: undefined,
            ingredients: current.ingredients.map((ingredient) =>
              ingredient.id === id ? { ...ingredient, ...patch } : ingredient,
            ),
          }
        : current,
    );
  }

  function addIngredient() {
    setDraft((current) =>
      current
        ? {
            ...current,
            allergensConfirmedAt: undefined,
            ingredients: [...current.ingredients, { id: crypto.randomUUID(), name: '', allergenTags: [] }],
          }
        : current,
    );
  }

  function removeIngredient(id: string) {
    setDraft((current) =>
      current
        ? { ...current, allergensConfirmedAt: undefined, ingredients: current.ingredients.filter((ingredient) => ingredient.id !== id) }
        : current,
    );
  }

  function toggleAllergen(ingredientId: string, allergen: AllergenKey) {
    const ingredient = draft?.ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return;
    const next = ingredient.allergenTags.includes(allergen)
      ? ingredient.allergenTags.filter((item) => item !== allergen)
      : [...ingredient.allergenTags, allergen];
    updateIngredient(ingredientId, { allergenTags: next.sort((a, b) => allergenOrder.indexOf(a) - allergenOrder.indexOf(b)) });
  }

  function detectAllergens() {
    setDraft((current) =>
      current
        ? { ...current, allergensConfirmedAt: undefined, ingredients: current.ingredients.map(detectIngredientAllergens) }
        : current,
    );
    setMessage('Allergens detected from ingredient names. Review and confirm before printing.');
  }

  function confirmAllergens() {
    updateDraft({ allergensConfirmedAt: new Date().toISOString() });
    setMessage('Allergen review confirmed.');
  }

  async function persistTemplate(): Promise<LabelTemplate | null> {
    if (!draft || !selectedProduct || !selectedPackType) return null;
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(draft, selectedProduct.id, selectedPackType, shelfLifeDays);
      const saved = templateId
        ? await labelmakerApi.updateTemplate(templateId, payload)
        : await labelmakerApi.createTemplate(payload);
      setTemplateId(saved.id);
      setDraft(fromTemplate(saved));
      setShelfLifeDays(saved.shelf_life_days);
      return saved;
    } catch (err: any) {
      setError(await readErrorDetail(err, 'Failed to save label template.'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    const saved = await persistTemplate();
    if (saved) setMessage('Label template saved.');
  }

  async function deleteTemplate() {
    if (!templateId || !confirm('Delete this label template?')) return;
    await labelmakerApi.deleteTemplate(templateId);
    setTemplateId(null);
    if (selectedProduct) {
      const packType = applicablePackTypes.find((item) => item.code === selectedPackType) ?? null;
      setDraft(createDefaultTemplate(selectedProduct, packType));
    }
    setMessage('Label template deleted.');
  }

  async function exportPdf() {
    if (!draft) return;
    if (printErrors.length > 0) {
      setError(`PDF export is blocked: ${printErrors.join(' ')}`);
      return;
    }
    const saved = templateId ? null : await persistTemplate();
    const idForPdf = templateId ?? saved?.id;
    if (!idForPdf) return;
    setSaving(true);
    setError('');
    try {
      const blob = await labelmakerApi.renderPdf({ template_id: idForPdf, expiry_date: expiryDate });
      downloadBlob(blob, makePdfFileName(draft, expiryDate) + '.pdf');
      setMessage('PDF downloaded.');
    } catch (err: any) {
      setError(await readErrorDetail(err, 'PDF export failed.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner fullPage />;
  if (!draft || !servingValues) return <ErrorCard message={error || 'Select a product and pack type to start.'} />;

  const summaryTags = summariseAllergens(draft.ingredients);
  const recipe = draft.recipe ?? createEmptyRecipe(draft.servingSizeG, draft.servingsPerPackage);

  return (
    <div className="labelmaker-page space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">LabelMaker FSANZ</h1>
          <p className="text-sm text-gray-500 mt-1">Product and pack-type label templates for production packing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setView(view === 'label' ? 'calculator' : 'label')}>
            {view === 'label' ? 'Nutrition calculator' : 'Label editor'}
          </button>
          {templateId && (
            <button type="button" className="btn btn-danger flex items-center gap-1.5" onClick={deleteTemplate}>
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          )}
          <button type="button" className="btn btn-secondary flex items-center gap-1.5" onClick={exportPdf} disabled={saving}>
            <ArrowDownTrayIcon className="h-4 w-4" /> PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
            {saving ? 'Saving...' : 'Save template'}
          </button>
        </div>
      </div>

      {error && <ErrorCard message={error} />}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{message}</div>}

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-4">
        <label className="block">
          <span className="label">Production product</span>
          <select className="input" value={selectedProductId} onChange={(e) => setSelectedProductId(Number(e.target.value) || '')}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.code} - {product.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Pack type</span>
          <select className="input" value={selectedPackType} onChange={(e) => setSelectedPackType(e.target.value)}>
            {applicablePackTypes.map((packType) => (
              <option key={packType.code} value={packType.code}>{packType.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Shelf life days</span>
          <input className="input" type="number" min="0" max="3650" value={shelfLifeDays} onChange={(e) => setShelfLifeDays(toNumber(e.target.value))} />
        </label>
        <div className="text-sm text-gray-500">
          <span className="label">Template status</span>
          <div className="rounded-lg bg-gray-50 px-3 py-2">{templateId ? `Saved template #${templateId}` : 'New unsaved template'}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <main className="space-y-4">
          {view === 'calculator' ? (
            <RecipeBuilder
              productName={draft.productNameEn || draft.productNameZh}
              recipe={recipe}
              onRecipeChange={updateRecipe}
              onApplyRecipe={applyRecipe}
              onApplyIngredientsText={applyRecipeIngredients}
            />
          ) : (
            <>
              <section className="card space-y-3">
                <h2 className="text-lg font-semibold text-gray-800">Product</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormText label="Chinese name" value={draft.productNameZh} onChange={(value) => updateDraft({ productNameZh: value })} />
                  <FormText label="English name" value={draft.productNameEn} onChange={(value) => updateDraft({ productNameEn: value })} />
                  <FormNumber label="Net weight (g)" value={draft.netWeightG} onChange={(value) => updateDraft({ netWeightG: value })} />
                  <FormNumber label="Serving size (g)" value={draft.servingSizeG} onChange={(value) => updateDraft({ servingSizeG: value })} />
                  <FormNumber label="Servings per package" value={draft.servingsPerPackage} onChange={(value) => updateDraft({ servingsPerPackage: value })} />
                </div>
                <FormTextarea label="Storage conditions" value={draft.storageConditions} onChange={(value) => updateDraft({ storageConditions: value })} />
                <FormTextarea label="Factory information" value={draft.customerText} onChange={(value) => updateDraft({ customerText: value })} />
              </section>

              <section className="card space-y-3">
                <h2 className="text-lg font-semibold text-gray-800">Nutrition per 100g</h2>
                <div className="space-y-2">
                  {nutritionFields.map((field) => (
                    <div key={field.key} className="grid grid-cols-[minmax(120px,1fr)_150px_120px] items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700">{field.label}</span>
                      <input className="input" type="number" min="0" step="0.1" value={draft.nutritionPer100g[field.key]} onChange={(e) => updateNutrition(field.key, toNumber(e.target.value))} />
                      <strong className="text-gray-600">{formatNutritionValue(field.key, servingValues[field.key])}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-800">Ingredients and allergens</h2>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary text-sm" onClick={detectAllergens}>Auto detect</button>
                    <button type="button" className="btn btn-primary text-sm" onClick={confirmAllergens}>Confirm review</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {draft.ingredients.map((ingredient, index) => (
                    <div key={ingredient.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
                        <FormText label={`Ingredient ${index + 1}`} value={ingredient.name} onChange={(value) => updateIngredient(ingredient.id, { name: value })} />
                        <FormNumber label="Sulphites mg/kg" value={ingredient.sulphitesMgPerKg ?? 0} onChange={(value) => updateIngredient(ingredient.id, { sulphitesMgPerKg: value || undefined })} />
                        <button type="button" className="btn btn-secondary self-end" onClick={() => removeIngredient(ingredient.id)}>Remove</button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {allergenOrder.map((allergen) => (
                          <label key={allergen} className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700">
                            <input type="checkbox" checked={ingredient.allergenTags.includes(allergen)} onChange={() => toggleAllergen(ingredient.id, allergen)} />
                            {allergenLabels[allergen]}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary" onClick={addIngredient}>Add ingredient</button>
                <div className={`rounded-lg border p-3 text-sm ${draft.allergensConfirmedAt ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <strong>{containsText}</strong>
                  <div className="mt-1 text-gray-600">{draft.allergensConfirmedAt ? `Confirmed ${new Date(draft.allergensConfirmedAt).toLocaleString()}` : 'Review required before printing'}</div>
                  {summaryTags.length > 0 && <div className="mt-1 text-xs text-gray-500">{summaryTags.map((tag) => allergenLabels[tag]).join(' / ')}</div>}
                </div>
              </section>

              <section className="card">
                <h2 className="mb-2 text-lg font-semibold text-gray-800">Print readiness</h2>
                {printErrors.length === 0 ? (
                  <div className="font-semibold text-emerald-700">Ready to export PDF.</div>
                ) : (
                  <ul className="list-disc pl-5 text-sm text-red-700">
                    {printErrors.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>

        <aside className="labelmaker-preview rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">PDF Preview</h2>
            <span className="text-xs text-gray-500">150mm x 100mm</span>
          </div>
          <iframe title="Label preview" srcDoc={labelHtml} />
        </aside>
      </div>
    </div>
  );
}

function createDefaultTemplate(product: ProdProduct, packType: PackTypeConfig | null): ProductTemplate {
  const now = new Date().toISOString();
  const netWeightG = Math.round(Number(packType?.nominal_weight_kg ?? product.pack_size_kg ?? 1) * 1000);
  return {
    id: `${product.id}:${packType?.code ?? 'pack'}`,
    productNameZh: '',
    productNameEn: product.name,
    netWeightG,
    servingSizeG: netWeightG,
    servingsPerPackage: 1,
    ingredients: [],
    storageConditions: 'Store frozen at -18 C or below.',
    customerText: defaultFactoryInformation,
    nutritionPer100g: {
      energyKj: 0,
      proteinG: 0,
      fatTotalG: 0,
      fatSaturatedG: 0,
      carbohydrateG: 0,
      sugarsG: 0,
      sodiumMg: 0,
    },
    recipe: createEmptyRecipe(netWeightG, 1),
    createdAt: now,
    updatedAt: now,
  };
}

function fromTemplate(template: LabelTemplate): ProductTemplate {
  return {
    id: String(template.id),
    productNameZh: template.product_name_zh,
    productNameEn: template.product_name_en,
    netWeightG: Number(template.net_weight_g),
    servingSizeG: Number(template.serving_size_g),
    servingsPerPackage: Number(template.servings_per_package),
    ingredients: template.ingredients,
    storageConditions: template.storage_conditions,
    customerText: template.customer_text,
    nutritionPer100g: template.nutrition_per_100g,
    recipe: template.recipe ?? undefined,
    allergensConfirmedAt: template.allergens_confirmed_at ?? undefined,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

function toPayload(product: ProductTemplate, prodProductId: number, packTypeCode: string, shelfLifeDays: number): LabelTemplatePayload {
  return {
    prod_product_id: prodProductId,
    pack_type_code: packTypeCode,
    product_name_zh: product.productNameZh,
    product_name_en: product.productNameEn,
    net_weight_g: product.netWeightG,
    serving_size_g: product.servingSizeG,
    servings_per_package: product.servingsPerPackage,
    storage_conditions: product.storageConditions,
    customer_text: product.customerText,
    shelf_life_days: shelfLifeDays,
    nutrition_per_100g: product.nutritionPer100g,
    ingredients: product.ingredients,
    recipe: product.recipe ?? null,
    allergens_confirmed_at: product.allergensConfirmedAt ?? null,
  };
}

function FormText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function FormNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type="number" min="0" step="0.1" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(toNumber(e.target.value))} />
    </label>
  );
}

function FormTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input min-h-[76px]" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNutritionValue(key: keyof NutritionValues, value: number): string {
  if (key === 'energyKj') return formatEnergy(value);
  if (key === 'sodiumMg') return formatMilligrams(value);
  return formatGrams(value);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readErrorDetail(error: any, fallback: string): Promise<string> {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      const parsed = JSON.parse(text);
      return parsed?.detail || text || fallback;
    } catch {
      return text || fallback;
    }
  }
  return data?.detail || fallback;
}
