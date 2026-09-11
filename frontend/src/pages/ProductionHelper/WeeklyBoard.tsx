import { useState } from 'react';
import { PHPlanItem } from '@/api/productionHelper';
import PlanCard from './PlanCard';
import NoteCard from './NoteCard';
import { STATIONS, isoDate, planItemsInDisplayOrder } from './utils';
import Bi from '@/components/Bi';

function stationHeaderClass(station: string): string {
  if (station === '面点') return 'bg-emerald-50 text-emerald-700';
  if (station === '肉加工') return 'bg-rose-50 text-rose-700';
  return 'bg-amber-50 text-amber-700';
}

function stationRowClass(station: string): string {
  if (station === '面点') return 'text-emerald-700 bg-emerald-50/40';
  if (station === '肉加工') return 'text-rose-700 bg-rose-50/40';
  return 'text-amber-700 bg-amber-50/40';
}

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
  const [selectedDate, setSelectedDate] = useState(today);
  const activeDate = dates.find((date) => date.date === selectedDate)
    || dates.find((date) => date.date === today)
    || dates[0];

  return (
    <>
      <div className="md:hidden">
        <div
          className="grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-1"
          role="tablist"
          aria-label="選擇生產日期"
        >
          {dates.map((date) => {
            const isActive = date.date === activeDate?.date;
            return (
              <button
                key={date.date}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedDate(date.date)}
                className={`min-h-11 rounded-lg px-1 py-1.5 text-center transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : date.date === today
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-xs font-bold">{date.key}</span>
                <span className={`block text-[10px] ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                  {date.date.slice(5)}
                </span>
              </button>
            );
          })}
        </div>

        {activeDate ? (
          <div className="mt-3 space-y-3">
            {STATIONS.map((station) => (
              <MobileStation
                key={station}
                station={station}
                date={activeDate}
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
        ) : null}
      </div>

      <div
        className="hidden md:grid bg-white rounded-xl border border-slate-200 overflow-hidden"
        style={{ gridTemplateColumns: '120px repeat(5, minmax(0, 1fr))' }}
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
    </>
  );
}

function MobileStation({
  station,
  date,
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
  date: Props['dates'][number];
  week: string;
  plans: PHPlanItem[];
  recipeForProduct: Props['recipeForProduct'];
  recentBatchesFor: Props['recentBatchesFor'];
  onAddPlan: Props['onAddPlan'];
  onAddNote: Props['onAddNote'];
  onEditPlan: Props['onEditPlan'];
  onEditNote: Props['onEditNote'];
}) {
  const allItems = planItemsInDisplayOrder(plans.filter(
    (item) => item.week === week && item.date === date.date && item.station === station
  ));
  const planItems = allItems.filter((item) => (item.type || 'plan') === 'plan');
  const noteItems = allItems.filter((item) => item.type === 'note');

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`flex items-center justify-between px-4 py-3 ${stationHeaderClass(station)}`}
      >
        <h2 className="font-extrabold">{station}</h2>
        <span className="text-xs font-medium text-slate-500">
          {planItems.length} 項計畫
        </span>
      </div>
      <div className="p-3">
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
        {allItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">本日暫無安排</p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-600 hover:border-blue-400 hover:bg-slate-50 hover:text-blue-600"
            onClick={() => onAddPlan(date.date, date.key, station)}
          >
            <Bi k="ph.btn.addPlan" showEn={false} />
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-dashed border-yellow-300 px-3 text-sm font-medium text-yellow-700 hover:border-yellow-500 hover:bg-yellow-50"
            onClick={() => onAddNote(date.date, date.key, station)}
          >
            <Bi k="ph.btn.addNote" showEn={false} />
          </button>
        </div>
      </div>
    </section>
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
        className={`flex items-center justify-center font-extrabold text-base border-t border-slate-200 ${stationRowClass(station)}`}
      >
        {station}
      </div>
      {dates.map((d) => {
        const allItems = planItemsInDisplayOrder(plans.filter(
          (i) => i.week === week && i.date === d.date && i.station === station
        ));
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
                <Bi k="ph.btn.addPlan" showEn={false} />
              </button>
              <button
                type="button"
                className="flex-1 text-xs px-2 py-1 rounded-md border border-dashed border-yellow-300 text-yellow-700 hover:bg-yellow-50 hover:border-yellow-500 transition-colors"
                onClick={() => onAddNote(d.date, d.key, station)}
              >
                <Bi k="ph.btn.addNote" showEn={false} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
