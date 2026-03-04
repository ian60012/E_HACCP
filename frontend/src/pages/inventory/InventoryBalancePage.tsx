import { useState, useEffect, useCallback } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { invBalanceApi } from '@/api/inventory';
import { InvStockBalance } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Bi, { bi } from '@/components/Bi';
import { exportToExcel, exportToPdf, ExportColumn } from '@/utils/export';

const exportColumns: ExportColumn<InvStockBalance>[] = [
  { key: 'item_code', header: '品項編號 Item Code' },
  { key: 'item_name', header: '品項名稱 Item Name' },
  { key: 'item_category', header: '類別 Category' },
  { key: 'location_code', header: '儲位編號 Location Code' },
  { key: 'location_name', header: '儲位 Location' },
  { key: 'quantity', header: '庫存 Quantity' },
  { key: 'base_unit', header: '單位 Unit' },
];

export default function InventoryBalancePage() {
  const [balance, setBalance] = useState<InvStockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invBalanceApi.list({ limit: 5000 });
      setBalance(res.items);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const filtered = search
    ? balance.filter(
        (b) =>
          b.item_name?.toLowerCase().includes(search.toLowerCase()) ||
          b.item_code?.toLowerCase().includes(search.toLowerCase()) ||
          b.location_name?.toLowerCase().includes(search.toLowerCase())
      )
    : balance;

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      if (type === 'excel') {
        exportToExcel(filtered, exportColumns, `inventory-balance-${dateStr}`);
      } else {
        exportToPdf(filtered, exportColumns, '庫存報表 Stock Balance');
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="nav.invBalance" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invBalance.subtitle" /></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('excel')} disabled={exporting} className="btn btn-secondary text-sm flex items-center gap-1.5">
            <ArrowDownTrayIcon className="h-4 w-4" /><Bi k="btn.exportExcel" />
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting} className="btn btn-secondary text-sm flex items-center gap-1.5">
            <ArrowDownTrayIcon className="h-4 w-4" /><Bi k="btn.exportPdf" />
          </button>
        </div>
      </div>

      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={bi('placeholder.searchItems')}
          className="input w-full max-w-xs"
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchBalance} />
      ) : filtered.length === 0 ? (
        <EmptyState message={bi('empty.invBalance')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-4"><Bi k="field.itemCode" /></th>
                <th className="pb-2 pr-4"><Bi k="field.itemName" /></th>
                <th className="pb-2 pr-4"><Bi k="field.category" /></th>
                <th className="pb-2 pr-4"><Bi k="field.location" /></th>
                <th className="pb-2 text-right"><Bi k="field.quantity" /></th>
                <th className="pb-2 pl-2"><Bi k="field.unit" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((row) => (
                <tr
                  key={`${row.item_id}-${row.location_id}`}
                  className={Number(row.quantity) <= 0 ? 'text-gray-300' : ''}
                >
                  <td className="py-2 pr-4 font-mono text-xs">{row.item_code}</td>
                  <td className="py-2 pr-4 font-medium text-gray-800">{row.item_name}</td>
                  <td className="py-2 pr-4 text-gray-500">{row.item_category || '—'}</td>
                  <td className="py-2 pr-4 text-gray-500">{row.location_name}</td>
                  <td className="py-2 text-right font-semibold">
                    <span className={Number(row.quantity) < 0 ? 'text-red-600' : ''}>
                      {row.quantity}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-gray-400">{row.base_unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">{bi('label.totalRows')}: {filtered.length}</p>
        </div>
      )}
    </div>
  );
}
