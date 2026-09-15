import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { prodBatchesApi, prodProductsApi } from '@/api/production';
import { meatError } from '@/api/meatProcessing';
import { ProdBatch, ProdProduct } from '@/types/production';
import { meatStates, MeatState } from '@/types/meatProcessing';
import RoleGate from '@/components/RoleGate';

export default function MeatBatchListPage() {
  const [batches, setBatches] = useState<ProdBatch[]>([]);
  const [products, setProducts] = useState<ProdProduct[]>([]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [product, setProduct] = useState(''); const [state, setState] = useState('');
  const [voided, setVoided] = useState(false); const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { prodProductsApi.list({ limit: 1000, show_inactive: true, product_type: 'meat_processing' }).then(r => setProducts(r.items)).catch(e => setError(meatError(e))); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    prodBatchesApi.list({ product_type: 'meat_processing', date_from: from || undefined, date_to: to || undefined,
      product_code: product || undefined, meat_state: state || undefined, include_voided: voided, skip: page * 50, limit: 50 })
      .then(r => { if (active) { setBatches(r.items); setTotal(r.total); } })
      .catch(e => { if (active) setError(meatError(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, product, state, voided, page]);
  function filter(fn: (v: string) => void, value: string) { fn(value); setPage(0); }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-violet-800">肉品加工 Meat Processing</h1>
      <RoleGate roles={['Admin', 'Production']}><Link className="btn bg-violet-600 text-white hover:bg-violet-700" to="/production/batches/new?type=meat_processing">新增批次 New batch</Link></RoleGate></div>
    <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label>開始日期 From<input className="input" type="date" value={from} onChange={e => filter(setFrom, e.target.value)} /></label>
      <label>結束日期 To<input className="input" type="date" value={to} onChange={e => filter(setTo, e.target.value)} /></label>
      <label>產品 Product<select className="input" value={product} onChange={e => filter(setProduct, e.target.value)}><option value="">全部 All</option>{products.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}</select></label>
      <label>狀態 Status<select className="input" value={state} onChange={e => filter(setState, e.target.value)}><option value="">全部 All</option>{Object.entries(meatStates).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label><input type="checkbox" checked={voided} onChange={e => { setVoided(e.target.checked); setPage(0); }} /> 顯示作廢 Include voided</label>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">載入中 Loading…</p> : <div className="grid gap-3 lg:grid-cols-2">
      {batches.map(b => <Link key={b.id} to={`/production/meat/${b.id}`} className="card block border border-l-4 border-l-violet-500 hover:border-violet-400 hover:bg-violet-50/40">
        <div className="flex justify-between gap-3"><strong className="min-w-0 break-all">{b.batch_code}</strong><span>{b.is_voided ? '已作廢 Voided' : meatStates[(b.meat_state || 'draft') as MeatState]}</span></div>
        <p>{b.product_name} · {b.production_date}</p><div className="mt-3 flex flex-wrap gap-4 text-sm">
          <span>投入 Input: {b.meat_totals?.input_kg ?? '—'} kg</span><span>產出 Output: {b.meat_totals?.output_kg ?? '—'} kg</span>
          <span>產出率 Yield: {b.meat_totals?.yield_pct ?? '—'}%</span></div>
      </Link>)}{!batches.length && <p>尚無肉品加工批次 No batches found</p>}
    </div>}
    <div className="flex items-center gap-4"><button className="btn btn-secondary" disabled={!page || loading} onClick={() => setPage(page - 1)}>上一頁 Previous</button>
      <span>{page + 1} / {Math.max(1, Math.ceil(total / 50))} · {total} 筆</span><button className="btn btn-secondary" disabled={(page + 1) * 50 >= total || loading} onClick={() => setPage(page + 1)}>下一頁 Next</button></div>
  </div>;
}
