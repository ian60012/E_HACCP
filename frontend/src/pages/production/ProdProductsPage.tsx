import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { PencilIcon } from '@heroicons/react/24/outline';
import { prodProductsApi } from '@/api/production';
import { invItemsApi } from '@/api/inventory';
import { ProdProduct, ProdProductCreate } from '@/types/production';
import { InvItem } from '@/types/inventory';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';

export default function ProdProductsPage() {
  const [products, setProducts] = useState<ProdProduct[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const pagination = usePagination(50);

  // Inline form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCcpLimitTemp, setFormCcpLimitTemp] = useState('75.00');
  const [formPackSize, setFormPackSize] = useState('');
  const [formLossRateWarn, setFormLossRateWarn] = useState('');
  const [formInvItemId, setFormInvItemId] = useState<number | ''>('');
  const [formSaving, setFormSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await prodProductsApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        show_inactive: showInactive || undefined,
      });
      setProducts(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, showInactive]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    invItemsApi.list({ limit: 500 }).then(r => setInvItems(r.items));
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormCcpLimitTemp('75.00');
    setFormPackSize('');
    setFormLossRateWarn('');
    setFormInvItemId('');
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
    setEditingId(null);
  };

  const startEdit = (product: ProdProduct) => {
    setShowForm(true);
    setEditingId(product.id);
    setFormCode(product.code);
    setFormName(product.name);
    setFormCcpLimitTemp(product.ccp_limit_temp ?? '75.00');
    setFormPackSize(product.pack_size_kg != null ? String(product.pack_size_kg) : '');
    setFormLossRateWarn(product.loss_rate_warn_pct != null ? String(product.loss_rate_warn_pct) : '');
    setFormInvItemId(product.inv_item_id ?? '');
  };

  const handleSubmit = async () => {
    if (!formCode || !formName) {
      setError(bi('error.required'));
      return;
    }
    setFormSaving(true);
    setError('');
    try {
      if (editingId) {
        await prodProductsApi.update(editingId, {
          name: formName,
          ccp_limit_temp: formCcpLimitTemp || '75.00',
          pack_size_kg: formPackSize ? Number(formPackSize) : null,
          loss_rate_warn_pct: formLossRateWarn ? Number(formLossRateWarn) : null,
          inv_item_id: formInvItemId || null,
        });
      } else {
        const data: ProdProductCreate = {
          code: formCode,
          name: formName,
          ccp_limit_temp: formCcpLimitTemp || '75.00',
          pack_size_kg: formPackSize ? Number(formPackSize) : null,
          loss_rate_warn_pct: formLossRateWarn ? Number(formLossRateWarn) : null,
          inv_item_id: formInvItemId || null,
        };
        await prodProductsApi.create(data);
      }
      resetForm();
      await fetchProducts();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleActive = async (product: ProdProduct) => {
    try {
      await prodProductsApi.update(product.id, { is_active: !product.is_active });
      await fetchProducts();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.prodProducts.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.prodProducts.subtitle" /></p>
        </div>
        <button
          onClick={startCreate}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <PlusIcon className="h-5 w-5" />
          <span className="hidden sm:inline"><Bi k="btn.newProduct" /></span>
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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

      {error && <ErrorCard message={error} />}

      {/* Inline create/edit form */}
      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {editingId ? <Bi k="section.editProduct" /> : <Bi k="section.newProduct" />}
            </h3>
            <button onClick={resetForm} className="p-1 rounded hover:bg-gray-100">
              <XMarkIcon className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div>
              <label className="label text-xs"><Bi k="field.code" /></label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className="input"
                disabled={!!editingId}
                required
              />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.name" /></label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.ccpLimitTempUnit" /></label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="250"
                value={formCcpLimitTemp}
                onChange={(e) => setFormCcpLimitTemp(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.packSizeKg" /></label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formPackSize}
                onChange={(e) => setFormPackSize(e.target.value)}
                className="input"
                placeholder="—"
              />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.lossRateWarnPct" /></label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formLossRateWarn}
                onChange={(e) => setFormLossRateWarn(e.target.value)}
                className="input"
                placeholder="—"
              />
            </div>
            <div>
              <label className="label text-xs">庫存品項 Inv Item</label>
              <select value={formInvItemId} onChange={(e) => setFormInvItemId(Number(e.target.value) || '')} className="input">
                <option value="">— 未連結 —</option>
                {invItems.map(i => <option key={i.id} value={i.id}>{i.code} {i.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="btn btn-secondary text-sm">
              <Bi k="btn.cancel" />
            </button>
            <button type="button" onClick={handleSubmit} disabled={formSaving} className="btn btn-primary text-sm">
              {formSaving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : products.length === 0 ? (
        <EmptyState
          message={bi('empty.prodProducts')}
          actionLabel={bi('btn.newProduct')}
          actionTo="/production/products"
        />
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4"><Bi k="field.code" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.name" /></th>
                  <th className="pb-2 pr-4"><Bi k="th.ccpLimit" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.packSizeKg" /></th>
                  <th className="pb-2 pr-4"><Bi k="field.lossRateWarnPct" /></th>
                  <th className="pb-2 pr-4">庫存品項</th>
                  <th className="pb-2 pr-4"><Bi k="field.isActive" /></th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((product) => (
                  <tr key={product.id} className={!product.is_active ? 'opacity-50' : ''}>
                    <td className="py-2 pr-4 font-medium text-gray-800">{product.code}</td>
                    <td className="py-2 pr-4 text-gray-700">{product.name}</td>
                    <td className="py-2 pr-4 text-gray-500">{product.ccp_limit_temp}°C</td>
                    <td className="py-2 pr-4 text-gray-500">{product.pack_size_kg ?? '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">{product.loss_rate_warn_pct != null ? `${product.loss_rate_warn_pct}%` : '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {product.inv_item_id
                        ? <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />{invItems.find(i => i.id === product.inv_item_id)?.code ?? `#${product.inv_item_id}`}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => handleToggleActive(product)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          product.is_active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            product.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="py-2">
                      <button onClick={() => startEdit(product)} className="p-1 rounded hover:bg-gray-100">
                        <PencilIcon className="h-4 w-4 text-gray-400" />
                      </button>
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
