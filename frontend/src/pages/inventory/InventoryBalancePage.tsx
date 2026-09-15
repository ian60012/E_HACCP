import { Fragment, useState, useEffect, useCallback } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { invBalanceApi, invLocationsApi } from '@/api/inventory';
import { InvStockBalance, InvLocation } from '@/types/inventory';
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
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('');
  const [hideZero, setHideZero] = useState(false);

  const fetchLocations = useCallback(async () => {
    const res = await invLocationsApi.list({ is_active: true, limit: 100 });
    setLocations(res.items);
  }, []);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = selectedLocationId ? { location_id: selectedLocationId } : undefined;
      const res = await invBalanceApi.listByLocation(params);
      setBalance(res.items);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectedLocationId]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const filtered = balance.filter((b) => {
    if (hideZero && Number(b.quantity) <= 0) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        b.item_name?.toLowerCase().includes(s) ||
        b.item_code?.toLowerCase().includes(s) ||
        b.location_name?.toLowerCase().includes(s)
      );
    }
    return true;
  });

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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedLocationId}
          onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : '')}
          className="input w-48"
        >
          <option value="">全部儲位</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="rounded border-gray-300"
          />
          隱藏零庫存
        </label>

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
                <Fragment key={`${row.item_id}-${row.location_id}`}>
                  <tr
                    className={Number(row.quantity) <= 0 ? 'text-gray-300' : ''}
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{row.item_code}</td>
                    <td className="py-2 pr-4 font-medium">
                      {row.item_name}
                      {row.lot_tracking_enabled && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">批號管理</span>}
                    </td>
                    <td className="py-2 pr-4">{row.item_category || '—'}</td>
                    <td className="py-2 pr-4">{row.location_name}</td>
                    <td className="py-2 text-right font-semibold">
                      <span className={Number(row.quantity) < 0 ? 'text-red-600' : ''}>
                        {Number(row.quantity).toFixed(3)}
                      </span>
                    </td>
                    <td className="py-2 pl-2 text-gray-400">{row.base_unit}</td>
                  </tr>
                  {row.lot_tracking_enabled && row.lots.map((lot) => (
                    <tr key={`${row.item_id}-${row.location_id}-${lot.lot_id}`} className="bg-gray-50/70 text-xs text-gray-600">
                      <td className="py-1.5 pr-4" />
                      <td className="py-1.5 pr-4 font-mono">↳ {lot.lot_code}</td>
                      <td className="py-1.5 pr-4">{lot.origin_type}</td>
                      <td className="py-1.5 pr-4">{lot.is_system_generated ? '系統批號' : '人工批號'}</td>
                      <td className="py-1.5 text-right font-medium">{Number(lot.quantity).toFixed(3)}</td>
                      <td className="py-1.5 pl-2">{row.base_unit}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">{bi('label.totalRows')}: {filtered.length}</p>
        </div>
      )}
    </div>
  );
}
