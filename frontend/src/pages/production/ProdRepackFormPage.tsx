import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { prodRepackApi } from '@/api/production';
import FormField from '@/components/FormField';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProdRepackFormPage() {
  const navigate = useNavigate();

  const [date, setDate] = useState(todayStr());
  const [operator, setOperator] = useState('');
  const [remark, setRemark] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const job = await prodRepackApi.create({
        date,
        operator: operator || undefined,
        remark: remark || undefined,
      });
      navigate(`/production/repack/${job.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/repack')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.prodRepackNew.title" /></h1>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.date" />} required>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                required
              />
            </FormField>
            <FormField label={<Bi k="field.operator" />}>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="input"
                placeholder={bi('placeholder.operator')}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label={<Bi k="field.remark" />}>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder={bi('placeholder.remark')}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/production/repack')} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Bi k="btn.saving" /> : <Bi k="btn.create" />}
          </button>
        </div>
      </form>
    </div>
  );
}
