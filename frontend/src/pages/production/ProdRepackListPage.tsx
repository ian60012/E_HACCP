import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { prodRepackApi } from '@/api/production';
import { ProdRepackJob } from '@/types/production';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';

export default function ProdRepackListPage() {
  const [jobs, setJobs] = useState<ProdRepackJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const pagination = usePagination(20);
  const navigate = useNavigate();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await prodRepackApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setJobs(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, dateFrom, dateTo]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.prodRepack.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.prodRepack.subtitle" /></p>
        </div>
        <RoleGate roles={['Admin', 'Production']}>
          <button
            onClick={() => navigate('/production/repack/new')}
            className="btn btn-primary flex items-center gap-1.5"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="hidden sm:inline"><Bi k="btn.newRepack" /></span>
          </button>
        </RoleGate>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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
        <ErrorCard message={error} onRetry={fetchJobs} />
      ) : jobs.length === 0 ? (
        <EmptyState
          message={bi('empty.prodRepack')}
          actionLabel={bi('btn.newRepack')}
          actionTo="/production/repack/new"
        />
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4"><Bi k="field.batchCode" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.date" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.operator" /></th>
                  <th className="pb-2"><Bi k="field.remark" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/production/repack/${job.id}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2 pr-4 font-medium text-gray-800">{job.new_batch_code}</td>
                    <td className="py-2 pr-4 text-gray-500">{job.date}</td>
                    <td className="py-2 pr-4 text-gray-500">{job.operator || '—'}</td>
                    <td className="py-2 text-gray-400 text-xs">{job.remark || '—'}</td>
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
