import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { invDocsApi, invItemsApi, invLocationsApi } from '@/api/inventory';
import { InvItem, InvLocation, InvDocType, InvStockLineCreate } from '@/types/inventory';
import FormField from '@/components/FormField';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';

interface LineRow {
  item_id: number | '';
  location_id: number | '';
  quantity: string;
  unit: string;
  unit_cost: string;
  notes: string;
}

export default function InventoryStockDocFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultType = (searchParams.get('type') as InvDocType) || 'IN';

  const [docType, setDocType] = useState<InvDocType>(defaultType);
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([
    { item_id: '', location_id: '', quantity: '', unit: 'PCS', unit_cost: '', notes: '' },
  ]);

  const [items, setItems] = useState<InvItem[]>([]);
  const [allLocations, setAllLocations] = useState<InvLocation[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    invItemsApi.list({ limit: 500 }).then((r) => setItems(r.items));
    invLocationsApi.list({ limit: 200 }).then((r) => setAllLocations(r.items));
  }, []);

  const getAllowedLocations = (itemId: number | ''): InvLocation[] => {
    if (!itemId) return allLocations;
    const item = items.find((i) => i.id === itemId);
    if (!item || !item.allowed_location_ids?.length) return [];
    return allLocations.filter((loc) => item.allowed_location_ids.includes(loc.id));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { item_id: '', location_id: '', quantity: '', unit: 'PCS', unit_cost: '', notes: '' }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof LineRow, value: string | number) => {
    setLines((prev) => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const handleItemChange = (index: number, itemId: number) => {
    const item = items.find((i) => i.id === itemId);
    const allowed = item?.allowed_location_ids?.length
      ? allLocations.filter((loc) => item.allowed_location_ids.includes(loc.id))
      : [];
    const firstAllowedId = allowed[0]?.id ?? '';
    setLines((prev) => prev.map((l, i) =>
      i === index
        ? { ...l, item_id: itemId, unit: item?.base_unit || 'PCS', location_id: firstAllowedId }
        : l
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.item_id !== '' && l.quantity !== '' && l.location_id !== '');
    if (validLines.length === 0) {
      setError(bi('error.noLines'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const docLines: InvStockLineCreate[] = validLines.map((l) => ({
        item_id: l.item_id as number,
        location_id: l.location_id as number,
        quantity: l.quantity,
        unit: l.unit,
        unit_cost: l.unit_cost || undefined,
        notes: l.notes || undefined,
      }));
      const doc = await invDocsApi.create({
        doc_type: docType,
        ref_number: refNumber || undefined,
        notes: notes || undefined,
        lines: docLines,
      });
      navigate(`/inventory/docs/${doc.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/inventory/docs')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.invDocNew.title" /></h1>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.docHeader" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.docType" />} required>
              <select value={docType} onChange={(e) => setDocType(e.target.value as InvDocType)} className="input">
                <option value="IN"><Bi k="label.stockIn" /></option>
                <option value="OUT"><Bi k="label.stockOut" /></option>
              </select>
            </FormField>
            <FormField label={<Bi k="field.refNumber" />}>
              <input type="text" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} className="input" />
            </FormField>
            <FormField label={<Bi k="field.notes" />}>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
            </FormField>
          </div>
        </div>

        {/* Lines */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.docLines" /></h2>
            <button type="button" onClick={addLine} className="btn btn-secondary text-sm flex items-center gap-1">
              <PlusIcon className="h-4 w-4" /><Bi k="btn.addLine" />
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => {
              const allowedLocs = getAllowedLocations(line.item_id);
              return (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  {/* Item */}
                  <div className="col-span-4">
                    {index === 0 && <label className="label text-xs"><Bi k="field.item" /></label>}
                    <select
                      value={line.item_id}
                      onChange={(e) => handleItemChange(index, Number(e.target.value))}
                      className="input"
                      required
                    >
                      <option value=""><Bi k="placeholder.selectItem" /></option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
                      ))}
                    </select>
                  </div>
                  {/* Location */}
                  <div className="col-span-3">
                    {index === 0 && <label className="label text-xs"><Bi k="field.location" /></label>}
                    <select
                      value={line.location_id}
                      onChange={(e) => updateLine(index, 'location_id', Number(e.target.value) || '')}
                      className={`input ${line.item_id && allowedLocs.length === 0 ? 'border-red-300' : ''}`}
                      required
                      disabled={!!line.item_id && allowedLocs.length === 0}
                    >
                      <option value="">
                        {line.item_id && allowedLocs.length === 0 ? '未設定允許儲位' : bi('placeholder.selectLocation')}
                      </option>
                      {allowedLocs.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Quantity */}
                  <div className="col-span-2">
                    {index === 0 && <label className="label text-xs"><Bi k="field.quantity" /></label>}
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                  {/* Unit */}
                  <div className="col-span-2">
                    {index === 0 && <label className="label text-xs"><Bi k="field.unit" /></label>}
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => updateLine(index, 'unit', e.target.value)}
                      className="input"
                    />
                  </div>
                  {/* Remove */}
                  <div className="col-span-1">
                    {index === 0 && <div className="h-5" />}
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="btn btn-secondary p-2"
                    >
                      <TrashIcon className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/inventory/docs')} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Bi k="btn.saving" /> : <Bi k="btn.saveDraft" />}
          </button>
        </div>
      </form>
    </div>
  );
}
