import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircleIcon, ExclamationTriangleIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { cleaningChecklistsApi } from '@/api/cleaning-checklists';
import {
  CleaningChecklistItem,
  CleaningCheckResult,
  CleaningLineType,
} from '@/types/cleaning-checklist';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Bi from '@/components/Bi';

const resultOptions: { value: CleaningCheckResult; zh: string; en: string; icon: typeof CheckCircleIcon; selected: string }[] = [
  { value: 'clean', zh: '完成／清潔／正常', en: 'Finished / Cleaned / OK', icon: CheckCircleIcon, selected: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { value: 'needs_cleaning', zh: '未完成／需清潔', en: 'Unfinished / Needs Cleaning', icon: ExclamationTriangleIcon, selected: 'border-amber-500 bg-amber-50 text-amber-700' },
  { value: 'damaged_faulty', zh: '損壞／故障', en: 'Damaged / Faulty', icon: WrenchScrewdriverIcon, selected: 'border-red-500 bg-red-50 text-red-700' },
];

function localToday(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function CleaningChecklistFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const requestedLine = searchParams.get('line') === 'cooking' ? 'cooking' : 'dumpling';
  const [lineType, setLineType] = useState<CleaningLineType>(requestedLine);
  const [checkDate, setCheckDate] = useState(localToday());
  const [items, setItems] = useState<CleaningChecklistItem[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (isEdit) {
          const record = await cleaningChecklistsApi.get(Number(id));
          if (!active) return;
          if (record.is_locked || record.is_voided) {
            navigate(`/cleaning-checklists/${record.id}`, { replace: true });
            return;
          }
          setLineType(record.line_type);
          setCheckDate(record.check_date);
          setItems(record.items);
          setNotes(record.notes || '');
        } else {
          const template = await cleaningChecklistsApi.getTemplate(lineType);
          if (!active) return;
          setItems(template.items);
        }
      } catch {
        if (active) setError('載入清潔查核表失敗 Failed to load cleaning checklist');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [id, isEdit, lineType, navigate]);

  const groups = useMemo(() => {
    const grouped = new Map<string, CleaningChecklistItem[]>();
    items.forEach((item) => {
      const key = `${item.section_code}|${item.section_name_zh}|${item.section_name_en}`;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    return [...grouped.entries()];
  }, [items]);
  const completed = items.filter((item) => item.result !== null).length;

  const setResult = (index: number, result: CleaningCheckResult) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, result } : item));
  };

  const setComments = (index: number, comments: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, comments: comments || null } : item));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (items.some((item) => item.result === null)) {
      setError(`請完成所有查核項目 Complete all items (${completed}/${items.length})`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { check_date: checkDate, line_type: lineType, items, notes: notes.trim() || null };
      const record = isEdit
        ? await cleaningChecklistsApi.update(Number(id), payload)
        : await cleaningChecklistsApi.create(payload);
      navigate(`/cleaning-checklists/${record.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || '儲存失敗 Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error && items.length === 0) return <ErrorCard message={error} />;

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => navigate(isEdit ? `/cleaning-checklists/${id}` : '/cleaning-checklists')} className="rounded-lg p-2 hover:bg-gray-100" aria-label="返回 Back">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{isEdit ? '編輯清潔查核 Edit Cleaning Checklist' : '新增清潔查核 New Cleaning Checklist'}</h1>
          <p className="mt-1 text-sm text-gray-500">{lineType === 'dumpling' ? 'FSP-LOG-CLN-003 水餃線 Dumpling Line' : 'FSP-LOG-CLN-005 烹飪線 Cooking Line'}</p>
        </div>
      </div>

      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label>
          <span className="label">產線 Line *</span>
          <select className="input" value={lineType} disabled={isEdit} onChange={(event) => setLineType(event.target.value as CleaningLineType)}>
            <option value="dumpling">水餃線 Dumpling Line</option>
            <option value="cooking">烹飪線 Cooking Line</option>
          </select>
        </label>
        <label>
          <span className="label">查核日期 Check date *</span>
          <input type="date" required className="input" value={checkDate} onChange={(event) => setCheckDate(event.target.value)} />
        </label>
        <div className="rounded-lg bg-sky-50 p-4">
          <p className="text-xs font-medium text-sky-700">查核進度 Progress</p>
          <p className="mt-1 text-2xl font-bold text-sky-800">{completed}/{items.length}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
            <div className="h-full bg-sky-600 transition-all" style={{ width: `${items.length ? (completed / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {groups.map(([key, groupItems]) => {
        const [sectionCode, sectionZh, sectionEn] = key.split('|');
        return (
          <section key={key} className="card overflow-hidden p-0">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
              <h2 className="font-semibold text-gray-800">{sectionCode} {sectionZh} <span className="ml-1 text-sm font-normal text-gray-400">{sectionEn}</span></h2>
            </div>
            <div className="divide-y divide-gray-100">
              {groupItems.map((item) => {
                const index = items.findIndex((candidate) => candidate.code === item.code);
                return (
                  <div key={item.code} className="space-y-3 px-5 py-4">
                    <div>
                      <p className="font-medium text-gray-800">{item.code} {item.item_name_zh}</p>
                      <p className="text-sm text-gray-400">{item.item_name_en}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3" role="radiogroup" aria-label={`${item.item_name_zh} ${item.item_name_en}`}>
                      {resultOptions.map((option) => {
                        const selected = item.result === option.value;
                        return (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            key={option.value}
                            onClick={() => setResult(index, option.value)}
                            className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selected ? option.selected : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                          >
                            <option.icon className="h-5 w-5 shrink-0" />
                            <span><span className="block font-medium">{option.zh}</span><span className="block text-xs opacity-70">{option.en}</span></span>
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      maxLength={1000}
                      className="input"
                      value={item.comments || ''}
                      onChange={(event) => setComments(index, event.target.value)}
                      placeholder="備註 Comments"
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="card">
        <label>
          <span className="label">整體備註 General notes</span>
          <textarea className="input min-h-24" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-5">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(isEdit ? `/cleaning-checklists/${id}` : '/cleaning-checklists')}>取消 Cancel</button>
        <button type="submit" disabled={saving} className="btn btn-primary min-w-28">{saving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}</button>
      </div>
    </form>
  );
}
