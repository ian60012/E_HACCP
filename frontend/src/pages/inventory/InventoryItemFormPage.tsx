import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { invItemsApi, invLocationsApi } from '@/api/inventory';
import { InvLocation } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import FormField from '@/components/FormField';
import Bi, { bi } from '@/components/Bi';

const UNITS = ['PCS', 'KG', 'G', 'L', 'ML', '包', '箱', '袋', '罐', '卷', '打'];

export default function InventoryItemFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const backUrl = searchParams.get('returnTo') || '/inventory/items';
  const isEdit = Boolean(id);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [baseUnit, setBaseUnit] = useState('PCS');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [allowedLocationIds, setAllowedLocationIds] = useState<number[]>([]);

  const [allLocations, setAllLocations] = useState<InvLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    invLocationsApi.list({ is_active: true, limit: 200 }).then((r) => setAllLocations(r.items));
  }, []);

  useEffect(() => {
    if (!isEdit || !id) {
      setLoading(false);
      return;
    }
    invItemsApi.get(Number(id)).then((item) => {
      setCode(item.code);
      setName(item.name);
      setCategory(item.category || '');
      setBaseUnit(item.base_unit);
      setDescription(item.description || '');
      setIsActive(item.is_active);
      setAllowedLocationIds(item.allowed_location_ids ?? []);
      setLoading(false);
    }).catch(() => {
      setError(bi('error.loadFailed'));
      setLoading(false);
    });
  }, [id, isEdit]);

  const toggleLocation = (locId: number) => {
    setAllowedLocationIds((prev) =>
      prev.includes(locId) ? prev.filter((x) => x !== locId) : [...prev, locId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (!isEdit && !code.trim())) return;
    setSaving(true);
    setError('');
    try {
      if (isEdit && id) {
        await invItemsApi.update(Number(id), {
          name, category: category || undefined,
          base_unit: baseUnit,
          description: description || undefined,
          is_active: isActive,
          allowed_location_ids: allowedLocationIds,
        });
      } else {
        await invItemsApi.create({
          code, name, category: category || undefined,
          base_unit: baseUnit,
          description: description || undefined,
          allowed_location_ids: allowedLocationIds,
        });
      }
      navigate(backUrl);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/inventory/items')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {isEdit ? <Bi k="page.invItemEdit.title" /> : <Bi k="page.invItemNew.title" />}
        </h1>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="card space-y-4">
        {!isEdit && (
          <FormField label={<Bi k="field.itemCode" />} required>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input"
              placeholder="e.g. CHK-001"
              required
            />
          </FormField>
        )}
        <FormField label={<Bi k="field.itemName" />} required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            required
          />
        </FormField>
        <FormField label={<Bi k="field.category" />}>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
            placeholder={bi('placeholder.category')}
          />
        </FormField>
        <FormField label={<Bi k="field.baseUnit" />} required>
          <select value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} className="input">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
        <FormField label={<Bi k="field.description" />}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            rows={2}
          />
        </FormField>

        {/* Allowed locations */}
        <FormField label="允許儲位 Allowed Locations">
          {allLocations.length === 0 ? (
            <p className="text-sm text-gray-400">載入儲位中…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allLocations.map((loc) => (
                <label
                  key={loc.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm select-none transition-colors ${
                    allowedLocationIds.includes(loc.id)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={allowedLocationIds.includes(loc.id)}
                    onChange={() => toggleLocation(loc.id)}
                  />
                  <span className="font-mono text-xs">{loc.code}</span>
                  <span>{loc.name}</span>
                </label>
              ))}
            </div>
          )}
          {allowedLocationIds.length === 0 && (
            <p className="text-xs text-red-500 mt-1">⚠ 未設定允許儲位，此品項將無法入/出庫</p>
          )}
        </FormField>

        {isEdit && (
          <FormField label={<Bi k="field.isActive" />}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Bi k="label.active" />
            </label>
          </FormField>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => navigate('/inventory/items')} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
          </button>
        </div>
      </form>
    </div>
  );
}
