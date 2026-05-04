import { useEffect, useState } from 'react';
import Drawer from './Drawer';
import { PHRecipe, PHRecipeAux, PHProduct, PHInventoryItem } from '@/api/productionHelper';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

interface Props {
  open: boolean;
  onClose: () => void;
  recipes: PHRecipe[];
  products: PHProduct[];
  inventoryItems: PHInventoryItem[];
  onCreate: (body: Partial<PHRecipe>) => Promise<PHRecipe>;
  onUpdate: (id: string, body: Partial<PHRecipe>) => Promise<PHRecipe>;
  onDelete: (id: string) => Promise<void>;
}

export default function RecipeDrawer(props: Props) {
  const { open, onClose, recipes, products, inventoryItems, onCreate, onUpdate, onDelete } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    product_id: string;
    main_material_name: string;
    auxiliaries: PHRecipeAux[];
  }>({
    product_id: '',
    main_material_name: '',
    auxiliaries: [],
  });

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  useEffect(() => {
    if (selectedId) {
      const r = recipes.find((x) => x.id === selectedId);
      if (r) {
        setForm({
          product_id: r.product_id ? String(r.product_id) : '',
          main_material_name: r.main_material_name || '',
          auxiliaries: r.auxiliaries.map((a) => ({ ...a })),
        });
      }
    } else {
      setForm({ product_id: '', main_material_name: '', auxiliaries: [] });
    }
  }, [selectedId, recipes]);

  function addAux() {
    setForm({
      ...form,
      auxiliaries: [
        ...form.auxiliaries,
        { item_id: '', item_code: '', item_name: '', unit: '', qty_per_kg_main_material: '' },
      ],
    });
  }

  function updateAux(idx: number, patch: Partial<PHRecipeAux>) {
    const next = form.auxiliaries.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    setForm({ ...form, auxiliaries: next });
  }

  function removeAux(idx: number) {
    setForm({ ...form, auxiliaries: form.auxiliaries.filter((_, i) => i !== idx) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const product = products.find((p) => String(p.id) === form.product_id);
    const cleanedAux = form.auxiliaries
      .map((a) => {
        const inv = inventoryItems.find((i) => String(i.id) === String(a.item_id));
        return {
          item_id: inv?.id ?? '',
          item_code: inv?.code ?? '',
          item_name: inv?.name ?? '',
          unit: inv?.base_unit || inv?.usage_unit || '',
          qty_per_kg_main_material: a.qty_per_kg_main_material,
        } as PHRecipeAux;
      })
      .filter((a) => a.item_id);

    const body: Partial<PHRecipe> = {
      product_id: product?.id ?? '',
      product_code: product?.code ?? '',
      product_name: product?.name ?? '',
      main_material_name: form.main_material_name.trim(),
      auxiliaries: cleanedAux,
    };

    if (selectedId) {
      const updated = await onUpdate(selectedId, body);
      setSelectedId(updated.id);
    } else {
      const created = await onCreate(body);
      setSelectedId(created.id);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm('確定刪除此配方？')) return;
    await onDelete(selectedId);
    setSelectedId(null);
  }

  return (
    <Drawer open={open} title="配方庫" subtitle="定義每 1kg 主材料需要多少輔料。" onClose={onClose} wide>
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <div className="border border-slate-200 rounded-md overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">配方列表</span>
            <button
              type="button"
              className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-white"
              onClick={() => setSelectedId(null)}
            >
              新增
            </button>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            {recipes.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`w-full text-left p-2 border-b border-slate-100 text-sm hover:bg-slate-50 ${
                  selectedId === r.id ? 'bg-blue-50 text-blue-700' : ''
                }`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="font-bold">{r.product_name || '（無產品）'}</div>
                <div className="text-xs text-slate-500">
                  {r.product_code} · {r.auxiliaries.length} 項輔料
                </div>
              </button>
            ))}
            {recipes.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">尚無配方</div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <label className="text-sm col-span-2">
            <span className="text-slate-700">產品</span>
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              required
            >
              <option value="">请选择产品</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm col-span-2">
            <span className="text-slate-700">主材料</span>
            <input
              type="text"
              value={form.main_material_name}
              onChange={(e) => setForm({ ...form, main_material_name: e.target.value })}
              placeholder="例如 猪肉、鸡胸肉"
              className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            />
          </label>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-700">輔料係數</span>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
                onClick={addAux}
              >
                <PlusIcon className="h-3 w-3" /> 新增輔料
              </button>
            </div>
            <div className="space-y-2">
              {form.auxiliaries.map((aux, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_120px_30px] gap-2 items-center">
                  <select
                    value={String(aux.item_id || '')}
                    onChange={(e) => updateAux(idx, { item_id: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  >
                    <option value="">選擇輔料</option>
                    {inventoryItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · {i.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="每kg用量"
                    value={String(aux.qty_per_kg_main_material || '')}
                    onChange={(e) => updateAux(idx, { qty_per_kg_main_material: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    className="text-rose-500 hover:text-rose-700 p-1"
                    onClick={() => removeAux(idx)}
                    aria-label="刪除"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {form.auxiliaries.length === 0 ? (
                <div className="text-xs text-slate-500 italic">尚未新增輔料</div>
              ) : null}
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-slate-200 mt-2">
            {selectedId ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md border border-rose-300 text-rose-600 hover:bg-rose-50"
                onClick={handleDelete}
              >
                刪除配方
              </button>
            ) : null}
            <div className="flex-1" />
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              保存配方
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  );
}
