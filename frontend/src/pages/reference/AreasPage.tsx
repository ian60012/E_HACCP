import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { areasApi } from '@/api/areas';
import { Area } from '@/types/area';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import FormField from '@/components/FormField';
import RoleGate from '@/components/RoleGate';
import Bi, { bi } from '@/components/Bi';

export default function AreasPage() {
  const [items, setItems] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Area | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await areasApi.list(0, 200);
      setItems(res.items);
    } catch { setError(bi('error.loadFailed')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => {
    setEditingItem(null);
    setName(''); setDescription('');
    setFormError(''); setShowForm(true);
  };

  const openEdit = (item: Area) => {
    setEditingItem(item);
    setName(item.name);
    setDescription(item.description || '');
    setFormError(''); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setSubmitting(true);
    try {
      const payload = {
        name,
        description: description || undefined,
      };
      if (editingItem) {
        await areasApi.update(editingItem.id, payload);
      } else {
        await areasApi.create(payload);
      }
      setShowForm(false); fetchItems();
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || bi('error.saveFailed'));
    } finally { setSubmitting(false); }
  };

  const toggleActive = async (item: Area) => {
    try {
      await areasApi.update(item.id, { is_active: !item.is_active });
      fetchItems();
    } catch { /* ignore */ }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error) return <ErrorCard message={error} onRetry={fetchItems} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.areas.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.areas.subtitle" /></p>
        </div>
        <RoleGate roles={['QA', 'Manager']}>
          <button onClick={openCreate} className="btn btn-primary flex items-center gap-1.5">
            <PlusIcon className="h-5 w-5" /><Bi k="btn.newArea" />
          </button>
        </RoleGate>
      </div>

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

            {filteredItems.length === 0 ? <EmptyState message={bi('empty.areas')} /> : (
              <div className="card overflow-hidden p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.name" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.description" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.status" /></th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600"><Bi k="th.actions" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredItems.map((item) => (
                <tr key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{item.description || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(item)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {item.is_active ? <Bi k="status.active" /> : <Bi k="status.inactive" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RoleGate roles={['QA', 'Manager']}>
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
              <h3 className="text-lg font-semibold mb-4">{editingItem ? <Bi k="misc.editArea" /> : <Bi k="misc.newArea" />}</h3>
              {formError && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{formError}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label={bi('field.areaName')} required>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" required maxLength={100} />
                </FormField>
                <FormField label={bi('field.description')}>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={3} />
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
