import { useState } from 'react';
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  BookOpenIcon,
  ShoppingCartIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { useProductionHelper } from './useProductionHelper';
import WeeklyBoard from './WeeklyBoard';
import PlanDrawer from './PlanDrawer';
import NoteDrawer from './NoteDrawer';
import RecipeDrawer from './RecipeDrawer';
import RequirementsDrawer from './RequirementsDrawer';
import { PHPlanItem } from '@/api/productionHelper';
import { fmtDate } from './utils';

export default function ProductionHelperPage() {
  const {
    state,
    week,
    dates,
    requirements,
    prevWeek,
    nextWeek,
    todayWeek,
    loadBootstrap,
    createPlan,
    updatePlan,
    deletePlan,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    setOrdered,
    recipeByProduct,
    recentBatchesFor,
  } = useProductionHelper();

  // Drawer state
  const [planDrawer, setPlanDrawer] = useState<{
    open: boolean;
    item: PHPlanItem | null;
    defaults: { date?: string; station?: string };
  }>({ open: false, item: null, defaults: {} });
  const [noteDrawer, setNoteDrawer] = useState<{
    open: boolean;
    item: PHPlanItem | null;
    defaults: { date?: string; day?: string; station?: string };
  }>({ open: false, item: null, defaults: {} });
  const [recipeDrawerOpen, setRecipeDrawerOpen] = useState(false);
  const [requirementsDrawerOpen, setRequirementsDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  // Stats
  const planItemsThisWeek = state.plans.filter(
    (p) => p.week === week && (p.type || 'plan') === 'plan'
  );
  const totalKg = planItemsThisWeek.reduce(
    (sum, item) => sum + Number(item.main_material_qty_kg || 0),
    0
  );

  // Plan drawer handlers
  function openAddPlan(date: string, _day: string, station: string) {
    setPlanDrawer({ open: true, item: null, defaults: { date, station } });
  }
  function openEditPlan(item: PHPlanItem) {
    setPlanDrawer({ open: true, item, defaults: { date: item.date, station: item.station } });
  }
  async function handleSavePlan(payload: Partial<PHPlanItem>, id?: string) {
    try {
      if (id) {
        await updatePlan(id, payload);
        showToast('計畫已更新');
      } else {
        await createPlan(payload);
        showToast('計畫已新增');
      }
    } catch (err: any) {
      showToast(`保存失敗：${err?.message || '未知錯誤'}`);
      throw err;
    }
  }
  async function handleDeletePlan(id: string) {
    try {
      await deletePlan(id);
      showToast('計畫已刪除');
    } catch (err: any) {
      showToast(`刪除失敗：${err?.message || '未知錯誤'}`);
      throw err;
    }
  }

  // Note drawer handlers
  function openAddNote(date: string, day: string, station: string) {
    setNoteDrawer({ open: true, item: null, defaults: { date, day, station } });
  }
  function openEditNote(item: PHPlanItem) {
    setNoteDrawer({
      open: true,
      item,
      defaults: { date: item.date, day: item.day, station: item.station },
    });
  }
  async function handleSaveNote(payload: Partial<PHPlanItem>, id?: string) {
    try {
      if (id) {
        await updatePlan(id, payload);
        showToast('便條已更新');
      } else {
        await createPlan(payload);
        showToast('便條已新增');
      }
    } catch (err: any) {
      showToast(`保存失敗：${err?.message || '未知錯誤'}`);
      throw err;
    }
  }
  async function handleDeleteNote(id: string) {
    try {
      await deletePlan(id);
      showToast('便條已刪除');
    } catch (err: any) {
      showToast(`刪除失敗：${err?.message || '未知錯誤'}`);
      throw err;
    }
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">週生產計畫</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            以產品和主材料量安排生產，配方會自動匯總輔料叫貨量。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={prevWeek}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            上一週
          </button>
          <div className="text-sm font-bold px-3 py-1.5 rounded-md bg-slate-100 text-slate-700">
            {dates[0]?.date} 至 {dates[dates.length - 1]?.date}
          </div>
          <button
            type="button"
            onClick={nextWeek}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            下一週
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={todayWeek}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            本週
          </button>
          <button
            type="button"
            onClick={() => setRecipeDrawerOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <BookOpenIcon className="h-4 w-4" />
            配方庫
          </button>
          <button
            type="button"
            onClick={() => setRequirementsDrawerOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <ShoppingCartIcon className="h-4 w-4" />
            叫貨總覽
          </button>
          <button
            type="button"
            onClick={loadBootstrap}
            className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <ArrowPathIcon className="h-4 w-4" />
            重新整理
          </button>
          <button
            type="button"
            onClick={() => setPlanDrawer({ open: true, item: null, defaults: { date: dates[0]?.date, station: '面点' } })}
            className="text-sm px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1"
          >
            <PlusIcon className="h-4 w-4" />
            新增計畫
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="本週計畫項" value={planItemsThisWeek.length} />
        <Stat label="本週主材料 kg" value={totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        <Stat label="需叫貨材料" value={requirements.length} />
        <Stat label="產品總數" value={state.products.length} />
      </div>

      {state.error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 mb-3">
          載入失敗：{state.error}
        </div>
      ) : null}

      {/* Board */}
      {state.loading ? (
        <div className="text-center text-slate-500 py-12">讀取中…</div>
      ) : (
        <WeeklyBoard
          week={week}
          dates={dates as any}
          plans={state.plans}
          recipeForProduct={recipeByProduct}
          recentBatchesFor={recentBatchesFor}
          onAddPlan={openAddPlan}
          onAddNote={openAddNote}
          onEditPlan={openEditPlan}
          onEditNote={openEditNote}
        />
      )}

      {/* Drawers */}
      <PlanDrawer
        open={planDrawer.open}
        onClose={() => setPlanDrawer({ open: false, item: null, defaults: {} })}
        item={planDrawer.item}
        defaults={planDrawer.defaults}
        weekDates={dates as any}
        products={state.products}
        recipes={state.recipes}
        batches={state.batches as any}
        weekKey={week}
        onSave={handleSavePlan}
        onDelete={handleDeletePlan}
      />
      <NoteDrawer
        open={noteDrawer.open}
        onClose={() => setNoteDrawer({ open: false, item: null, defaults: {} })}
        item={noteDrawer.item}
        defaults={noteDrawer.defaults}
        weekKey={week}
        weekDates={dates as any}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />
      <RecipeDrawer
        open={recipeDrawerOpen}
        onClose={() => setRecipeDrawerOpen(false)}
        recipes={state.recipes}
        products={state.products}
        inventoryItems={state.inventoryItems}
        onCreate={async (b) => {
          try {
            const r = await createRecipe(b);
            showToast('配方已新增');
            return r;
          } catch (err: any) {
            showToast(`保存失敗：${err?.message || '未知錯誤'}`);
            throw err;
          }
        }}
        onUpdate={async (id, b) => {
          try {
            const r = await updateRecipe(id, b);
            showToast('配方已更新');
            return r;
          } catch (err: any) {
            showToast(`保存失敗：${err?.message || '未知錯誤'}`);
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteRecipe(id);
            showToast('配方已刪除');
          } catch (err: any) {
            showToast(`刪除失敗：${err?.message || '未知錯誤'}`);
            throw err;
          }
        }}
      />
      <RequirementsDrawer
        open={requirementsDrawerOpen}
        onClose={() => setRequirementsDrawerOpen(false)}
        requirements={requirements}
        weekKey={week}
        orderedKeys={state.orderedKeys}
        onSetOrdered={setOrdered}
      />

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-md bg-slate-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
