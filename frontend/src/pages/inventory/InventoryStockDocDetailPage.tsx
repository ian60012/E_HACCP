import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';
import { invDocsApi } from '@/api/inventory';
import { InvStockDoc } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import ConfirmDialog from '@/components/ConfirmDialog';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Posted: 'bg-green-100 text-green-700',
  Voided: 'bg-red-100 text-red-500',
};

export default function InventoryStockDocDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<InvStockDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);

  const fetchDoc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await invDocsApi.get(Number(id));
      setDoc(data);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  const handlePost = async () => {
    if (!doc) return;
    setPostLoading(true);
    try {
      const updated = await invDocsApi.post(doc.id);
      setDoc(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setPostLoading(false);
    }
  };

  const handleVoid = async (reason?: string) => {
    if (!doc || !reason) return;
    setVoidLoading(true);
    try {
      const updated = await invDocsApi.void(doc.id, reason);
      setDoc(updated);
      setVoidDialogOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setVoidLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !doc) return <ErrorCard message={error} onRetry={fetchDoc} />;
  if (!doc) return <ErrorCard message={bi('error.loadFailed')} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/docs')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{doc.doc_number}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {doc.doc_type === 'IN' ? <Bi k="label.stockIn" /> : <Bi k="label.stockOut" />}
              {doc.ref_number && ` — Ref: ${doc.ref_number}`}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[doc.status] || ''}`}>
          {doc.status}
        </span>
      </div>

      {error && <ErrorCard message={error} />}

      {/* Action buttons */}
      {doc.status === 'Draft' && (
        <RoleGate roles={['Admin', 'Warehouse']}>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/inventory/docs/${doc.id}/edit`)}
              className="btn btn-secondary flex items-center gap-1.5"
            >
              <PencilIcon className="h-4 w-4" />
              <Bi k="btn.edit" />
            </button>
            <button
              onClick={handlePost}
              disabled={postLoading}
              className="btn btn-primary"
            >
              {postLoading ? <Bi k="btn.posting" /> : <Bi k="btn.postDoc" />}
            </button>
          </div>
        </RoleGate>
      )}
      {doc.status === 'Posted' && (
        <RoleGate roles={['Admin', 'Warehouse']}>
          <div className="flex gap-2">
            <button onClick={() => setVoidDialogOpen(true)} className="btn btn-secondary text-red-600">
              <Bi k="btn.void" />
            </button>
          </div>
        </RoleGate>
      )}

      {/* Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.docHeader" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.location" /></p>
            <p className="font-medium text-gray-800">{doc.location_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.operator" /></p>
            <p className="font-medium text-gray-800">{doc.operator_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="audit.createdAt" /></p>
            <p className="font-medium text-gray-700">{formatDateTime(doc.created_at)}</p>
          </div>
          {doc.posted_at && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="audit.postedAt" /></p>
              <p className="font-medium text-gray-700">{formatDateTime(doc.posted_at)}</p>
            </div>
          )}
          {doc.receiving_log_id && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.receivingLog" /></p>
              <Link
                to={`/receiving-logs/${doc.receiving_log_id}`}
                className="text-blue-600 hover:underline font-medium"
              >
                #{doc.receiving_log_id}
              </Link>
            </div>
          )}
          {doc.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-400"><Bi k="field.notes" /></p>
              <p className="font-medium text-gray-700 whitespace-pre-wrap">{doc.notes}</p>
            </div>
          )}
          {doc.void_reason && (
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-400"><Bi k="field.voidReason" /></p>
              <p className="font-medium text-red-600">{doc.void_reason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.docLines" /></h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-4"><Bi k="field.item" /></th>
                <th className="pb-2 pr-4"><Bi k="field.location" /></th>
                <th className="pb-2 pr-4"><Bi k="field.quantity" /></th>
                <th className="pb-2 pr-4"><Bi k="field.unit" /></th>
                <th className="pb-2"><Bi k="field.unitCost" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {doc.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2 pr-4">
                    <span className="font-medium text-gray-800">{line.item_name}</span>
                    <span className="text-xs text-gray-400 ml-1">{line.item_code}</span>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{line.location_name || '—'}</td>
                  <td className="py-2 pr-4 font-medium">{Math.round(Number(line.quantity))}</td>
                  <td className="py-2 pr-4 text-gray-500">{line.unit}</td>
                  <td className="py-2 text-gray-500">{line.unit_cost || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Void dialog */}
      <ConfirmDialog
        open={voidDialogOpen}
        title={bi('confirm.void.title')}
        message={bi('confirm.void.message')}
        confirmLabel={bi('confirm.void.confirm')}
        variant="danger"
        requireReason
        reasonLabel={bi('confirm.void.reason')}
        reasonMinLength={5}
        onConfirm={handleVoid}
        onCancel={() => setVoidDialogOpen(false)}
        loading={voidLoading}
      />
    </div>
  );
}
