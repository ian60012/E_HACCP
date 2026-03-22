import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { invStocktakeApi, invLocationsApi } from '@/api/inventory';
import { InvStocktake, InvStocktakeLine, InvLocation } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';

export default function InventoryStocktakePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  // ── New form state ─────────────────────────────────────────────────────
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [formLocationId, setFormLocationId] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Detail state ───────────────────────────────────────────────────────
  const [stocktake, setStocktake] = useState<InvStocktake | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Local edits: lineId → input value string
  const [localQty, setLocalQty] = useState<Record<number, string>>({});
  const [savingLine, setSavingLine] = useState<number | null>(null);

  useEffect(() => {
    invLocationsApi.list({ is_active: true, limit: 100 }).then((r) => setLocations(r.items)).catch(() => {});
  }, []);

  const fetchStocktake = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await invStocktakeApi.get(Number(id));
      setStocktake(data);
      // Initialize localQty from existing values
      const init: Record<number, string> = {};
      data.lines.forEach((l) => {
        init[l.id] = l.physical_qty ?? '';
      });
      setLocalQty(init);
    } catch {
      setError('載入失敗');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchStocktake(); }, [fetchStocktake]);

  // ── Create new stocktake ────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formLocationId || !formDate) return;
    setCreating(true);
    setError('');
    try {
      const st = await invStocktakeApi.create({
        location_id: Number(formLocationId),
        count_date: formDate,
        notes: formNotes || undefined,
      });
      navigate(`/inventory/stocktakes/${st.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '建立失敗');
      setCreating(false);
    }
  };

  // ── Save line on blur ───────────────────────────────────────────────────
  const handleLineBlur = async (line: InvStocktakeLine) => {
    if (!stocktake) return;
    const val = localQty[line.id];
    const newQty = val === '' ? null : val;
    const currentQty = line.physical_qty === null ? '' : String(line.physical_qty);
    if (String(newQty ?? '') === currentQty) return; // no change

    setSavingLine(line.id);
    try {
      const updated = await invStocktakeApi.updateLine(stocktake.id, line.id, {
        physical_qty: newQty,
      });
      setStocktake((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) => l.id === line.id ? { ...l, ...updated } : l),
        };
      });
    } catch {
      // revert
      setLocalQty((prev) => ({ ...prev, [line.id]: line.physical_qty ?? '' }));
    } finally {
      setSavingLine(null);
    }
  };

  // ── Confirm stocktake ───────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!stocktake) return;
    if (!confirm('確認盤點後將自動產生調整單，無法撤銷。確定要繼續嗎？')) return;
    setConfirming(true);
    setError('');
    try {
      await invStocktakeApi.confirm(stocktake.id);
      await fetchStocktake();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '確認失敗');
    } finally {
      setConfirming(false);
    }
  };

  // ── Variance display helpers ────────────────────────────────────────────
  const varianceClass = (v: string | null) => {
    if (v === null) return 'text-gray-400';
    const n = Number(v);
    if (n > 0) return 'text-green-600 font-medium';
    if (n < 0) return 'text-red-600 font-medium';
    return 'text-gray-500';
  };

  const computedVariance = (line: InvStocktakeLine): string | null => {
    const qty = localQty[line.id];
    if (qty === '' || qty === undefined) return null;
    const n = Number(qty);
    if (isNaN(n)) return null;
    return String(n - Number(line.system_qty));
  };

  // ── New form UI ─────────────────────────────────────────────────────────
  if (isNew) {
    return (
      <div className="space-y-6 max-w-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/stocktakes')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">新增盤點</h1>
        </div>

        {error && <ErrorCard message={error} />}

        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">儲位 <span className="text-red-500">*</span></label>
            <select
              value={formLocationId}
              onChange={(e) => setFormLocationId(e.target.value)}
              className="input w-full"
            >
              <option value="">— 選擇儲位 —</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">盤點日期 <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="input w-full"
              placeholder="（選填）"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => navigate('/inventory/stocktakes')} className="btn btn-secondary">取消</button>
          <button
            onClick={handleCreate}
            disabled={!formLocationId || !formDate || creating}
            className="btn btn-primary disabled:opacity-40"
          >
            {creating ? '建立中…' : '建立盤點單'}
          </button>
        </div>
      </div>
    );
  }

  // ── Detail UI ───────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner fullPage />;
  if (error && !stocktake) return <ErrorCard message={error} onRetry={fetchStocktake} />;
  if (!stocktake) return <ErrorCard message="找不到盤點單" />;

  const isDraft = stocktake.status === 'draft';
  const countedLines = stocktake.lines.filter((l) => l.physical_qty !== null);
  const varianceLines = stocktake.lines.filter(
    (l) => l.physical_qty !== null && Number(l.physical_qty) !== Number(l.system_qty)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/inventory/stocktakes')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">盤點單 {stocktake.doc_number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stocktake.location_name} &middot; {stocktake.count_date}
            {stocktake.notes && <> &middot; {stocktake.notes}</>}
          </p>
        </div>
        <div className="ml-auto">
          {isDraft
            ? <span className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-600">草稿</span>
            : <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircleIcon className="h-4 w-4" />已確認
              </span>
          }
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-800">{stocktake.lines.length}</p>
          <p className="text-xs text-gray-400 mt-1">品項總數</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-800">{countedLines.length}</p>
          <p className="text-xs text-gray-400 mt-1">已盤品項</p>
        </div>
        <div className="card text-center">
          <p className={`text-2xl font-bold ${varianceLines.length > 0 ? 'text-orange-500' : 'text-gray-800'}`}>
            {varianceLines.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">有差異品項</p>
        </div>
      </div>

      {/* Confirmed: show adj doc links */}
      {!isDraft && (
        <div className="card bg-green-50 border border-green-200 space-y-1">
          <p className="text-sm font-medium text-green-800">
            已於 {new Date(stocktake.confirmed_at!).toLocaleString('zh-TW')} 確認盤點
          </p>
          <div className="flex gap-4 text-sm">
            {stocktake.adj_in_doc_id ? (
              <button
                onClick={() => navigate(`/inventory/docs/${stocktake.adj_in_doc_id}`)}
                className="text-blue-600 hover:underline"
              >
                盤盈調整單 →
              </button>
            ) : <span className="text-gray-400">無盤盈調整</span>}
            {stocktake.adj_out_doc_id ? (
              <button
                onClick={() => navigate(`/inventory/docs/${stocktake.adj_out_doc_id}`)}
                className="text-blue-600 hover:underline"
              >
                盤虧調整單 →
              </button>
            ) : <span className="text-gray-400">無盤虧調整</span>}
          </div>
        </div>
      )}

      {/* Lines table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 pr-3">品項代碼</th>
              <th className="pb-2 pr-3">品項名稱</th>
              <th className="pb-2 pr-3 text-right">系統數量</th>
              <th className="pb-2 pr-3 text-right">實盤數量</th>
              <th className="pb-2 pr-3 text-right">差異</th>
              <th className="pb-2 pr-3">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stocktake.lines.map((line) => {
              const variance = computedVariance(line);
              return (
                <tr key={line.id} className={savingLine === line.id ? 'opacity-60' : ''}>
                  <td className="py-2 pr-3 font-mono text-xs text-gray-500">{line.item_code}</td>
                  <td className="py-2 pr-3 text-gray-700">{line.item_name}</td>
                  <td className="py-2 pr-3 text-right text-gray-600">
                    {Number(line.system_qty).toFixed(3)} {line.item_unit}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {isDraft ? (
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={localQty[line.id] ?? ''}
                        onChange={(e) => setLocalQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        onBlur={() => handleLineBlur(line)}
                        className="input w-24 text-right"
                        placeholder="未盤"
                      />
                    ) : (
                      <span className="text-gray-700">
                        {line.physical_qty !== null
                          ? `${Number(line.physical_qty).toFixed(3)} ${line.item_unit}`
                          : <span className="text-gray-400">未盤</span>}
                      </span>
                    )}
                  </td>
                  <td className={`py-2 pr-3 text-right ${varianceClass(variance)}`}>
                    {variance !== null
                      ? `${Number(variance) > 0 ? '+' : ''}${Number(variance).toFixed(3)}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{line.notes || '—'}</td>
                </tr>
              );
            })}
            {stocktake.lines.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">此儲位無庫存品項</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {isDraft && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-400 flex-1">
            填入實盤數量後離開欄位即自動儲存。未填入的品項視為「未盤」，不產生調整。
          </p>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="btn btn-primary"
          >
            {confirming ? '確認中…' : '確認盤點'}
          </button>
        </div>
      )}
    </div>
  );
}
