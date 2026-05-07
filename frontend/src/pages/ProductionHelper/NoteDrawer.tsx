import { useEffect, useState } from 'react';
import Drawer from './Drawer';
import { PHPlanItem } from '@/api/productionHelper';
import Bi, { bi } from '@/components/Bi';

interface Props {
  open: boolean;
  onClose: () => void;
  item: PHPlanItem | null;
  defaults: { date?: string; day?: string; station?: string };
  weekKey: string;
  weekDates: { key: string; date: string }[];
  onSave: (payload: Partial<PHPlanItem>, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function NoteDrawer(props: Props) {
  const { open, onClose, item, defaults, weekKey, weekDates, onSave, onDelete } = props;

  const [form, setForm] = useState({
    date: defaults.date || weekDates[0]?.date || '',
    day: defaults.day || weekDates[0]?.key || '',
    station: defaults.station || '面点',
    title: '',
    content: '',
  });

  useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          date: item.date || weekDates[0]?.date || '',
          day: item.day || weekDates[0]?.key || '',
          station: item.station || '面点',
          title: item.title || '',
          content: item.content || '',
        });
      } else {
        setForm({
          date: defaults.date || weekDates[0]?.date || '',
          day: defaults.day || weekDates[0]?.key || '',
          station: defaults.station || '面点',
          title: '',
          content: '',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Partial<PHPlanItem> = {
      type: 'note',
      week: weekKey,
      date: form.date,
      day: form.day,
      station: form.station,
      title: form.title.trim(),
      content: form.content.trim(),
    };
    await onSave(payload, item?.id);
    onClose();
  }

  async function handleDelete() {
    if (!item?.id) return;
    if (!window.confirm(bi('ph.confirm.deleteNote'))) return;
    await onDelete(item.id);
    onClose();
  }

  return (
    <Drawer
      open={open}
      title={bi(item ? 'ph.drawer.editNote' : 'ph.drawer.newNote')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <label className="text-sm col-span-2">
          <span className="text-slate-700"><Bi k="ph.field.title" /></span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={bi('ph.placeholder.noteTitle')}
            maxLength={80}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm col-span-2">
          <span className="text-slate-700"><Bi k="ph.field.content" /></span>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={5}
            placeholder={bi('ph.placeholder.noteContent')}
            className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </label>

        <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-slate-200 mt-2">
          {item ? (
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-md border border-rose-300 text-rose-600 hover:bg-rose-50"
              onClick={handleDelete}
            >
              <Bi k="ph.btn.delete" showEn={false} />
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            <Bi k="ph.btn.cancel" showEn={false} />
          </button>
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Bi k="ph.btn.save" showEn={false} />
          </button>
        </div>
      </form>
    </Drawer>
  );
}
