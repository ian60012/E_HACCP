import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { receivingLogsApi } from '@/api/receiving-logs';
import { ReceivingLog } from '@/types/receiving-log';
import { invItemsApi, invLocationsApi } from '@/api/inventory';
import { InvItem, InvLocation } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import StatusBadge from '@/components/StatusBadge';
import CCPIndicator from '@/components/CCPIndicator';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import Bi, { bi } from '@/components/Bi';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReceivingLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<ReceivingLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);

  // Inventory integration state
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [invLocations, setInvLocations] = useState<InvLocation[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('');
  const [convertLoading, setConvertLoading] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await receivingLogsApi.get(Number(id));
      setLog(data);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLog();
    invItemsApi.list({ limit: 500 }).then((r) => setInvItems(r.items)).catch(() => {});
    invLocationsApi.list({ limit: 200 }).then((r) => setInvLocations(r.items)).catch(() => {});
  }, [fetchLog]);

  const handleLock = async () => {
    if (!log) return;
    setLockLoading(true);
    try {
      const updated = await receivingLogsApi.lock(log.id);
      setLog(updated);
    } catch {
      setError(bi('error.updateFailed'));
    } finally {
      setLockLoading(false);
    }
  };

  const handleVoid = async (reason?: string) => {
    if (!log || !reason) return;
    setVoidLoading(true);
    try {
      const updated = await receivingLogsApi.void(log.id, { void_reason: reason });
      setLog(updated);
      setVoidDialogOpen(false);
    } catch {
      setError(bi('error.updateFailed'));
    } finally {
      setVoidLoading(false);
    }
  };

  const handleLinkItem = async () => {
    if (!log || !selectedItemId) return;
    setLinkLoading(true);
    try {
      const updated = await receivingLogsApi.setInvItem(log.id, Number(selectedItemId));
      setLog(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setLinkLoading(false);
    }
  };

  const handleConvertToStockIn = async () => {
    if (!log || !selectedLocationId) return;
    setConvertLoading(true);
    try {
      const doc = await receivingLogsApi.convertToStockIn(log.id, Number(selectedLocationId));
      navigate(`/inventory/docs/${doc.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setConvertLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !log) return <ErrorCard message={error} onRetry={fetchLog} />;
  if (!log) return <ErrorCard message={bi('error.loadFailed')} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/receiving-logs')}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.receiving.detail" /></h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {log.po_number ? `PO: ${log.po_number}` : `${bi('misc.record')} #${log.id}`}
            </p>
          </div>
        </div>
        {!log.is_locked && !log.is_voided && (
          <Link
            to={`/receiving-logs/${log.id}/edit`}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <PencilSquareIcon className="h-4 w-4" />
            <Bi k="btn.edit" />
          </Link>
        )}
      </div>

      {/* Error banner */}
      {error && <ErrorCard message={error} />}

      {/* ALCOA Audit Bar */}
      <ALCOAAuditBar
        operatorName={log.operator_name}
        verifierName={log.verifier_name}
        createdAt={log.created_at}
        isLocked={log.is_locked}
        isVoided={log.is_voided}
        voidReason={log.void_reason}
        voidedAt={log.voided_at}
        voidedBy={log.voided_by}
        onLock={handleLock}
        onVoid={() => setVoidDialogOpen(true)}
        lockLoading={lockLoading}
      />

      {/* Main Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.receivingInfo" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.supplier" /></p>
            <p className="font-medium text-gray-800">
              {log.supplier_name || `#${log.supplier_id}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.poNumber" /></p>
            <p className="font-medium text-gray-800">{log.po_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.productName" /></p>
            <p className="font-medium text-gray-800">{log.product_name || '—'}</p>
          </div>
          {log.quantity && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.receivingQuantity" /></p>
              <p className="font-medium text-gray-800">
                {log.quantity} {log.quantity_unit || ''}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.acceptanceStatus" /></p>
            <div className="mt-0.5">
              <StatusBadge status={log.acceptance_status} size="md" />
            </div>
          </div>
        </div>
      </div>

      {/* Temperature CCP */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.tempCheck" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CCPIndicator
            value={log.temp_chilled}
            limit={5}
            unit="°C"
            mode="lte"
            label={bi('field.tempChilled')}
          />
          <CCPIndicator
            value={log.temp_frozen}
            limit={-18}
            unit="°C"
            mode="lte"
            label={bi('field.tempFrozen')}
          />
        </div>
      </div>

      {/* Inspection Results */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.inspection" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.vehicleCleanliness" /></p>
            <div className="mt-1">
              <StatusBadge status={log.vehicle_cleanliness} size="md" />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.packagingIntegrity" /></p>
            <div className="mt-1">
              <StatusBadge status={log.packaging_integrity} size="md" />
            </div>
          </div>
        </div>
      </div>

      {/* Corrective Action */}
      {log.corrective_action && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-2"><Bi k="field.correctiveAction" /></h2>
          <p className="text-gray-700 whitespace-pre-wrap">{log.corrective_action}</p>
        </div>
      )}

      {/* Notes */}
      {log.notes && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-2"><Bi k="field.notes" /></h2>
          <p className="text-gray-700 whitespace-pre-wrap">{log.notes}</p>
        </div>
      )}

      {/* Timestamps */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.timestamps" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400"><Bi k="audit.createdAt" /></p>
            <p className="font-medium text-gray-700">{formatDateTime(log.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Inventory Integration */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.invIntegration" /></h2>

        {/* Show linked stock doc if exists */}
        {log.inv_stock_doc_id ? (
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.invItem" /></p>
              <p className="font-medium text-gray-800">{log.inv_item_name || `#${log.inv_item_id}`}</p>
            </div>
            <Link
              to={`/inventory/docs/${log.inv_stock_doc_id}`}
              className="btn btn-secondary text-sm ml-auto"
            >
              <Bi k="btn.viewStockDoc" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Link inventory item */}
            {!log.is_voided && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1"><Bi k="field.invItem" /></p>
                  <select
                    value={log.inv_item_id ?? selectedItemId}
                    onChange={(e) => setSelectedItemId(Number(e.target.value) || '')}
                    className="input"
                    disabled={Boolean(log.inv_item_id) || log.is_locked}
                  >
                    <option value=""><Bi k="placeholder.selectItem" /></option>
                    {invItems.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
                    ))}
                  </select>
                </div>
                {!log.inv_item_id && !log.is_locked && (
                  <button
                    onClick={handleLinkItem}
                    disabled={!selectedItemId || linkLoading}
                    className="btn btn-secondary"
                  >
                    {linkLoading ? '…' : <Bi k="btn.save" />}
                  </button>
                )}
                {log.inv_item_id && (
                  <span className="text-sm text-green-600 font-medium">{log.inv_item_name}</span>
                )}
              </div>
            )}

            {/* Convert to stock-IN button */}
            {log.is_locked && log.acceptance_status === 'Accept' && log.inv_item_id && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1"><Bi k="field.location" /></p>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(Number(e.target.value) || '')}
                    className="input"
                  >
                    <option value=""><Bi k="placeholder.selectLocation" /></option>
                    {invLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleConvertToStockIn}
                  disabled={!selectedLocationId || convertLoading}
                  className="btn btn-primary"
                >
                  {convertLoading ? '…' : <Bi k="btn.convertToStockIn" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Void Dialog */}
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
