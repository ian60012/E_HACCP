import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
  key: keyof T;
  header: string;
  format?: (val: unknown) => string;
}

export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
) {
  try {
    const rows = data.map((item) =>
      columns.reduce((acc, col) => {
        const val = item[col.key];
        acc[col.header] = col.format ? col.format(val) : (val ?? '');
        return acc;
      }, {} as Record<string, any>)
    );
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto column widths
    const colWidths = columns.map((col) => ({
      wch: Math.max(
        col.header.length + 2,
        ...data.map((item) => {
          const val = col.format ? col.format(item[col.key]) : String(item[col.key] ?? '');
          return val.length + 2;
        })
      ),
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Records');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } catch (err) {
    console.error('exportToExcel error:', err);
    throw err;
  }
}

export function exportToPdf<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn<T>[],
  title: string,
) {
  try {
    const headerRow = columns.map((c) => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;font-size:12px;white-space:nowrap;">${c.header}</th>`).join('');
    const bodyRows = data.map((item) => {
      const cells = columns.map((col) => {
        const val = col.format ? col.format(item[col.key]) : (item[col.key] ?? '');
        return `<td style="border:1px solid #ddd;padding:5px 10px;font-size:11px;">${val}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head>
<title>${title}</title>
<style>
  @page { size: landscape; margin: 15mm; }
  body { font-family: Arial, 'Microsoft JhengHei', sans-serif; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  @media print { .no-print { display: none; } }
</style>
</head><body>
<h1>${title}</h1>
<div class="meta">FD Catering Service — 匯出時間 Exported: ${new Date().toLocaleString('zh-TW')}</div>
<div class="meta">共 ${data.length} 筆記錄 Total ${data.length} records</div>
<table>
<thead><tr>${headerRow}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else { throw new Error('Popup blocked by browser'); }
  } catch (err) {
    console.error('exportToPdf error:', err);
    throw err;
  }
}

// Common date formatter
export function formatExportDateTime(val: unknown): string {
  if (!val) return '';
  return new Date(String(val)).toLocaleString('zh-TW', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
}
