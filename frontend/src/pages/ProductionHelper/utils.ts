// Date utilities for the production helper week board.
// Week starts Monday (ISO). All exported strings are local-date ISO (YYYY-MM-DD).

export const DAYS = [
  { key: '周一', label: '周一' },
  { key: '周二', label: '周二' },
  { key: '周三', label: '周三' },
  { key: '周四', label: '周四' },
  { key: '周五', label: '周五' },
] as const;

export const STATIONS = ['面点', '厨房'] as const;
export type Station = typeof STATIONS[number];

export function isoDate(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function weekDates(currentMonday: Date) {
  return DAYS.map((day, idx) => ({
    ...day,
    date: isoDate(addDays(currentMonday, idx)),
  }));
}

export function weekKey(currentMonday: Date): string {
  return isoDate(currentMonday);
}

export function purchaseStatusKey(week: string, dueDate: string, materialType: string, itemName: string): string {
  return `${week}:${dueDate}:${materialType}:${itemName || ''}`;
}
