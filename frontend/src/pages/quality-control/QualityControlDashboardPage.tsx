import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, MagnifyingGlassIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { qualityControlApi, qualityError } from '@/api/qualityControl';
import ErrorCard from '@/components/ErrorCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import QualityStatusBadge from '@/components/QualityStatusBadge';
import { QualityBatchDashboardResponse, QualityBatchSummary, QualityStatus } from '@/types/qualityControl';

const PAGE_SIZE = 30;

const statusCards: { status: QualityStatus; label: string; hint: string; style: string }[] = [
  { status: 'draft', label: '待品管簽核', hint: 'Pending QA', style: 'border-amber-200 bg-amber-50 text-amber-900' },
  { status: 'not_started', label: '尚未填寫', hint: 'Not started', style: 'border-gray-200 bg-gray-50 text-gray-800' },
  { status: 'rejected', label: '未通過', hint: 'Rejected', style: 'border-red-200 bg-red-50 text-red-900' },
  { status: 'approved', label: '已放行', hint: 'Released', style: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
];

const processLabels: Record<string, string> = {
  forming: '水餃成型 Forming',
  hot_process: '熱加工 Hot process',
  meat_processing: '肉品加工 Meat processing',
};

function BatchCard({ batch }: { batch: QualityBatchSummary }) {
  return (
    <Link
      to={`/production/batches/${batch.batch_id}/quality`}
      className="group block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{batch.batch_code}</p>
          <p className="mt-1 truncate text-sm text-gray-700">{batch.product_name}</p>
          <p className="text-xs text-gray-500">{batch.product_code}</p>
        </div>
        <QualityStatusBadge status={batch.quality_status} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
        <div className="text-xs text-gray-600">
          <p>{batch.process_type ? processLabels[batch.process_type] : '未分類 Unclassified'}</p>
          <p className="mt-1">生產日期 {batch.production_date}</p>
        </div>
        <ArrowRightIcon className="h-5 w-5 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-cyan-700" aria-hidden="true" />
      </div>
    </Link>
  );
}

export default function QualityControlDashboardPage() {
  const [data, setData] = useState<QualityBatchDashboardResponse | null>(null);
  const [status, setStatus] = useState<QualityStatus | ''>('');
  const [processType, setProcessType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await qualityControlApi.listBatches({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        quality_status: status,
        process_type: processType,
        date_from: dateFrom,
        date_to: dateTo,
        search,
      }));
    } catch (caught) {
      setError(qualityError(caught));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, processType, search, status]);

  useEffect(() => { load(); }, [load]);

  const selectStatus = (nextStatus: QualityStatus) => {
    setPage(0);
    setStatus((current) => current === nextStatus ? '' : nextStatus);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  return (
    <main className="space-y-6" aria-labelledby="quality-dashboard-title">
      <header className="rounded-2xl bg-gradient-to-r from-cyan-800 to-teal-700 p-6 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <span className="rounded-xl bg-white/15 p-3"><ShieldCheckIcon className="h-8 w-8" aria-hidden="true" /></span>
          <div>
            <h1 id="quality-dashboard-title" className="text-2xl font-bold">品質控管工作台</h1>
            <p className="mt-1 text-sm text-cyan-50">Quality Control · 批次檢驗、留樣、照片與簽核放行</p>
          </div>
        </div>
      </header>

      <section aria-label="品質狀態摘要" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statusCards.map((card) => (
          <button
            key={card.status}
            type="button"
            aria-pressed={status === card.status}
            onClick={() => selectStatus(card.status)}
            className={`min-h-24 rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-500 ${card.style} ${status === card.status ? 'ring-2 ring-cyan-600' : 'hover:shadow-sm'}`}
          >
            <span className="block text-2xl font-bold">{data?.counts[card.status] ?? '—'}</span>
            <span className="mt-1 block text-sm font-semibold">{card.label}</span>
            <span className="block text-xs opacity-70">{card.hint}</span>
          </button>
        ))}
      </section>

      <form onSubmit={submitSearch} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-gray-700">製程 Process
            <select value={processType} onChange={(e) => { setPage(0); setProcessType(e.target.value); }} className="input mt-1 min-h-11 w-full">
              <option value="">全部 All</option>
              <option value="forming">水餃成型 Forming</option>
              <option value="hot_process">熱加工 Hot process</option>
              <option value="meat_processing">肉品加工 Meat processing</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">起始日期 From
            <input type="date" value={dateFrom} onChange={(e) => { setPage(0); setDateFrom(e.target.value); }} className="input mt-1 min-h-11 w-full" />
          </label>
          <label className="text-sm font-medium text-gray-700">結束日期 To
            <input type="date" value={dateTo} onChange={(e) => { setPage(0); setDateTo(e.target.value); }} className="input mt-1 min-h-11 w-full" />
          </label>
          <label className="text-sm font-medium text-gray-700 xl:col-span-2">批次或產品 Batch / product
            <span className="mt-1 flex gap-2">
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="輸入批次號、產品編號或名稱" className="input min-h-11 min-w-0 flex-1" />
              <button type="submit" className="btn btn-primary min-h-11 min-w-11 px-3" aria-label="搜尋">
                <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </span>
          </label>
        </div>
        {(status || processType || dateFrom || dateTo || search) && (
          <button type="button" onClick={() => { setStatus(''); setProcessType(''); setDateFrom(''); setDateTo(''); setSearchInput(''); setSearch(''); setPage(0); }} className="mt-3 min-h-11 text-sm font-medium text-cyan-700 hover:text-cyan-900">
            清除所有篩選 Clear filters
          </button>
        )}
      </form>

      {error ? <ErrorCard message={error} onRetry={load} /> : loading ? <LoadingSpinner message="載入品質批次中..." /> : data && data.items.length > 0 ? (
        <section aria-label="品質批次清單">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">共 {data.total} 個批次 · 待處理優先排列</p>
            <p className="text-sm text-gray-500">第 {page + 1} / {totalPages} 頁</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.items.map((batch) => <BatchCard key={batch.batch_id} batch={batch} />)}</div>
          <nav aria-label="批次分頁" className="mt-6 flex justify-center gap-3">
            <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn btn-secondary min-h-11 disabled:cursor-not-allowed disabled:opacity-50">上一頁 Previous</button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)} className="btn btn-secondary min-h-11 disabled:cursor-not-allowed disabled:opacity-50">下一頁 Next</button>
          </nav>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
          <ShieldCheckIcon className="mx-auto h-10 w-10 text-gray-400" aria-hidden="true" />
          <p className="mt-3 font-medium text-gray-700">目前沒有符合條件的批次</p>
          <p className="mt-1 text-sm text-gray-500">No matching quality-control batches</p>
        </section>
      )}
    </main>
  );
}
