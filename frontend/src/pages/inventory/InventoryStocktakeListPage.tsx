import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';
import { invStocktakeApi } from '@/api/inventory';
import { InvStocktake } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import RoleGate from '@/components/RoleGate';

const PAGE_SIZE = 50;

export default function InventoryStocktakeListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InvStocktake[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invStocktakeApi.list({
        skip,
        limit: PAGE_SIZE,
        status: statusFilter || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setError('載入失敗');
    } finally {
      setLoading(false);
    }
  }, [skip, statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const statusBadge = (s: string) =>
    s === 'confirmed'
      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">已確認</span>
      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">草稿</span>;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">盤點管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {total} 筆盤點紀錄</p>
        </div>
        <RoleGate roles={['Admin', 'Warehouse']}>
          <button
            onClick={() => navigate('/inventory/stocktakes/new')}
            className="btn btn-primary flex items-center gap-1"
          >
            <PlusIcon className="h-4 w-4" />新增盤點
          </button>
        </RoleGate>
      </div>

      {/* Filters */}
      <div className="card flex items-center gap-4">
        <label className="text-sm text-gray-500">狀態</label>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setSkip(0); }}
          className="input w-32 text-sm"
        >
          <option value="">全部</option>
          <option value="draft">草稿</option>
          <option value="confirmed">已確認</option>
        </select>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorCard message={error} onRetry={fetch} />}

      {!loading && !error && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-4">單號</th>
                <th className="pb-2 pr-4">儲位</th>
                <th className="pb-2 pr-4">盤點日期</th>
                <th className="pb-2 pr-4">品項數</th>
                <th className="pb-2 pr-4">狀態</th>
                <th className="pb-2 pr-4">建立時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((st) => (
                <tr
                  key={st.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/inventory/stocktakes/${st.id}`)}
                >
                  <td className="py-2 pr-4 font-mono text-xs text-blue-600">{st.doc_number}</td>
                  <td className="py-2 pr-4 text-gray-700">{st.location_name}</td>
                  <td className="py-2 pr-4 text-gray-600">{st.count_date}</td>
                  <td className="py-2 pr-4 text-gray-500">{st.lines.length}</td>
                  <td className="py-2 pr-4">{statusBadge(st.status)}</td>
                  <td className="py-2 pr-4 text-gray-400 text-xs">
                    {new Date(st.created_at).toLocaleString('zh-TW')}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">尚無盤點紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>第 {page} / {totalPages} 頁</span>
          <div className="flex gap-2">
            <button
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              className="btn btn-secondary disabled:opacity-40"
            >上一頁</button>
            <button
              disabled={skip + PAGE_SIZE >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
              className="btn btn-secondary disabled:opacity-40"
            >下一頁</button>
          </div>
        </div>
      )}
    </div>
  );
}
