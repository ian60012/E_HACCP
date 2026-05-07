import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  phApi, PHBootstrap, PHPlanItem, PHRecipe, PHRequirement,
  PHProduct, PHBatch, PHInventoryItem,
} from '@/api/productionHelper';
import { startOfWeek, weekKey, weekDates, addDays } from './utils';

export interface PHState {
  loading: boolean;
  error: string | null;
  products: PHProduct[];
  batches: PHBatch[];
  inventoryItems: PHInventoryItem[];
  plans: PHPlanItem[];
  recipes: PHRecipe[];
  orderedKeys: Set<string>;
  currentMonday: Date;
}

export function useProductionHelper() {
  const [state, setState] = useState<PHState>({
    loading: true,
    error: null,
    products: [],
    batches: [],
    inventoryItems: [],
    plans: [],
    recipes: [],
    orderedKeys: new Set(),
    currentMonday: startOfWeek(new Date()),
  });

  const loadBootstrap = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data: PHBootstrap = await phApi.bootstrap();
      setState((s) => ({
        ...s,
        loading: false,
        products: data.products.items || [],
        batches: data.recent_batches.items || [],
        inventoryItems: data.inventory_items.items || [],
        plans: data.plans.items || [],
        recipes: data.recipes.recipes || [],
        orderedKeys: new Set(data.purchase_status?.ordered_keys || []),
      }));
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err?.message || '載入失敗' }));
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const setMonday = useCallback((d: Date) => {
    setState((s) => ({ ...s, currentMonday: d }));
  }, []);

  const prevWeek = useCallback(() => {
    setState((s) => ({ ...s, currentMonday: addDays(s.currentMonday, -7) }));
  }, []);

  const nextWeek = useCallback(() => {
    setState((s) => ({ ...s, currentMonday: addDays(s.currentMonday, 7) }));
  }, []);

  const todayWeek = useCallback(() => {
    setState((s) => ({ ...s, currentMonday: startOfWeek(new Date()) }));
  }, []);

  // ---- plan/note CRUD ----
  const createPlan = useCallback(async (body: Partial<PHPlanItem>) => {
    const created = await phApi.createPlan(body);
    setState((s) => ({ ...s, plans: [...s.plans, created] }));
    return created;
  }, []);

  const updatePlan = useCallback(async (id: string, body: Partial<PHPlanItem>) => {
    const updated = await phApi.updatePlan(id, body);
    setState((s) => ({ ...s, plans: s.plans.map((p) => (p.id === id ? updated : p)) }));
    return updated;
  }, []);

  const deletePlan = useCallback(async (id: string) => {
    await phApi.deletePlan(id);
    setState((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
  }, []);

  // ---- recipe CRUD ----
  const createRecipe = useCallback(async (body: Partial<PHRecipe>) => {
    const created = await phApi.createRecipe(body);
    setState((s) => ({ ...s, recipes: [...s.recipes, created] }));
    return created;
  }, []);

  const updateRecipe = useCallback(async (id: string, body: Partial<PHRecipe>) => {
    const updated = await phApi.updateRecipe(id, body);
    setState((s) => ({ ...s, recipes: s.recipes.map((r) => (r.id === id ? updated : r)) }));
    return updated;
  }, []);

  const deleteRecipe = useCallback(async (id: string) => {
    await phApi.deleteRecipe(id);
    setState((s) => ({ ...s, recipes: s.recipes.filter((r) => r.id !== id) }));
  }, []);

  // ---- purchase status ----
  const setOrdered = useCallback(async (key: string, ordered: boolean) => {
    const res = await phApi.setPurchaseStatus(key, ordered);
    setState((s) => ({ ...s, orderedKeys: new Set(res.ordered_keys) }));
  }, []);

  // ---- derived ----
  const week = useMemo(() => weekKey(state.currentMonday), [state.currentMonday]);
  const dates = useMemo(() => weekDates(state.currentMonday), [state.currentMonday]);

  const recipeByProduct = useCallback(
    (productId: string | number | null | undefined) =>
      state.recipes.find((r) => String(r.product_id) === String(productId)) || null,
    [state.recipes]
  );

  const productById = useCallback(
    (productId: string | number | null | undefined) =>
      state.products.find((p) => String(p.id) === String(productId)) || null,
    [state.products]
  );

  const inventoryById = useCallback(
    (itemId: string | number | null | undefined) =>
      state.inventoryItems.find((i) => String(i.id) === String(itemId)) || null,
    [state.inventoryItems]
  );

  const recentBatchesFor = useCallback(
    (item: { product_id?: any; product_code?: string; product_name?: string }) =>
      state.batches
        .filter((b) => {
          const byId = item.product_id && String(b.id) === String(item.product_id);
          const byCode = item.product_code && b.product_code === item.product_code;
          const byName = item.product_name && b.product_name === item.product_name;
          return byId || byCode || byName;
        })
        .sort((a, b) => String(b.production_date || '').localeCompare(String(a.production_date || ''))),
    [state.batches]
  );

  // ---- requirements (computed locally, mirroring backend logic) ----
  const requirements: PHRequirement[] = useMemo(() => {
    const rows: Map<string, PHRequirement> = new Map();
    for (const item of state.plans.filter((p) => p.week === week && (p.type || 'plan') === 'plan')) {
      const kg = Number(item.main_material_qty_kg || 0);
      if (!kg) continue;
      const dueDate = previousWorkday(item.date);
      const src = {
        date: item.date,
        product_code: item.product_code || '',
        product_name: item.product_name || '',
        main_material_qty_kg: kg,
      };

      if (item.main_material_name) {
        const key = `main:${dueDate}:${item.main_material_name}`;
        const row = rows.get(key) || {
          required_date: item.date,
          due_date: dueDate,
          item_id: null,
          item_code: '',
          item_name: item.main_material_name,
          unit: 'kg',
          total_qty: 0,
          material_type: 'main' as const,
          source_products: [],
        };
        row.total_qty += kg;
        row.source_products.push(src);
        rows.set(key, row);
      }

      const recipe = recipeByProduct(item.product_id);
      if (!recipe) continue;
      for (const aux of recipe.auxiliaries || []) {
        const ratio = Number(aux.qty_per_kg_main_material || 0);
        if (!ratio) continue;
        const key = `aux:${dueDate}:${aux.item_id || aux.item_name}`;
        const row = rows.get(key) || {
          required_date: item.date,
          due_date: dueDate,
          item_id: aux.item_id,
          item_code: aux.item_code,
          item_name: aux.item_name,
          unit: aux.unit || '',
          total_qty: 0,
          material_type: 'aux' as const,
          source_products: [],
        };
        row.total_qty += kg * ratio;
        row.source_products.push(src);
        rows.set(key, row);
      }
    }
    return Array.from(rows.values()).sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.material_type !== b.material_type) return a.material_type === 'main' ? -1 : 1;
      return (a.item_name || '').localeCompare(b.item_name || '');
    });
  }, [state.plans, state.recipes, week, recipeByProduct]);

  return {
    state,
    week,
    dates,
    requirements,
    setMonday,
    prevWeek,
    nextWeek,
    todayWeek,
    loadBootstrap,
    createPlan,
    updatePlan,
    deletePlan,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    setOrdered,
    productById,
    inventoryById,
    recipeByProduct,
    recentBatchesFor,
  };
}

function previousWorkday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  const local = new Date(d);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}
