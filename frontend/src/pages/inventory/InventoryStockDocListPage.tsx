import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { invDocsApi } from '@/api/inventory';
import { InvStockDoc, InvDocType, ItemType, ITEM_TYPES } from '@/types/inventory';
import StockDocNewMenu from './StockDocNewMenu';
import { stockDocLabel } from './stockDocScopes';
import { t } from '@/i18n/labels';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';

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
  const [scopeFilter, setScopeFilter] = useState<ItemType | 'general' | ''>('');
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
        item_type_scope: scopeFilter && scopeFilter !== 'general' ? scopeFilter : undefined,
        general_only: scopeFilter === 'general' || undefined,
      });
      setDocs(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, docType, statusFilter, scopeFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="nav.invDocs" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invDocs.subtitle" /></p>
        </div>
        <RoleGate roles={['Admin', 'Warehouse']}>
          <StockDocNewMenu />
        </RoleGate>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select aria-label={bi('field.itemTypeScope')} value={scopeFilter} onChange={(e) => { setScopeFilter(e.target.value as typeof scopeFilter); pagination.goToPage(1); }} className="input w-auto">
          <option value="">{bi('label.allScopes')}</option>
          <option value="general">{bi('label.general')}</option>
          {ITEM_TYPES.map((scope) => <option key={scope} value={scope}>{t(`inv.itemType.${scope}`).zh} {t(`inv.itemType.${scope}`).en}</option>)}
        </select>
        <select aria-label={bi('field.docType')} value={docType} onChange={(e) => { setDocType(e.target.value as InvDocType | ''); pagination.goToPage(1); }} className="input w-auto">
          <option value="">{bi('label.allTypes')}</option>
          <option value="IN">{bi('label.stockIn')}</option>
          <option value="OUT">{bi('label.stockOut')}</option>
        </select>
        <select aria-label={bi('field.isActive')} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); pagination.goToPage(1); }} className="input w-auto">
          <option value="">{bi('label.allStatuses')}</option>
          <option value="Draft">{bi('label.draft')}</option>
          <option value="Posted">{bi('label.posted')}</option>
          <option value="Voided">{bi('label.voided')}</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchDocs} />
      ) : docs.length === 0 ? (
        <EmptyState
          message={bi('empty.invDocs')}
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
                      <Bi label={stockDocLabel(doc.doc_type, doc.item_type_scope)} />
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
