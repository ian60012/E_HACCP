import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { PencilIcon } from '@heroicons/react/24/outline';
import { packTypesApi } from '@/api/production';
import { PackTypeConfig, PackTypeConfigCreate, PackApplicableType } from '@/types/production';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Bi, { bi } from '@/components/Bi';

const applicableTypeOptions: { value: PackApplicableType; labelKey: string }[] = [
  { value: 'forming',     labelKey: 'label.applicableForming' },
  { value: 'hot_process', labelKey: 'label.applicableHotProcess' },
  { value: 'both',        labelKey: 'label.applicableBoth' },
];

const applicableTypeBadge: Record<string, string> = {
  forming:     'bg-blue-100 text-blue-700',
  hot_process: 'bg-red-100 text-red-700',
  both:        'bg-gray-100 text-gray-700',
};

export default function ProdPackTypesPage() {
  const [packTypes, setPackTypes] = useState<PackTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formApplicableType, setFormApplicableType] = useState<PackApplicableType>('both');
  const [formNominalWeight, setFormNominalWeight] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const fetchPackTypes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await packTypesApi.list({ show_inactive: showInactive || undefined });
      setPackTypes(items);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { fetchPackTypes(); }, [fetchPackTypes]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormApplicableType('both');
    setFormNominalWeight('');
  };

  const startCreate = () => { resetForm(); setShowForm(true); };

  const startEdit = (pt: PackTypeConfig) => {
    setShowForm(true);
    setEditingId(pt.id);
    setFormCode(pt.code);
    setFormName(pt.name);
    setFormApplicableType(pt.applicable_type);
    setFormNominalWeight(pt.nominal_weight_kg != null ? String(pt.nominal_weight_kg) : '');
  };

  const handleSubmit = async () => {
    if (!formCode || !formName) { setError(bi('error.required')); return; }
    setFormSaving(true);
    setError('');
    try {
      if (editingId) {
        await packTypesApi.update(editingId, {
          name: formName,
          applicable_type: formApplicableType,
          nominal_weight_kg: formNominalWeight ? Number(formNominalWeight) : null,
        });
      } else {
        const data: PackTypeConfigCreate = {
          code: formCode,
          name: formName,
          applicable_type: formApplicableType,
          nominal_weight_kg: formNominalWeight ? Number(formNominalWeight) : null,
        };
        await packTypesApi.create(data);
      }
      resetForm();
      await fetchPackTypes();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleActive = async (pt: PackTypeConfig) => {
    try {
      await packTypesApi.update(pt.id, { is_active: !pt.is_active });
      await fetchPackTypes();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.packTypes.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.packTypes.subtitle" /></p>
        </div>
        <button onClick={startCreate} className="btn btn-primary flex items-center gap-1.5">
          <PlusIcon className="h-5 w-5" />
          <span className="hidden sm:inline"><Bi k="btn.newPackType" /></span>
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

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {editingId ? <Bi k="section.editPackType" /> : <Bi k="section.newPackType" />}
            </h3>
            <button onClick={resetForm} className="p-1 rounded hover:bg-gray-100">
              <XMarkIcon className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="label text-xs"><Bi k="field.code" /></label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
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
              <label className="label text-xs"><Bi k="field.applicableType" /></label>
              <select
                value={formApplicableType}
                onChange={(e) => setFormApplicableType(e.target.value as PackApplicableType)}
                className="input"
              >
                {applicableTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{bi(o.labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.packSizeKg" /></label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={formNominalWeight}
                onChange={(e) => setFormNominalWeight(e.target.value)}
                className="input"
                placeholder="—"
              />
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
      ) : packTypes.length === 0 ? (
        <EmptyState message={bi('empty.packTypes')} actionLabel={bi('btn.newPackType')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-4"><Bi k="field.code" /></th>
                <th className="pb-2 pr-4"><Bi k="field.name" /></th>
                <th className="pb-2 pr-4"><Bi k="field.applicableType" /></th>
                <th className="pb-2 pr-4"><Bi k="field.packSizeKg" /></th>
                <th className="pb-2 pr-4"><Bi k="field.isActive" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {packTypes.map((pt) => (
                <tr key={pt.id} className={!pt.is_active ? 'opacity-50' : ''}>
                  <td className="py-2 pr-4 font-medium text-gray-800 font-mono">{pt.code}</td>
                  <td className="py-2 pr-4 text-gray-700">{pt.name}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${applicableTypeBadge[pt.applicable_type] || ''}`}>
                      {bi(`label.applicable${pt.applicable_type === 'forming' ? 'Forming' : pt.applicable_type === 'hot_process' ? 'HotProcess' : 'Both'}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {pt.nominal_weight_kg != null ? `${pt.nominal_weight_kg} kg` : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => handleToggleActive(pt)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${pt.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${pt.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="py-2">
                    <button onClick={() => startEdit(pt)} className="p-1 rounded hover:bg-gray-100">
                      <PencilIcon className="h-4 w-4 text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
