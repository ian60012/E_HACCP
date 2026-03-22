import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { invItemsApi } from '@/api/inventory';
import { InvItem } from '@/types/inventory';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';

export default function InventoryItemsPage() {
  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const pagination = usePagination(50);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: { row: number; code: string; message: string }[] } | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invItemsApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        search: search || undefined,
        is_active: showInactive ? undefined : true,
      });
      setItems(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, search, showInactive]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="nav.invItems" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invItems.subtitle" /></p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="btn btn-secondary flex items-center gap-1.5 text-sm"
          >
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
          <button
            onClick={() => navigate('/inventory/items/new')}
            className="btn btn-primary flex items-center gap-1.5"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="hidden sm:inline"><Bi k="btn.newItem" /></span>
          </button>
        </div>
      </div>

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

      {importResult && (
        <div className={`rounded-lg border p-3 text-sm ${importResult.errors.length > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">
              匯入完成：新增 {importResult.created} 筆，略過 {importResult.skipped} 筆
            </span>
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
          actionTo="/inventory/items/new"
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(`/inventory/items/${item.id}/edit`)}
              className={`card cursor-pointer hover:shadow-lg transition-shadow ${!item.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{item.name}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.code}</span>
                    {item.category && (
                      <span className="text-xs text-gray-500">{item.category}</span>
                    )}
                  </div>
                  {item.supplier_name && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.supplier_name}</p>
                  )}
                </div>
                <span className="text-sm text-gray-400">{item.base_unit}</span>
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
