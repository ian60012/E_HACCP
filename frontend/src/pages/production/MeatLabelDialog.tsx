import { useEffect, useRef, useState } from 'react';
import { meatApi, meatError } from '@/api/meatProcessing';
import { MeatRecord, meatStates } from '@/types/meatProcessing';
import { ProdBatch } from '@/types/production';
import { nowMelbourne } from '@/utils/timezone';

export default function MeatLabelDialog({ batch, record, onClose }: {
  batch: ProdBatch; record: MeatRecord; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const output = record.outputs[index];
  const [weight, setWeight] = useState(output.weight_kg);
  const [count, setCount] = useState(output.pack_count?.toString() || '');
  const [date, setDate] = useState(nowMelbourne().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);

  async function download(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const blob = await meatApi.downloadLabel(batch.id, {
        version: record.version, output_index: index, net_weight_kg: weight,
        pack_count: count ? Number(count) : null, packing_date: date,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${batch.batch_code}-output-${index + 1}-meat-label.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      if (e?.response?.data instanceof Blob) {
        try { setError(meatError({ response: { data: JSON.parse(await e.response.data.text()) } })); }
        catch { setError('標籤產生失敗 Label generation failed'); }
      } else setError(meatError(e));
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby="meat-label-title"
    className="w-[calc(100%_-_2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl p-5 shadow-xl backdrop:bg-black/40"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={download} className="space-y-4">
      <h2 id="meat-label-title" className="text-lg font-semibold text-violet-800">肉品箱貼 PDF Meat carton label</h2>
      <p className="text-sm break-all">批號 Batch / Lot: {batch.batch_code} · v{record.version}</p>
      <label className="block text-sm">產出品項 Output item
        <select className="input mt-1" value={index} disabled={busy} onChange={e => {
          const next = Number(e.target.value); const row = record.outputs[next];
          setIndex(next); setWeight(row.weight_kg); setCount(row.pack_count?.toString() || ''); setError('');
        }}>{record.outputs.map((row, i) => <option key={i} value={i}>{i + 1}. {row.item_name} · {row.location_name} · {row.weight_kg} kg</option>)}</select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">本箱實際淨重 Net kg
          <input className="input mt-1" type="number" min="0.001" max={output.weight_kg} step="0.001" value={weight}
            required disabled={busy} onChange={e => setWeight(e.target.value)} />
        </label>
        <label className="block text-sm">本箱包數（選填）Packs / carton
          <input className="input mt-1" type="number" min="1" max={output.pack_count || undefined} step="1" value={count}
            disabled={busy} onChange={e => setCount(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-gray-600">預設為此列產出總重；分箱時請輸入本箱實際淨重與包數。 For split cartons, enter the measured weight and pack count for this carton.</p>
      <label className="block text-sm">包裝日期 Packing date
        <input className="input mt-1" type="date" value={date} required disabled={busy} onChange={e => setDate(e.target.value)} />
      </label>
      <p className="text-sm">包裝 Pack: {output.pack_type || '未指定 Not specified'} · {meatStates[record.state]}</p>
      {['draft', 'submitted'].includes(record.state) && <p className="text-sm text-amber-800">尚未 QA 覆核；標籤會註明此狀態。 The label will show that QA verification is pending.</p>}
      <p className="text-xs text-gray-600">下載後開啟 PDF，以 100 × 75 mm、實際尺寸（100%）列印。 Open the PDF and print at actual size (100%).</p>
      {error && <p role="alert" className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>關閉 Close</button>
        <button type="submit" className="btn bg-violet-600 text-white hover:bg-violet-700" disabled={busy}>{busy ? '產生中 Generating…' : '下載標籤 PDF Download label'}</button>
      </div>
    </form>
  </dialog>;
}
