import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { useProductionHelper } from './useProductionHelper';
import WeeklyBoard from './WeeklyBoard';
import PlanDrawer from './PlanDrawer';
import NoteDrawer from './NoteDrawer';
import RecipeDrawer from './RecipeDrawer';
import RequirementsDrawer from './RequirementsDrawer';
import { exportWeeklyPlanImage } from './exportImage';
import { PHPlanItem } from '@/api/productionHelper';
import Bi, { bi } from '@/components/Bi';

export default function ProductionHelperPage() {
  const location = useLocation();
  const navigate = useNavigate();

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

  // Drawer state for plan/note (data-driven, controlled by user clicks)
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

  // Recipe / Requirements drawers are URL-driven (sidebar links open them)
  const recipeDrawerOpen = location.pathname === '/production-helper/recipes';
  const requirementsDrawerOpen = location.pathname === '/production-helper/requirements';

  // When ESC / close clicked, navigate back to base route
  function closeRecipes() {
    navigate('/production-helper');
  }
  function closeRequirements() {
    navigate('/production-helper');
  }

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
      } else {
        await createPlan(payload);
      }
      showToast(bi('ph.toast.savedPlan'));
    } catch (err: any) {
      showToast(`${bi('ph.toast.saveFailed')}：${err?.message || ''}`);
      throw err;
    }
  }
  async function handleDeletePlan(id: string) {
    try {
      await deletePlan(id);
      showToast(bi('ph.toast.deletedPlan'));
    } catch (err: any) {
      showToast(`${bi('ph.toast.deleteFailed')}：${err?.message || ''}`);
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
      } else {
        await createPlan(payload);
      }
      showToast(bi('ph.toast.savedNote'));
    } catch (err: any) {
      showToast(`${bi('ph.toast.saveFailed')}：${err?.message || ''}`);
      throw err;
    }
  }
  async function handleDeleteNote(id: string) {
    try {
      await deletePlan(id);
      showToast(bi('ph.toast.deletedNote'));
    } catch (err: any) {
      showToast(`${bi('ph.toast.deleteFailed')}：${err?.message || ''}`);
      throw err;
    }
  }

  function handleExportImage() {
    try {
      exportWeeklyPlanImage({ plans: state.plans, dates: dates as any, weekKey: week });
      showToast(bi('ph.toast.imageExported'));
    } catch (err: any) {
      showToast(`${bi('ph.toast.saveFailed')}：${err?.message || ''}`);
    }
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            <Bi k="ph.page.title" />
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            <Bi k="ph.page.subtitle" />
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={prevWeek}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
            title={bi('ph.btn.prevWeek')}
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <Bi k="ph.btn.prevWeek" showEn={false} />
          </button>
          <div className="text-sm font-bold px-3 py-1.5 rounded-md bg-slate-100 text-slate-700">
            {dates[0]?.date} ~ {dates[dates.length - 1]?.date}
          </div>
          <button
            type="button"
            onClick={nextWeek}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
            title={bi('ph.btn.nextWeek')}
          >
            <Bi k="ph.btn.nextWeek" showEn={false} />
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={todayWeek}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            <Bi k="ph.btn.thisWeek" showEn={false} />
          </button>
          <button
            type="button"
            onClick={loadBootstrap}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
            title={bi('ph.btn.refresh')}
          >
            <ArrowPathIcon className="h-4 w-4" />
            <Bi k="ph.btn.refresh" showEn={false} />
          </button>
          <button
            type="button"
            onClick={handleExportImage}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
            title={bi('ph.btn.exportImage')}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            <Bi k="ph.btn.exportImage" showEn={false} />
          </button>
          <button
            type="button"
            onClick={() => setPlanDrawer({ open: true, item: null, defaults: { date: dates[0]?.date, station: '面点' } })}
            className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <PlusIcon className="h-4 w-4" />
            <Bi k="ph.btn.newPlan" showEn={false} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat labelKey="ph.stat.planCount" value={planItemsThisWeek.length} />
        <Stat
          labelKey="ph.stat.mainKg"
          value={totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        />
        <Stat labelKey="ph.stat.auxCount" value={requirements.length} />
        <Stat labelKey="ph.stat.productCount" value={state.products.length} />
      </div>

      {state.error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 mb-3">
          {state.error}
        </div>
      ) : null}

      {/* Board */}
      {state.loading ? (
        <div className="text-center text-slate-500 py-12">…</div>
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
        inventoryItems={state.inventoryItems}
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
        onClose={closeRecipes}
        recipes={state.recipes}
        products={state.products}
        inventoryItems={state.inventoryItems}
        onCreate={async (b) => {
          try {
            const r = await createRecipe(b);
            showToast(bi('ph.toast.savedRecipe'));
            return r;
          } catch (err: any) {
            showToast(`${bi('ph.toast.saveFailed')}：${err?.message || ''}`);
            throw err;
          }
        }}
        onUpdate={async (id, b) => {
          try {
            const r = await updateRecipe(id, b);
            showToast(bi('ph.toast.savedRecipe'));
            return r;
          } catch (err: any) {
            showToast(`${bi('ph.toast.saveFailed')}：${err?.message || ''}`);
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteRecipe(id);
            showToast(bi('ph.toast.deletedRecipe'));
          } catch (err: any) {
            showToast(`${bi('ph.toast.deleteFailed')}：${err?.message || ''}`);
            throw err;
          }
        }}
      />
      <RequirementsDrawer
        open={requirementsDrawerOpen}
        onClose={closeRequirements}
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

function Stat({ labelKey, value }: { labelKey: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">
        <Bi k={labelKey} />
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
