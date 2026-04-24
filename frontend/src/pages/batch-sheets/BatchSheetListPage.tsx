import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardDocumentListIcon, CheckBadgeIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { batchSheetApi } from '@/api/batch-sheet';
import { BatchSheetSummary } from '@/types/batch-sheet';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Pagination from '@/components/Pagination';

export default function BatchSheetListPage() {
  const [items, setItems] = useState<BatchSheetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pagination = usePagination(50);
  const navigate = useNavigate();

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await batchSheetApi.list({ skip: pagination.skip, limit: pagination.limit });
      setItems(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError('無法載入資料');
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const statusBadge = (item: BatchSheetSummary) => {
    if (!item.has_sheet || item.line_count === 0) {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未填寫</span>;
    }
    if (item.is_locked) {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckBadgeIcon className="h-3.5 w-3.5" />已驗核</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">填寫中 ({item.line_count} 項)</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ClipboardDocumentListIcon className="h-7 w-7 text-gray-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Batch Sheet</h1>
          <p className="text-sm text-gray-500">FSP-LOG-017 · 每批次原料使用記錄</p>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchList} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.batch_id}
              onClick={() => navigate(`/batch-sheets/${item.batch_id}`)}
              className="card cursor-pointer hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{item.batch_code}</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                      {item.production_date}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{item.product_name}</p>
                  {item.operator_name && (
                    <p className="text-xs text-gray-400">填表：{item.operator_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(item)}
                  <PencilSquareIcon className="h-5 w-5 text-gray-300" />
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
