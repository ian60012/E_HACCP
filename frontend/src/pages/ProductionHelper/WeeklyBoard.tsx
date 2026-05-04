import { PHPlanItem } from '@/api/productionHelper';
import PlanCard from './PlanCard';
import NoteCard from './NoteCard';
import { DAYS, STATIONS, fmtDate, isoDate } from './utils';

interface Props {
  week: string;
  dates: { key: string; label: string; date: string }[];
  plans: PHPlanItem[];
  recipeForProduct: (productId: any) => any;
  recentBatchesFor: (item: any) => any[];
  onAddPlan: (date: string, day: string, station: string) => void;
  onAddNote: (date: string, day: string, station: string) => void;
  onEditPlan: (item: PHPlanItem) => void;
  onEditNote: (item: PHPlanItem) => void;
}

export default function WeeklyBoard({
  week,
  dates,
  plans,
  recipeForProduct,
  recentBatchesFor,
  onAddPlan,
  onAddNote,
  onEditPlan,
  onEditNote,
}: Props) {
  const today = isoDate(new Date());

  return (
    <div
      className="grid bg-white rounded-xl border border-slate-200 overflow-hidden"
      style={{
        gridTemplateColumns: '120px repeat(5, minmax(0, 1fr))',
      }}
    >
      <div className="border-b border-slate-200 bg-slate-50" />
      {dates.map((d) => (
        <div
          key={d.date}
          className={`border-b border-l border-slate-200 p-2 text-center bg-slate-50 ${
            d.date === today ? 'bg-blue-50 font-bold' : ''
          }`}
        >
          <div className="text-sm font-bold">{d.key}</div>
          <div className="text-xs text-slate-500">{d.date}</div>
        </div>
      ))}

      {STATIONS.map((station) => (
        <Row
          key={station}
          station={station}
          dates={dates}
          today={today}
          week={week}
          plans={plans}
          recipeForProduct={recipeForProduct}
          recentBatchesFor={recentBatchesFor}
          onAddPlan={onAddPlan}
          onAddNote={onAddNote}
          onEditPlan={onEditPlan}
          onEditNote={onEditNote}
        />
      ))}
    </div>
  );
}

function Row({
  station,
  dates,
  today,
  week,
  plans,
  recipeForProduct,
  recentBatchesFor,
  onAddPlan,
  onAddNote,
  onEditPlan,
  onEditNote,
}: {
  station: string;
  dates: Props['dates'];
  today: string;
  week: string;
  plans: PHPlanItem[];
  recipeForProduct: Props['recipeForProduct'];
  recentBatchesFor: Props['recentBatchesFor'];
  onAddPlan: Props['onAddPlan'];
  onAddNote: Props['onAddNote'];
  onEditPlan: Props['onEditPlan'];
  onEditNote: Props['onEditNote'];
}) {
  return (
    <>
      <div
        className={`flex items-center justify-center font-extrabold text-base border-t border-slate-200 ${
          station === '面点' ? 'text-emerald-700 bg-emerald-50/40' : 'text-amber-700 bg-amber-50/40'
        }`}
      >
        {station}
      </div>
      {dates.map((d) => {
        const allItems = plans.filter(
          (i) => i.week === week && i.date === d.date && i.station === station
        );
        const planItems = allItems.filter((i) => (i.type || 'plan') === 'plan');
        const noteItems = allItems.filter((i) => i.type === 'note');
        return (
          <div
            key={d.date + station}
            className={`border-l border-t border-slate-200 p-2 min-h-[180px] ${
              d.date === today ? 'bg-blue-50/30' : ''
            }`}
          >
            {planItems.map((item) => {
              const recent = recentBatchesFor(item)[0];
              return (
                <PlanCard
                  key={item.id}
                  item={item}
                  recipe={recipeForProduct(item.product_id)}
                  recentBatchDate={recent?.production_date || undefined}
                  onClick={() => onEditPlan(item)}
                />
              );
            })}
            {noteItems.map((item) => (
              <NoteCard key={item.id} item={item} onClick={() => onEditNote(item)} />
            ))}
            <div className="flex gap-1 mt-1">
              <button
                type="button"
                className="flex-1 text-xs px-2 py-1 rounded-md border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-colors"
                onClick={() => onAddPlan(d.date, d.key, station)}
              >
                + 計畫
              </button>
              <button
                type="button"
                className="flex-1 text-xs px-2 py-1 rounded-md border border-dashed border-yellow-300 text-yellow-700 hover:bg-yellow-50 hover:border-yellow-500 transition-colors"
                onClick={() => onAddNote(d.date, d.key, station)}
              >
                + 便條
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
