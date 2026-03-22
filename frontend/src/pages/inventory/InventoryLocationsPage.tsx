import { useState, useEffect, useCallback } from 'react';
import { PlusIcon } from '@heroicons/react/24/solid';
import { invLocationsApi } from '@/api/inventory';
import { InvLocation, InvLocationCreate } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Bi, { bi } from '@/components/Bi';

export default function InventoryLocationsPage() {
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invLocationsApi.list({ limit: 200, is_active: undefined });
      setLocations(res.items);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setSaving(true);
    setFormError('');
    try {
      const data: InvLocationCreate = { code, name, zone: zone || undefined };
      const created = await invLocationsApi.create(data);
      setLocations((prev) => [...prev, created]);
      setShowForm(false);
      setCode(''); setName(''); setZone('');
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (loc: InvLocation) => {
    try {
      const updated = await invLocationsApi.update(loc.id, { is_active: !loc.is_active });
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? updated : l)));
    } catch {
      setError(bi('error.updateFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="nav.invLocations" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.invLocations.subtitle" /></p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary flex items-center gap-1.5">
          <PlusIcon className="h-5 w-5" />
          <span className="hidden sm:inline"><Bi k="btn.newLocation" /></span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-3">
          <h2 className="font-semibold text-gray-700"><Bi k="page.invLocationNew.title" /></h2>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label"><Bi k="field.locationCode" /></label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label"><Bi k="field.locationName" /></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label"><Bi k="field.zone" /></label>
              <input type="text" value={zone} onChange={(e) => setZone(e.target.value)} className="input" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary"><Bi k="btn.cancel" /></button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchLocations} />
      ) : locations.length === 0 ? (
        <EmptyState message={bi('empty.invLocations')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-4"><Bi k="field.locationCode" /></th>
                <th className="pb-2 pr-4"><Bi k="field.locationName" /></th>
                <th className="pb-2 pr-4"><Bi k="field.zone" /></th>
                <th className="pb-2"><Bi k="field.status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {locations.map((loc) => (
                <tr key={loc.id} className={!loc.is_active ? 'opacity-50' : ''}>
                  <td className="py-2 pr-4 font-mono text-xs">{loc.code}</td>
                  <td className="py-2 pr-4 font-medium text-gray-800">{loc.name}</td>
                  <td className="py-2 pr-4 text-gray-500">{loc.zone || '—'}</td>
                  <td className="py-2">
                    <button
                      onClick={() => handleToggleActive(loc)}
                      className={`text-xs px-2 py-0.5 rounded-full ${loc.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {loc.is_active ? <Bi k="label.active" /> : <Bi k="label.inactive" />}
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
