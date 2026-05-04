import Drawer from './Drawer';
import { PHRequirement, phApi } from '@/api/productionHelper';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { purchaseStatusKey } from './utils';

interface Props {
  open: boolean;
  onClose: () => void;
  requirements: PHRequirement[];
  weekKey: string;
  orderedKeys: Set<string>;
  onSetOrdered: (key: string, ordered: boolean) => Promise<void>;
}

export default function RequirementsDrawer({
  open,
  onClose,
  requirements,
  weekKey,
  orderedKeys,
  onSetOrdered,
}: Props) {
  return (
    <Drawer open={open} title="叫貨總覽" subtitle="按應到貨日期合併本週輔料需求。" onClose={onClose} wide>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => phApi.downloadCsv(weekKey)}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          匯出 CSV
        </button>
      </div>
      {requirements.length === 0 ? (
        <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
          本週沒有可計算的叫貨需求。請先建立計畫和配方。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr className="text-left text-xs text-slate-600">
                <th className="px-2 py-2">應到貨日期</th>
                <th className="px-2 py-2">名稱</th>
                <th className="px-2 py-2">類型</th>
                <th className="px-2 py-2">單位</th>
                <th className="px-2 py-2 text-right">叫貨量</th>
                <th className="px-2 py-2">來源</th>
                <th className="px-2 py-2">已下單</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r, idx) => {
                const key = purchaseStatusKey(weekKey, r.due_date, r.material_type, r.item_name || '');
                const ordered = orderedKeys.has(key);
                const isMain = r.material_type === 'main';
                return (
                  <tr
                    key={idx}
                    className={`border-b border-slate-100 ${ordered ? 'bg-emerald-50/40 text-slate-400' : ''}`}
                  >
                    <td className="px-2 py-2 font-bold">{r.due_date}</td>
                    <td className="px-2 py-2">
                      <div className="text-xs text-slate-500">{r.item_code || ''}</div>
                      <div className="font-bold">{r.item_name || ''}</div>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                          isMain ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isMain ? '主料' : '輔料'}
                      </span>
                    </td>
                    <td className="px-2 py-2">{r.unit || ''}</td>
                    <td className="px-2 py-2 text-right font-bold">
                      {Number(r.total_qty).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {r.source_products
                        .map((s) => `${s.date} ${s.product_code || ''} ${s.product_name || ''} ${s.main_material_qty_kg}kg`)
                        .map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                    </td>
                    <td className="px-2 py-2">
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ordered}
                          onChange={(e) => onSetOrdered(key, e.target.checked)}
                          className="rounded border-slate-400"
                        />
                        <span className="text-xs">{ordered ? '已下單' : '未下單'}</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
