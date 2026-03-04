import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="nav.invItems" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invItems.subtitle" /></p>
        </div>
        <button
          onClick={() => navigate('/inventory/items/new')}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <PlusIcon className="h-5 w-5" />
          <span className="hidden sm:inline"><Bi k="btn.newItem" /></span>
        </button>
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
