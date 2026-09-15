import { useEffect, useRef, useState } from 'react';
import { labelmakerApi, LabelTemplate } from '@/api/labelmaker';
import { meatError } from '@/api/meatProcessing';
import { MeatRecord } from '@/types/meatProcessing';
import { ProdBatch } from '@/types/production';

export default function MeatFinishedLabelDialog({ batch, record, onClose }: {
  batch: ProdBatch; record: MeatRecord; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const output = record.outputs[index];
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = templates.find(t => t.id === templateId);
  const expiry = template ? new Date(`${batch.production_date}T00:00:00Z`) : null;
  if (expiry && template) expiry.setUTCDate(expiry.getUTCDate() + template.shelf_life_days);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setTemplates([]); setTemplateId(''); setError('');
    labelmakerApi.listTemplates({ inv_item_id: output.inv_item_id }).then(result => {
      if (!active) return;
      setTemplates(result);
      const matching = result.filter(t => t.pack_type_code === output.pack_type);
      setTemplateId(matching.length === 1 ? matching[0].id : result.length === 1 ? result[0].id : '');
    }).catch(e => { if (active) setError(meatError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [output.inv_item_id, output.pack_type]);

  async function download(e: React.FormEvent) {
    e.preventDefault();
    if (!template || loading) return;
    setBusy(true); setError('');
    try {
      const blob = await labelmakerApi.renderPdf({ template_id: template.id, production_date: batch.production_date });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${batch.batch_code}-output-${index + 1}-finished-label.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      if (e?.response?.data instanceof Blob) {
        try { setError(meatError({ response: { data: JSON.parse(await e.response.data.text()) } })); }
        catch { setError('成品標籤產生失敗 Finished label generation failed'); }
      } else setError(meatError(e));
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby="meat-finished-label-title"
    className="w-[calc(100%_-_2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl p-5 shadow-xl backdrop:bg-black/40"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={download} className="space-y-4">
      <h2 id="meat-finished-label-title" className="text-lg font-semibold text-violet-800">成品標籤 Finished label · Label Maker</h2>
      <p className="text-sm break-all">批次 Batch: {batch.batch_code}</p>
      <label className="block text-sm">產出品項 Output item
        <select className="input mt-1" value={index} disabled={busy} onChange={e => {
          const next = Number(e.target.value); const row = record.outputs[next];
          if (row.inv_item_id !== output.inv_item_id || row.pack_type !== output.pack_type) {
            setLoading(true); setTemplates([]); setTemplateId(''); setError('');
          }
          setIndex(next);
        }}>
          {record.outputs.map((row, i) => <option key={i} value={i}>{i + 1}. {row.item_name} · {row.location_name}</option>)}
        </select>
      </label>
      {loading ? <p role="status">載入標籤 Loading labels…</p> : templates.length ? <>
        <label className="block text-sm">已儲存標籤 Saved label
          <select className="input mt-1" required value={templateId} disabled={busy} onChange={e => { setTemplateId(Number(e.target.value) || ''); setError(''); }}>
            <option value="">請選擇 Select</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.product_name_zh || t.product_name_en} · {t.pack_type_name || t.pack_type_code} · {t.net_weight_g} g</option>)}
          </select>
        </label>
        {template && <div className="rounded-lg bg-violet-50 p-3 text-sm space-y-1">
          <p>{template.product_name_zh} · {template.product_name_en}</p>
          <p>每包標示淨重 Net weight / pack: {template.net_weight_g} g</p>
          <p>生產日期 Production date: {batch.production_date}</p>
          <p>到期日期 Expiry date: {expiry?.toISOString().slice(0, 10)}</p>
          <p className="whitespace-pre-wrap">{template.storage_conditions}</p>
        </div>}
        <p className="text-xs text-gray-600">沿用 Label Maker 已儲存的配料、營養與包裝淨重；請確認本次包裝規格相符。 Uses the saved ingredients, nutrition and pack weight; confirm the pack specification.</p>
      </> : !error && <p role="status" className="text-sm">此產出品項尚無已連結的 Label Maker 標籤。請先在產品管理設定庫存連結，再於 Label Maker 儲存該產品標籤。 No linked label found; link the product to this inventory item and save its label in Label Maker.</p>}
      <p className="text-xs text-gray-600">下載後開啟 PDF，以實際尺寸（100%）列印。 Open the PDF and print at actual size (100%).</p>
      {error && <p role="alert" className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>關閉 Close</button>
        <button type="submit" className="btn bg-violet-600 text-white hover:bg-violet-700" disabled={busy || loading || !template}>{busy ? '產生中 Generating…' : '下載成品標籤 PDF Download finished label'}</button>
      </div>
    </form>
  </dialog>;
}
