import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { coolingLogsApi } from '@/api/cooling-logs';
import { CoolingLog, CoolingLogCreate, CoolingLogUpdate } from '@/types/cooling-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import FormField from '@/components/FormField';
import CCPIndicator from '@/components/CCPIndicator';
import Bi, { bi } from '@/components/Bi';

function nowLocalISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CoolingLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEdit);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [existingLog, setExistingLog] = useState<CoolingLog | null>(null);

  // Form fields
  const [batchId, setBatchId] = useState('');
  const [startTime, setStartTime] = useState(nowLocalISO());
  const [startTemp, setStartTemp] = useState('');
  const [stage1Time, setStage1Time] = useState('');
  const [stage1Temp, setStage1Temp] = useState('');
  const [endTime, setEndTime] = useState('');
  const [endTemp, setEndTemp] = useState('');
  const [goesToFreezer, setGoesToFreezer] = useState(false);
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [notes, setNotes] = useState('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch existing log for edit mode
  const fetchLog = useCallback(async () => {
    if (!id) return;
    setFetchLoading(true);
    try {
      const data = await coolingLogsApi.get(Number(id));
      setExistingLog(data);
      setBatchId(data.batch_id);
      setStartTime(data.start_time ? data.start_time.slice(0, 16) : '');
      setStartTemp(data.start_temp);
      setStage1Time(data.stage1_time ? data.stage1_time.slice(0, 16) : '');
      setStage1Temp(data.stage1_temp || '');
      setEndTime(data.end_time ? data.end_time.slice(0, 16) : '');
      setEndTemp(data.end_temp || '');
      setGoesToFreezer(data.goes_to_freezer);
      setCorrectiveAction(data.corrective_action || '');
      setNotes(data.notes || '');
    } catch {
      setError('無法載入記錄');
    } finally {
      setFetchLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isEdit) fetchLog();
  }, [isEdit, fetchLog]);

  // Determine which stage sections to show in edit mode
  const existingHasStage1 = existingLog?.stage1_temp !== null && existingLog?.stage1_temp !== undefined;
  const existingHasEnd = existingLog?.end_temp !== null && existingLog?.end_temp !== undefined;

  // When goes_to_freezer is set, Stage 2 (end) is not needed
  const needsStage2 = !goesToFreezer;

  const showStage1Section = isEdit && !existingHasStage1;
  const showEndSection = isEdit && existingHasStage1 && !existingHasEnd && needsStage2;
  const allStagesComplete = isEdit && existingHasStage1 && (existingHasEnd || !needsStage2);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!isEdit) {
      if (!batchId.trim()) errs.batchId = '請輸入批次編號';
      if (!startTime) errs.startTime = '請選擇起始時間';
      if (!startTemp) errs.startTemp = '請輸入起始溫度';
      else if (isNaN(parseFloat(startTemp))) errs.startTemp = '溫度格式無效';
    }

    // Stage 1 validation: both or neither
    const hasS1Time = Boolean(stage1Time);
    const hasS1Temp = Boolean(stage1Temp);
    if (hasS1Time !== hasS1Temp) {
      if (!hasS1Time) errs.stage1Time = '請同時填寫時間和溫度';
      if (!hasS1Temp) errs.stage1Temp = '請同時填寫時間和溫度';
    }
    if (hasS1Temp && isNaN(parseFloat(stage1Temp))) {
      errs.stage1Temp = '溫度格式無效';
    }

    // End validation: both or neither (only when Stage 2 is needed)
    if (needsStage2) {
      const hasEndTime = Boolean(endTime);
      const hasEndTemp = Boolean(endTemp);
      if (hasEndTime !== hasEndTemp) {
        if (!hasEndTime) errs.endTime = '請同時填寫時間和溫度';
        if (!hasEndTemp) errs.endTemp = '請同時填寫時間和溫度';
      }
      if (hasEndTemp && isNaN(parseFloat(endTemp))) {
        errs.endTemp = '溫度格式無效';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setSubmitError('');

    try {
      if (isEdit && id) {
        const updateData: CoolingLogUpdate = {
          goes_to_freezer: goesToFreezer,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };

        // Only send stage1 fields if they were previously empty and now have values
        if (!existingHasStage1 && stage1Time && stage1Temp) {
          updateData.stage1_time = stage1Time;
          updateData.stage1_temp = stage1Temp;
        }

        // Only send end fields if stage2 is needed, previously empty and now have values
        if (needsStage2 && !existingHasEnd && endTime && endTemp) {
          updateData.end_time = endTime;
          updateData.end_temp = endTemp;
        }

        await coolingLogsApi.update(Number(id), updateData);
        navigate(`/cooling-logs/${id}`);
      } else {
        const createData: CoolingLogCreate = {
          batch_id: batchId.trim(),
          start_time: startTime,
          start_temp: startTemp,
          stage1_time: stage1Time || undefined,
          stage1_temp: stage1Temp || undefined,
          end_time: needsStage2 ? (endTime || undefined) : undefined,
          end_temp: needsStage2 ? (endTemp || undefined) : undefined,
          goes_to_freezer: goesToFreezer,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };
        const created = await coolingLogsApi.create(createData);
        navigate(`/cooling-logs/${created.id}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setSubmitError(typeof msg === 'string' ? msg : '儲存失敗，請重試');
    } finally {
      setLoading(false);
    }
  }

  if (fetchLoading) return <LoadingSpinner fullPage />;
  if (error) return <ErrorCard message={error} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={isEdit ? `/cooling-logs/${id}` : '/cooling-logs'} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? <Bi k="page.cooling.edit" /> : <Bi k="page.cooling.new" />}
          </h1>
          <p className="text-sm text-gray-500">FSP-LOG-005 <Bi k="page.cooling.subtitle" /></p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Start Section - always shown */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.startRecord" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.batchId" />} required error={errors.batchId}>
              <input
                type="text"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                disabled={isEdit}
                className="input"
                placeholder="例：COOL-20240115-001"
              />
            </FormField>

            <FormField label={<Bi k="field.startTime" />} required error={errors.startTime}>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isEdit}
                className="input"
              />
            </FormField>

            <FormField label={<Bi k="field.startTempUnit" />} required error={errors.startTemp}>
              <input
                type="number"
                step="0.01"
                value={startTemp}
                onChange={(e) => setStartTemp(e.target.value)}
                disabled={isEdit}
                className="input"
                placeholder="例：75.00"
              />
            </FormField>
          </div>

          {/* Goes to Freezer toggle */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className={`flex items-start gap-3 cursor-pointer ${allStagesComplete ? 'opacity-70' : ''}`}>
              <input
                type="checkbox"
                checked={goesToFreezer}
                onChange={(e) => setGoesToFreezer(e.target.checked)}
                disabled={allStagesComplete}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  <Bi k="field.goesToFreezer" />
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <Bi k="field.goesToFreezer.hint" />
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Stage 1 Section */}
        <div className={`card ${isEdit && existingHasStage1 ? 'opacity-70' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              <Bi k="section.stage1" />
            </h2>
            {showStage1Section && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
                待記錄
              </span>
            )}
            {isEdit && existingHasStage1 && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                已完成
              </span>
            )}
          </div>

          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <span className="font-medium">CCP 標準：</span> 120分鐘內降至 21°C 以下
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.stage1Time" />} error={errors.stage1Time}>
              <input
                type="datetime-local"
                value={stage1Time}
                onChange={(e) => setStage1Time(e.target.value)}
                disabled={isEdit && existingHasStage1}
                className="input"
              />
            </FormField>

            <FormField label={<Bi k="field.stage1TempUnit" />} error={errors.stage1Temp}>
              <input
                type="number"
                step="0.01"
                value={stage1Temp}
                onChange={(e) => setStage1Temp(e.target.value)}
                disabled={isEdit && existingHasStage1}
                className="input"
                placeholder="目標: ≤ 21.00"
              />
            </FormField>
          </div>

          {stage1Temp && (
            <div className="mt-3">
              <CCPIndicator
                value={stage1Temp}
                limit={21}
                mode="lte"
                label="CCP 第一階段溫度"
              />
            </div>
          )}

          {!isEdit && (
            <p className="text-xs text-gray-400 mt-2">
              可選：可在建立後再回來記錄第一階段
            </p>
          )}
        </div>

        {/* Stage 2 / End Section — only shown when goes_to_freezer is false */}
        {needsStage2 && (
          <div className={`card ${isEdit && existingHasEnd ? 'opacity-70' : ''} ${isEdit && !existingHasStage1 ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                <Bi k="section.endRecord" />
              </h2>
              {showEndSection && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  待記錄
                </span>
              )}
              {isEdit && existingHasEnd && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                  已完成
                </span>
              )}
              {isEdit && !existingHasStage1 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
                  需先完成第一階段
                </span>
              )}
            </div>

            <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <span className="font-medium">CCP 標準：</span> 總計360分鐘內降至 5°C 以下
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label={<Bi k="field.endTime" />} error={errors.endTime}>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={(isEdit && existingHasEnd) || (isEdit && !existingHasStage1)}
                  className="input"
                />
              </FormField>

              <FormField label={<Bi k="field.endTempUnit" />} error={errors.endTemp}>
                <input
                  type="number"
                  step="0.01"
                  value={endTemp}
                  onChange={(e) => setEndTemp(e.target.value)}
                  disabled={(isEdit && existingHasEnd) || (isEdit && !existingHasStage1)}
                  className="input"
                  placeholder="目標: < 5.00"
                />
              </FormField>
            </div>

            {endTemp && (
              <div className="mt-3">
                <CCPIndicator
                  value={endTemp}
                  limit={5}
                  mode="lte"
                  label="CCP 結束溫度"
                />
              </div>
            )}

            {!isEdit && (
              <p className="text-xs text-gray-400 mt-2">
                可選：可在建立後再回來記錄結束
              </p>
            )}
          </div>
        )}

        {/* Freezer note when goes_to_freezer is checked */}
        {!needsStage2 && (
          <div className="card bg-cyan-50 border-cyan-200">
            <div className="flex items-start gap-3">
              <div className="text-2xl">❄️</div>
              <div>
                <p className="text-sm font-medium text-cyan-800">
                  <Bi k="label.freezerMode" />
                </p>
                <p className="text-xs text-cyan-600 mt-1">
                  <Bi k="label.freezerMode.hint" />
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Corrective Action & Notes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.additionalInfo" /></h2>
          <div className="space-y-4">
            <FormField label={<Bi k="field.correctiveAction" />}>
              <textarea
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                className="input"
                rows={3}
                placeholder="例：溫度超標，已將食品移至急速冷凍設備..."
              />
            </FormField>

            <FormField label={<Bi k="field.notes" />}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={2}
                placeholder="其他備註..."
              />
            </FormField>
          </div>
        </div>

        {/* Submit */}
        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 sm:flex-none">
            {loading ? <Bi k="btn.saving" /> : isEdit ? <Bi k="btn.updateRecord" /> : <Bi k="btn.createRecord" />}
          </button>
          <Link to={isEdit ? `/cooling-logs/${id}` : '/cooling-logs'} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </Link>
        </div>
      </form>
    </div>
  );
}
