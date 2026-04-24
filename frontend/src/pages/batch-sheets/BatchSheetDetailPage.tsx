import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon, PlusIcon, TrashIcon, CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { batchSheetApi } from '@/api/batch-sheet';
import { prodBatchesApi } from '@/api/production';
import { invItemsApi } from '@/api/inventory';
import { receivingLogsApi } from '@/api/receiving-logs';
import { ProdDailyBatchSheet, ProdBatchSheetLineCreate } from '@/types/batch-sheet';
import { ProdBatch } from '@/types/production';
import { InvItem } from '@/types/inventory';
import { ReceivingLog } from '@/types/receiving-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import RoleGate from '@/components/RoleGate';
import { useAuth } from '@/hooks/useAuth';
import { formatMelbourne } from '@/utils/timezone';

const UNITS = ['KG', 'G', 'L', 'ML', '包', '罐', 'PCS'];

interface DraftLine extends ProdBatchSheetLineCreate {
  _key: number; // local unique key for React rendering
}

let _keyCounter = 0;
const nextKey = () => ++_keyCounter;

function emptyLine(): DraftLine {
  return {
    _key: nextKey(),
    inv_item_id: null,
    ingredient_name: '',
    receiving_log_id: null,
    supplier: null,
    supplier_batch_no: null,
    qty_used: null,
    unit: 'KG',
    seq: 0,
  };
}

export default function BatchSheetDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const id = Number(batchId);

  const [batch, setBatch] = useState<ProdBatch | null>(null);
  const [sheet, setSheet] = useState<ProdDailyBatchSheet | null>(null);
  const [ingredients, setIngredients] = useState<InvItem[]>([]);
  const [receivingLogsByItem, setReceivingLogsByItem] = useState<Record<number, ReceivingLog[]>>({});

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const fetchReceivingLogs = useCallback(async (itemId: number) => {
    if (receivingLogsByItem[itemId]) return; // already loaded
    try {
      const res = await receivingLogsApi.list({ inv_item_id: itemId, limit: 30 });
      setReceivingLogsByItem((prev) => ({ ...prev, [itemId]: res.items }));
    } catch { /* ignore */ }
  }, [receivingLogsByItem]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [batchData, sheetData, itemsData] = await Promise.all([
          prodBatchesApi.get(id),
          batchSheetApi.get(id),
          invItemsApi.list({ category: '原料', is_active: true, limit: 500 }),
        ]);
        setBatch(batchData);
        setIngredients(itemsData.items);

        if (sheetData) {
          setSheet(sheetData);
          setLines(
            sheetData.lines
              .sort((a, b) => a.seq - b.seq)
              .map((l) => ({
                _key: nextKey(),
                inv_item_id: l.inv_item_id,
                ingredient_name: l.ingredient_name,
                receiving_log_id: l.receiving_log_id,
                supplier: l.supplier,
                supplier_batch_no: l.supplier_batch_no,
                qty_used: l.qty_used,
                unit: l.unit ?? 'KG',
                seq: l.seq,
              }))
          );
          // Pre-fetch receiving logs for items that have inv_item_id
          const itemIds = [...new Set(sheetData.lines.map((l) => l.inv_item_id).filter(Boolean) as number[])];
          const rlMap: Record<number, ReceivingLog[]> = {};
          await Promise.all(itemIds.map(async (iid) => {
            try {
              const res = await receivingLogsApi.list({ inv_item_id: iid, limit: 30 });
              rlMap[iid] = res.items;
            } catch { /* ignore */ }
          }));
          setReceivingLogsByItem(rlMap);
        }
      } catch {
        setError('無法載入資料');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()]);
  };

  const removeLine = (key: number) => {
    setLines((prev) => prev.filter((l) => l._key !== key));
  };

  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, ...patch } : l))
    );
  };

  const handleIngredientSelect = async (key: number, itemId: number | null) => {
    const item = ingredients.find((i) => i.id === itemId) ?? null;
    updateLine(key, {
      inv_item_id: itemId,
      ingredient_name: item?.name ?? '',
      unit: item?.usage_unit ?? item?.base_unit ?? 'KG',
      receiving_log_id: null,
      supplier: null,
    });
    if (itemId) {
      await fetchReceivingLogs(itemId);
    }
  };

  const handleReceivingLogSelect = (key: number, rlId: number | null, itemId: number | null) => {
    const logs = itemId ? (receivingLogsByItem[itemId] ?? []) : [];
    const rl = logs.find((r) => r.id === rlId) ?? null;
    updateLine(key, {
      receiving_log_id: rlId,
      supplier: rl?.supplier_name ?? null,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        operator_name: user?.full_name,
        lines: lines.map((l, idx) => ({
          inv_item_id: l.inv_item_id,
          ingredient_name: l.ingredient_name,
          receiving_log_id: l.receiving_log_id,
          supplier: l.supplier,
          supplier_batch_no: l.supplier_batch_no,
          qty_used: l.qty_used,
          unit: l.unit,
          seq: idx,
        })),
      };
      const saved = await batchSheetApi.save(id, payload);
      setSheet(saved);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setError('');
    try {
      const verified = await batchSheetApi.verify(id);
      setSheet(verified);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '驗核失敗');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (!batch) return <ErrorCard message={error || '找不到批次'} />;

  const isLocked = sheet?.is_locked ?? false;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/batch-sheets')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Batch Sheet</h1>
          <p className="text-sm text-gray-500">FSP-LOG-017 · {batch.batch_code}</p>
        </div>
      </div>

      {/* Batch info card */}
      <div className="card bg-gray-50 space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
          <span><span className="text-gray-400">批次</span> {batch.batch_code}</span>
          <span><span className="text-gray-400">產品</span> {batch.product_name}</span>
          <span><span className="text-gray-400">日期</span> {batch.production_date}</span>
          {batch.shift && <span><span className="text-gray-400">班次</span> {batch.shift}</span>}
          {batch.operator && <span><span className="text-gray-400">操作員</span> {batch.operator}</span>}
        </div>
        {sheet?.is_locked && (
          <div className="flex items-center gap-1.5 text-green-700 text-xs mt-2 pt-2 border-t border-gray-200">
            <CheckBadgeIcon className="h-4 w-4" />
            已驗核 · {sheet.verifier_name} · {sheet.verified_at ? formatMelbourne(sheet.verified_at) : ''}
          </div>
        )}
        {sheet && !sheet.is_locked && sheet.operator_name && (
          <p className="text-xs text-gray-400 mt-1">填表人：{sheet.operator_name}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Ingredient lines */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700">原料使用記錄 Ingredients Used</h2>
          {!isLocked && (
            <button
              onClick={addLine}
              className="btn btn-secondary text-sm flex items-center gap-1.5"
            >
              <PlusIcon className="h-4 w-4" />
              新增原料
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ClipboardDocumentListIconPlaceholder />
            <p className="text-sm mt-2">尚未新增任何原料</p>
            {!isLocked && (
              <button onClick={addLine} className="mt-3 btn btn-primary text-sm">
                <PlusIcon className="h-4 w-4 inline mr-1" />
                新增第一項原料
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {lines.map((line) => (
              <LineRow
                key={line._key}
                line={line}
                ingredients={ingredients}
                receivingLogs={line.inv_item_id ? (receivingLogsByItem[line.inv_item_id] ?? []) : []}
                isLocked={isLocked}
                onIngredientSelect={(itemId) => handleIngredientSelect(line._key, itemId)}
                onReceivingLogSelect={(rlId) => handleReceivingLogSelect(line._key, rlId, line.inv_item_id)}
                onChange={(patch) => updateLine(line._key, patch)}
                onRemove={() => removeLine(line._key)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isLocked && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? '儲存中…' : '儲存 Save'}
          </button>
        )}
        {!isLocked && (
          <RoleGate roles={['Admin', 'QA']}>
            <button
              onClick={handleVerify}
              disabled={verifying || lines.length === 0}
              className="btn bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {verifying ? '驗核中…' : '驗核鎖定 QA Verify'}
            </button>
          </RoleGate>
        )}
        <button onClick={() => navigate('/batch-sheets')} className="btn btn-secondary">
          返回列表
        </button>
        <button
          onClick={() => navigate(`/production/batches/${id}`)}
          className="btn btn-secondary"
        >
          查看批次詳情
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ClipboardDocumentListIconPlaceholder() {
  return (
    <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

interface LineRowProps {
  line: DraftLine;
  ingredients: InvItem[];
  receivingLogs: ReceivingLog[];
  isLocked: boolean;
  onIngredientSelect: (itemId: number | null) => void;
  onReceivingLogSelect: (rlId: number | null) => void;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

function LineRow({
  line, ingredients, receivingLogs, isLocked,
  onIngredientSelect, onReceivingLogSelect, onChange, onRemove,
}: LineRowProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
      {/* Row 1: ingredient selector + delete */}
      <div className="flex items-center gap-2">
        {isLocked ? (
          <span className="flex-1 font-medium text-gray-800">{line.ingredient_name || '—'}</span>
        ) : (
          <select
            value={line.inv_item_id ?? ''}
            onChange={(e) => onIngredientSelect(e.target.value ? Number(e.target.value) : null)}
            className="input flex-1"
          >
            <option value="">— 選擇原料 —</option>
            {ingredients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
        {!isLocked && (
          <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Row 2: qty + unit + supplier batch no */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="label text-xs">用量 Qty</label>
          {isLocked ? (
            <p className="text-sm font-medium">{line.qty_used ?? '—'} {line.unit}</p>
          ) : (
            <div className="flex gap-1">
              <input
                type="number"
                step="0.001"
                min="0"
                value={line.qty_used ?? ''}
                onChange={(e) => onChange({ qty_used: e.target.value || null })}
                className="input flex-1"
                placeholder="0.000"
              />
              <select
                value={line.unit ?? 'KG'}
                onChange={(e) => onChange({ unit: e.target.value })}
                className="input w-20"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="label text-xs">供應商批號 Supplier Batch No.</label>
          {isLocked ? (
            <p className="text-sm">{line.supplier_batch_no ?? '—'}</p>
          ) : (
            <input
              type="text"
              value={line.supplier_batch_no ?? ''}
              onChange={(e) => onChange({ supplier_batch_no: e.target.value || null })}
              className="input"
              placeholder="Lot No."
            />
          )}
        </div>

        <div>
          <label className="label text-xs">收貨紀錄 Receiving Log</label>
          {isLocked ? (
            <p className="text-sm">{
              line.receiving_log_id
                ? (receivingLogs.find((r) => r.id === line.receiving_log_id)
                    ? `${receivingLogs.find((r) => r.id === line.receiving_log_id)!.created_at.slice(0, 10)}`
                    : `#${line.receiving_log_id}`)
                : '—'
            }</p>
          ) : (
            <select
              value={line.receiving_log_id ?? ''}
              onChange={(e) => onReceivingLogSelect(e.target.value ? Number(e.target.value) : null)}
              className="input"
              disabled={!line.inv_item_id}
            >
              <option value="">— 不指定 —</option>
              {receivingLogs.map((rl) => (
                <option key={rl.id} value={rl.id}>
                  {rl.created_at.slice(0, 10)}{rl.po_number ? ` · ${rl.po_number}` : ''}{rl.supplier_name ? ` · ${rl.supplier_name}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Supplier auto-filled indicator */}
      {!isLocked && line.supplier && (
        <p className="text-xs text-gray-400">供應商：{line.supplier}</p>
      )}
    </div>
  );
}
