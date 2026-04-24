import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PlusIcon, XMarkIcon, ClipboardDocumentListIcon, CheckIcon,
} from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { invItemsApi } from '@/api/inventory';
import { InvItem } from '@/types/inventory';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';

const UNITS = ['PCS', 'KG', 'G', 'L', 'ML', '包', '箱', '袋', '罐', '卷', '打'];

interface Props {
  /** If set, always filter by this category and show category-specific title */
  defaultCategory?: string;
  /** Base path used for navigation (edit/new links). Defaults to /inventory/items */
  basePath?: string;
}

export default function InventoryItemsPage({ defaultCategory, basePath = '/inventory/items' }: Props) {
  const [searchParams] = useSearchParams();
  // category can come from props or URL param (URL takes precedence for flexibility)
  const categoryFilter = defaultCategory ?? (searchParams.get('category') || undefined);

  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const pagination = usePagination(50);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number; skipped: number; errors: { row: number; code: string; message: string }[];
  } | null>(null);

  // ── Bulk select ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkField, setBulkField] = useState<'category' | 'base_unit' | 'usage_unit' | 'is_active'>('category');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };
  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0 || !bulkValue.trim()) return;
    setBulkSaving(true);
    try {
      const payload: Record<string, any> = { ids: [...selectedIds] };
      if (bulkField === 'category') payload.category = bulkValue.trim();
      else if (bulkField === 'base_unit') payload.base_unit = bulkValue.trim();
      else if (bulkField === 'usage_unit') payload.usage_unit = bulkValue.trim();
      else if (bulkField === 'is_active') payload.is_active = bulkValue === 'true';
      await invItemsApi.bulkUpdate(payload as any);
      setSelectedIds(new Set());
      setBulkValue('');
      await fetchItems();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '批量更新失敗');
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Data fetch ───────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invItemsApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        search: search || undefined,
        is_active: showInactive ? undefined : true,
        category: categoryFilter,
      });
      setItems(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, search, showInactive, categoryFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Clear selection when page changes
  useEffect(() => { setSelectedIds(new Set()); }, [pagination.skip]);

  // ── Import helpers ───────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const blob = await invItemsApi.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inv_items_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('下載模板失敗');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const result = await invItemsApi.importItems(file);
      setImportResult(result);
      await fetchItems();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '匯入失敗');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Edit navigation ──────────────────────────────────────────────────────
  const editUrl = (item: InvItem) => {
    const returnTo = basePath !== '/inventory/items' ? `?returnTo=${encodeURIComponent(basePath)}` : '';
    return `/inventory/items/${item.id}/edit${returnTo}`;
  };

  const newUrl = () => {
    const returnTo = basePath !== '/inventory/items' ? `?returnTo=${encodeURIComponent(basePath)}` : '';
    return `/inventory/items/new${returnTo}`;
  };

  const pageTitle = defaultCategory ? `${defaultCategory}管理` : <Bi k="nav.invItems" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invItems.subtitle" /></p>
        </div>
        <RoleGate roles={['Admin', 'Warehouse']}>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadTemplate} className="btn btn-secondary flex items-center gap-1.5 text-sm">
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span className="hidden sm:inline">下載模板</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn btn-secondary flex items-center gap-1.5 text-sm"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{importing ? '匯入中…' : '批量匯入'}</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <button onClick={() => navigate(newUrl())} className="btn btn-primary flex items-center gap-1.5">
              <PlusIcon className="h-5 w-5" />
              <span className="hidden sm:inline"><Bi k="btn.newItem" /></span>
            </button>
          </div>
        </RoleGate>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={bi('placeholder.searchItems')}
          className="input flex-1 min-w-48"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Bi k="btn.showInactive" />
        </label>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-800">已選取 {selectedIds.size} 項</span>
          <select
            value={bulkField}
            onChange={(e) => { setBulkField(e.target.value as any); setBulkValue(''); }}
            className="input text-sm py-1 px-2 w-36"
          >
            <option value="category">修改分類</option>
            <option value="base_unit">修改收貨單位</option>
            <option value="usage_unit">修改生產用量單位</option>
            <option value="is_active">修改狀態</option>
          </select>

          {(bulkField === 'base_unit' || bulkField === 'usage_unit') ? (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="input text-sm py-1 px-2 w-28">
              <option value="">— 選擇 —</option>
              {(bulkField === 'usage_unit'
                ? ['KG', 'G', 'L', 'ML', 'PCS']
                : UNITS
              ).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : bulkField === 'is_active' ? (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="input text-sm py-1 px-2 w-28">
              <option value="">— 選擇 —</option>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          ) : (
            <input
              type="text"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder="輸入分類名稱…"
              className="input text-sm py-1 px-2 w-40"
            />
          )}

          <button
            onClick={handleBulkUpdate}
            disabled={bulkSaving || !bulkValue.trim()}
            className="btn btn-primary text-sm py-1 flex items-center gap-1"
          >
            <CheckIcon className="h-4 w-4" />
            {bulkSaving ? '更新中…' : '套用'}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="btn btn-secondary text-sm py-1">
            取消
          </button>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className={`rounded-lg border p-3 text-sm ${importResult.errors.length > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">匯入完成：新增 {importResult.created} 筆，略過 {importResult.skipped} 筆</span>
            <button onClick={() => setImportResult(null)} className="p-1 rounded hover:bg-white/60">
              <XMarkIcon className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-yellow-800">
              {importResult.errors.map((e, idx) => (
                <li key={idx}>列 {e.row}（{e.code}）：{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchItems} />
      ) : items.length === 0 ? (
        <EmptyState
          message={bi('empty.invItems')}
          actionLabel={bi('btn.newItem')}
          actionTo={newUrl()}
        />
      ) : (
        <div className="space-y-2">
          {/* Select-all row */}
          <div className="flex items-center gap-3 px-1 text-xs text-gray-400">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-gray-300"
              />
              全選本頁
            </label>
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className={`card transition-shadow ${!item.is_active ? 'opacity-50' : ''} ${selectedIds.has(item.id) ? 'border-blue-300 bg-blue-50/40' : ''}`}
            >
              <div className="flex items-center gap-3">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-gray-300 flex-shrink-0"
                />

                {/* Item info (click to edit) */}
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(editUrl(item))}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{item.name}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.code}</span>
                    {item.category && !defaultCategory && (
                      <span className="text-xs text-gray-500">{item.category}</span>
                    )}
                  </div>
                  {item.supplier_name && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.supplier_name}</p>
                  )}
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm text-gray-400">
                    {item.base_unit}
                    {item.usage_unit && item.usage_unit !== item.base_unit && (
                      <span className="ml-1 text-blue-500">→ {item.usage_unit}</span>
                    )}
                  </span>
                  {categoryFilter === '原料' && item.is_active && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const params = new URLSearchParams({
                          inv_item_id: String(item.id),
                          inv_item_name: item.name,
                        });
                        if (item.supplier_id) params.set('supplier_id', String(item.supplier_id));
                        navigate(`/receiving/logs/new?${params.toString()}`);
                      }}
                      className="btn btn-secondary text-xs flex items-center gap-1 py-1 px-2"
                      title="建立收貨紀錄"
                    >
                      <ClipboardDocumentListIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">建立收貨紀錄</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            total={pagination.total}
            hasNext={pagination.hasNext}
            hasPrev={pagination.hasPrev}
            onNext={pagination.nextPage}
            onPrev={pagination.prevPage}
          />
        </div>
      )}
    </div>
  );
}
