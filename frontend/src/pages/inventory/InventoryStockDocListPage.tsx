import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { invDocsApi } from '@/api/inventory';
import { InvStockDoc, InvDocType } from '@/types/inventory';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Australia/Melbourne', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Posted: 'bg-green-100 text-green-700',
  Voided: 'bg-red-100 text-red-500',
};

export default function InventoryStockDocListPage() {
  const [docs, setDocs] = useState<InvStockDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docType, setDocType] = useState<InvDocType | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const pagination = usePagination(20);
  const navigate = useNavigate();

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invDocsApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        doc_type: docType || undefined,
        status: statusFilter || undefined,
      });
      setDocs(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, docType, statusFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="nav.invDocs" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invDocs.subtitle" /></p>
        </div>
        <button
          onClick={() => navigate('/inventory/docs/new')}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <PlusIcon className="h-5 w-5" />
          <span className="hidden sm:inline"><Bi k="btn.newDoc" /></span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={docType} onChange={(e) => setDocType(e.target.value as any)} className="input w-auto">
          <option value=""><Bi k="label.allTypes" /></option>
          <option value="IN"><Bi k="label.stockIn" /></option>
          <option value="OUT"><Bi k="label.stockOut" /></option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value=""><Bi k="label.allStatuses" /></option>
          <option value="Draft"><Bi k="label.draft" /></option>
          <option value="Posted"><Bi k="label.posted" /></option>
          <option value="Voided"><Bi k="label.voided" /></option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchDocs} />
      ) : docs.length === 0 ? (
        <EmptyState
          message={bi('empty.invDocs')}
          actionLabel={bi('btn.newDoc')}
          actionTo="/inventory/docs/new"
        />
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => navigate(`/inventory/docs/${doc.id}`)}
              className="card cursor-pointer hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{doc.doc_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${doc.doc_type === 'IN' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {doc.doc_type === 'IN' ? <Bi k="label.stockIn" /> : <Bi k="label.stockOut" />}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[doc.status] || ''}`}>
                      {doc.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    {doc.location_name && <span>{doc.location_name}</span>}
                    {doc.ref_number && <span>Ref: {doc.ref_number}</span>}
                    {doc.operator_name && <span>{doc.operator_name}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                  {formatDateTime(doc.created_at)}
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
