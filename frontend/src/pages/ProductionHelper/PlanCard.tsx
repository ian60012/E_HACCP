import { PHPlanItem, PHRecipe } from '@/api/productionHelper';
import Bi from '@/components/Bi';

interface Props {
  item: PHPlanItem;
  recipe: PHRecipe | null;
  recentBatchDate?: string;
  onClick: () => void;
}

export default function PlanCard({ item, recipe, recentBatchDate, onClick }: Props) {
  const qty = Number(item.main_material_qty_kg || 0);
  return (
    <article
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 mb-2 shadow-sm hover:border-blue-400 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-sm text-slate-900 truncate">
            {item.product_name || '—'}
          </div>
          <div className="text-xs text-slate-500 truncate">{item.product_code || ''}</div>
        </div>
        <div className="text-sm font-bold text-blue-700 shrink-0">
          {qty.toLocaleString()} kg
        </div>
      </div>
      <div className="text-xs text-slate-600 mt-1">
        {item.main_material_name || '—'}
        {item.notes ? <span className="text-slate-400"> · {item.notes}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <span
          className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
            recipe ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {recipe ? <Bi k="ph.label.hasRecipe" showEn={false} /> : <Bi k="ph.label.noRecipe" showEn={false} />}
        </span>
        {recentBatchDate ? (
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600">
            <Bi k="ph.label.recent" showEn={false} /> {recentBatchDate}
          </span>
        ) : null}
      </div>
    </article>
  );
}
