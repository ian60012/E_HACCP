import { useState, useEffect, useCallback, useRef } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { PencilIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { suppliersApi } from '@/api/suppliers';
import { Supplier } from '@/types/supplier';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import FormField from '@/components/FormField';
import RoleGate from '@/components/RoleGate';
import Bi, { bi } from '@/components/Bi';

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: { row: number; code: string; message: string }[] } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await suppliersApi.list(0, 200);
      setItems(res.items);
    } catch { setError(bi('error.loadFailed')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => {
    setEditingItem(null);
    setName(''); setContactName(''); setPhone(''); setEmail(''); setAddress('');
    setFormError(''); setShowForm(true);
  };

  const openEdit = (item: Supplier) => {
    setEditingItem(item);
    setName(item.name);
    setContactName(item.contact_name || '');
    setPhone(item.phone || '');
    setEmail(item.email || '');
    setAddress(item.address || '');
    setFormError(''); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setSubmitting(true);
    try {
      const payload = {
        name,
        contact_name: contactName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      };
      if (editingItem) {
        await suppliersApi.update(editingItem.id, payload);
      } else {
        await suppliersApi.create(payload);
      }
      setShowForm(false); fetchItems();
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || bi('error.saveFailed'));
    } finally { setSubmitting(false); }
  };

  const toggleActive = async (item: Supplier) => {
    try {
      await suppliersApi.update(item.id, { is_active: !item.is_active });
      fetchItems();
    } catch { /* ignore */ }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await suppliersApi.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'suppliers_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('下載模板失敗');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const result = await suppliersApi.importSuppliers(file);
      setImportResult(result);
      await fetchItems();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '匯入失敗');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !items.length) return <ErrorCard message={error} onRetry={fetchItems} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.suppliers.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.suppliers.subtitle" /></p>
        </div>
        <RoleGate roles={['Admin', 'QA']}>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadTemplate} className="btn btn-secondary flex items-center gap-1.5 text-sm">
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span className="hidden sm:inline">下載模板</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn btn-secondary flex items-center gap-1.5 text-sm">
              <ArrowUpTrayIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{importing ? '匯入中…' : '批量匯入'}</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <button onClick={openCreate} className="btn btn-primary flex items-center gap-1.5">
              <PlusIcon className="h-5 w-5" /><Bi k="btn.newSupplier" />
            </button>
          </div>
        </RoleGate>
      </div>

      {error && <div className="p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}

      {importResult && (
        <div className={`rounded-lg border p-3 text-sm ${importResult.errors.length > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">
              匯入完成：新增 {importResult.created} 筆，略過 {importResult.skipped} 筆
            </span>
            <button onClick={() => setImportResult(null)} className="p-1 rounded hover:bg-white/60">
              <XMarkIcon className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-yellow-800">
              {importResult.errors.map((e, idx) => (
                <li key={idx}>列 {e.row}（{e.code}）：{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Filter tabs */}
      {(() => {
        const activeCt = items.filter((i) => i.is_active).length;
        const inactiveCt = items.length - activeCt;
        const filteredItems = items.filter((item) => {
          if (filter === 'active') return item.is_active;
          if (filter === 'inactive') return !item.is_active;
          return true;
        });
        return (
          <>
            <div className="flex items-center gap-2">
              {([
                { key: 'active' as const, label: `${bi('filter.active')} (${activeCt})` },
                { key: 'inactive' as const, label: `${bi('filter.inactive')} (${inactiveCt})` },
                { key: 'all' as const, label: `${bi('filter.all')} (${items.length})` },
              ]).map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === f.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {filteredItems.length === 0 ? <EmptyState message={bi('empty.suppliers')} /> : (
              <div className="card overflow-hidden p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.name" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.contact" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.phone" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.email" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.status" /></th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600"><Bi k="th.actions" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredItems.map((item) => (
                <tr key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{item.contact_name || '-'}</td>
                  <td className="px-4 py-3">{item.phone || '-'}</td>
                  <td className="px-4 py-3">{item.email || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(item)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {item.is_active ? <Bi k="status.active" /> : <Bi k="status.inactive" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RoleGate roles={['Admin', 'QA']}>
                      <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <PencilIcon className="h-4 w-4 text-gray-500" />
                      </button>
                    </RoleGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
          </>
        );
      })()}

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">{editingItem ? <Bi k="misc.editSupplier" /> : <Bi k="misc.newSupplier" />}</h3>
              {formError && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{formError}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label={bi('field.supplierName')} required>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" required maxLength={200} />
                </FormField>
                <FormField label={bi('field.contactName')}>
                  <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className="input" />
                </FormField>
                <FormField label={bi('field.phone')}>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
                </FormField>
                <FormField label={bi('field.email')}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
                </FormField>
                <FormField label={bi('field.address')}>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="input" rows={3} />
                </FormField>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary"><Bi k="btn.cancel" /></button>
                  <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
