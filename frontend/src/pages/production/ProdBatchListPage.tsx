import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { prodBatchesApi } from '@/api/production';
import { ProdBatch, ProdBatchStatus } from '@/types/production';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';

const num = (v: any): number => (v == null ? 0 : Number(v));

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  packed: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-green-100 text-green-800',
};

const statusLabels: Record<string, string> = {
  open: '進行中 Open',
  packed: '已裝袋 Packed',
  closed: '已結案 Closed',
};

export default function ProdBatchListPage() {
  const [searchParams] = useSearchParams();
  const productType = searchParams.get('type') as 'forming' | 'hot_process' | null;

  const [batches, setBatches] = useState<ProdBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProdBatchStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const pagination = usePagination(20);
  const navigate = useNavigate();

  const pageTitle = productType === 'forming'
    ? bi('page.forming.title')
    : productType === 'hot_process'
    ? bi('page.hotProcess.title')
    : bi('page.prodBatches.title');

  const pageSubtitle = productType === 'forming'
    ? bi('page.forming.subtitle')
    : productType === 'hot_process'
    ? bi('page.hotProcess.subtitle')
    : bi('page.prodBatches.subtitle');

  const newBtnLabel = productType === 'forming'
    ? bi('page.forming.new')
    : productType === 'hot_process'
    ? bi('page.hotProcess.new')
    : bi('btn.newBatch');

  const emptyMsg = productType === 'forming'
    ? bi('empty.formingBatches')
    : productType === 'hot_process'
    ? bi('empty.hotProcessBatches')
    : bi('empty.prodBatches');

  const newBatchTo = productType
    ? `/production/batches/new?type=${productType}`
    : '/production/batches/new';

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await prodBatchesApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        product_type: productType || undefined,
      });
      setBatches(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, statusFilter, dateFrom, dateTo, productType]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{pageSubtitle}</p>
        </div>
        <RoleGate roles={['Admin', 'Production']}>
          <button
            onClick={() => navigate(newBatchTo)}
            className="btn btn-primary flex items-center gap-1.5"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="hidden sm:inline">{newBtnLabel}</span>
          </button>
        </RoleGate>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProdBatchStatus | '')}
          className="input w-auto"
        >
          <option value="">{bi('label.allStatuses')}</option>
          <option value="open">{bi('label.open')}</option>
          <option value="closed">{bi('label.closed')}</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="input w-auto"
          placeholder={bi('placeholder.dateFrom')}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="input w-auto"
          placeholder={bi('placeholder.dateTo')}
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchBatches} />
      ) : batches.length === 0 ? (
        <EmptyState
          message={emptyMsg}
          actionLabel={newBtnLabel}
          actionTo={newBatchTo}
        />
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4"><Bi k="field.batchCode" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.productCode" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.productName" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.productionDate" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.shift" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.status" /></th>
                  <th className="pb-2"><Bi k="field.estNetWeight" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    onClick={() => navigate(`/production/batches/${batch.id}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2 pr-4 font-medium text-gray-800">{batch.batch_code}</td>
                    <td className="py-2 pr-4 text-gray-500">{batch.product_code}</td>
                    <td className="py-2 pr-4 text-gray-700">{batch.product_name}</td>
                    <td className="py-2 pr-4 text-gray-500">{batch.production_date}</td>
                    <td className="py-2 pr-4 text-gray-500">{batch.shift || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[batch.status] || ''}`}>
                        {statusLabels[batch.status] || batch.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500">
                      {batch.estimated_forming_net_weight_kg != null
                        ? `${num(batch.estimated_forming_net_weight_kg).toFixed(2)} kg`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
