import { useEffect, useState, useMemo } from 'react';
import Drawer from './Drawer';
import { PHPlanItem, PHProduct, PHRecipe, PHInventoryItem } from '@/api/productionHelper';
import { fmtDate } from './utils';
import Bi, { bi } from '@/components/Bi';

interface Props {
  open: boolean;
  onClose: () => void;
  item: PHPlanItem | null;
  defaults: { date?: string; station?: string };
  weekDates: { key: string; date: string }[];
  products: PHProduct[];
  recipes: PHRecipe[];
  inventoryItems: PHInventoryItem[];
  batches: { product_id: number | string; product_code: string; product_name: string; production_date: string | null }[];
  weekKey: string;
  onSave: (payload: Partial<PHPlanItem>, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function PlanDrawer(props: Props) {
  const {
    open,
    onClose,
    item,
    defaults,
    weekDates,
    products,
    recipes,
    inventoryItems,
    batches,
    weekKey,
    onSave,
    onDelete,
  } = props;

  const [form, setForm] = useState({
    date: defaults.date || weekDates[0]?.date || '',
    station: defaults.station || '面点',
    product_id: '' as string | number,
    main_material_name: '',
    main_material_qty_kg: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          date: item.date || weekDates[0]?.date || '',
          station: item.station || '面点',
          product_id: item.product_id ? String(item.product_id) : '',
          main_material_name: item.main_material_name || '',
          main_material_qty_kg: String(item.main_material_qty_kg || ''),
          notes: item.notes || '',
        });
      } else {
        setForm({
          date: defaults.date || weekDates[0]?.date || '',
          station: defaults.station || '面点',
          product_id: '',
          main_material_name: '',
          main_material_qty_kg: '',
          notes: '',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const product = useMemo(
    () => products.find((p) => String(p.id) === String(form.product_id)) || null,
    [products, form.product_id]
  );
  const recipe = useMemo(
    () => recipes.find((r) => String(r.product_id) === String(form.product_id)) || null,
    [recipes, form.product_id]
  );
  const recent = useMemo(
    () =>
      batches
        .filter(
          (b) =>
            (form.product_id && String(b.product_id) === String(form.product_id)) ||
            (product?.code && b.product_code === product.code) ||
            (product?.name && b.product_name === product.name)
        )
        .slice(0, 3),
    [batches, form.product_id, product]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dayKey = weekDates.find((d) => d.date === form.date)?.key || '';
    const payload: Partial<PHPlanItem> = {
      type: 'plan',
      week: weekKey,
      date: form.date,
      day: dayKey,
      station: form.station,
      product_id: form.product_id || undefined,
      product_code: product?.code || '',
      product_name: product?.name || '',
      main_material_name: form.main_material_name.trim(),
      main_material_qty_kg: form.main_material_qty_kg,
      notes: form.notes.trim(),
    };
    await onSave(payload, item?.id);
    onClose();
  }

  async function handleDelete() {
    if (!item?.id) return;
    if (!window.confirm(bi('ph.confirm.deletePlan'))) return;
    await onDelete(item.id);
    onClose();
  }

  return (
    <Drawer
      open={open}
      title={bi(item ? 'ph.drawer.editPlan' : 'ph.drawer.newPlan')}
      subtitle={bi('ph.page.subtitle')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-slate-700"><Bi k="ph.field.date" /></span>
          <select
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            {weekDates.map((d) => (
              <option key={d.date} value={d.date}>
                {d.key} {fmtDate(d.date)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-700"><Bi k="ph.field.station" /></span>
          <select
            value={form.station}
            onChange={(e) => setForm({ ...form, station: e.target.value })}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="面点">面点</option>
            <option value="厨房">厨房</option>
          </select>
        </label>
        <label className="text-sm col-span-2">
          <span className="text-slate-700"><Bi k="ph.field.product" /></span>
          <select
            value={String(form.product_id)}
            onChange={(e) => {
              const newProductId = e.target.value;
              const newRecipe = recipes.find((r) => String(r.product_id) === newProductId);
              setForm({
                ...form,
                product_id: newProductId,
                main_material_name: newRecipe?.main_material_name || form.main_material_name,
              });
            }}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-700"><Bi k="ph.field.mainMaterial" /></span>
          <input
            list="ph-material-list"
            type="text"
            value={form.main_material_name}
            onChange={(e) => setForm({ ...form, main_material_name: e.target.value })}
            placeholder={bi('ph.placeholder.material')}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <datalist id="ph-material-list">
            {inventoryItems.map((i) => (
              <option key={i.id} value={i.name}>
                {i.code} · {i.name} ({i.base_unit || ''})
              </option>
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="text-slate-700"><Bi k="ph.field.mainQty" /></span>
          <input
            type="number"
            step="0.001"
            min="0"
            value={form.main_material_qty_kg}
            onChange={(e) => setForm({ ...form, main_material_qty_kg: e.target.value })}
            placeholder={bi('ph.placeholder.qty')}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm col-span-2">
          <span className="text-slate-700"><Bi k="ph.field.notes" /></span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            placeholder={bi('ph.placeholder.notes')}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </label>

        {form.product_id ? (
          <div className="col-span-2 rounded-md bg-slate-50 p-2.5 text-xs text-slate-700">
            {product ? (
              <>
                <strong>
                  {product.code} · {product.name}
                </strong>
                <div className="mt-0.5">
                  {product.product_type || '-'} · CCP: {product.ccp_limit_temp ?? '-'}°C ·{' '}
                  {recipe ? <Bi k="ph.label.hasRecipe" /> : <Bi k="ph.label.noRecipe" />}
                </div>
                {recent.length ? (
                  <div className="mt-1 text-slate-500">
                    <Bi k="ph.label.recent" />:
                    {recent.map((b, i) => (
                      <span key={i} className="ml-1">
                        {b.production_date}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-slate-200 mt-2">
          {item ? (
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-md border border-rose-300 text-rose-600 hover:bg-rose-50"
              onClick={handleDelete}
            >
              <Bi k="ph.btn.delete" showEn={false} />
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            <Bi k="ph.btn.cancel" showEn={false} />
          </button>
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Bi k="ph.btn.save" showEn={false} />
          </button>
        </div>
      </form>
    </Drawer>
  );
}
