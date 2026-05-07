import { PHPlanItem } from '@/api/productionHelper';
import { DAYS, STATIONS } from './utils';
import { t } from '@/i18n/labels';

export interface WeekDate {
  key: string;
  label: string;
  date: string;
}

export interface ExportWeeklyPlanArgs {
  plans: PHPlanItem[];
  dates: WeekDate[];
  weekKey: string;
}

const FONT_FAMILY = '"Segoe UI", "Microsoft YaHei", sans-serif';

export function exportWeeklyPlanImage({ plans, dates, weekKey }: ExportWeeklyPlanArgs): void {
  const scale = 2;
  const margin = 44;
  const titleHeight = 110;
  const stationWidth = 118;
  const colWidth = 230;
  const headerHeight = 72;
  const footerHeight = 44;
  const width = margin * 2 + stationWidth + colWidth * DAYS.length;

  const weekPlans = plans.filter((p) => p.week === weekKey);

  const rowHeights = STATIONS.map((station) => {
    const maxCellHeight = Math.max(
      ...dates.map((day) => {
        const items = weekPlans.filter(
          (item) => item.date === day.date && item.station === station
        );
        return exportCellHeight(items, colWidth);
      })
    );
    return Math.max(260, maxCellHeight);
  });
  const tableContentHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const height = margin * 2 + titleHeight + headerHeight + tableContentHeight + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.scale(scale, scale);

  const start = dates[0]?.date ?? '';
  const end = dates[dates.length - 1]?.date ?? '';
  const titleLabel = t('ph.export.title');
  const exportedAt = t('ph.export.exportedAt');
  const planCountSuffix = t('ph.export.planCountSuffix');
  const dateRangeJoin = t('ph.export.dateRangeJoin');

  // Background
  fill(ctx, 0, 0, width, height, '#f8fafc');
  fill(ctx, margin, margin, width - margin * 2, height - margin * 2, '#ffffff', 20);
  stroke(ctx, margin, margin, width - margin * 2, height - margin * 2, '#e0e2e6', 20);

  // Title block
  ctx.textAlign = 'left';
  ctx.fillStyle = '#181d26';
  ctx.font = `700 30px ${FONT_FAMILY}`;
  ctx.fillText(titleLabel.zh, margin + 24, margin + 42);
  ctx.font = `600 16px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(4,14,32,0.55)';
  ctx.fillText(titleLabel.en, margin + 24, margin + 64);

  ctx.font = `600 14px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(4,14,32,0.69)';
  ctx.fillText(`${start} ${dateRangeJoin.zh} ${end}`, margin + 24, margin + 88);

  const planCount = weekPlans.filter((p) => (p.type || 'plan') === 'plan').length;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1b61c9';
  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.fillText(`${planCount} ${planCountSuffix.zh}`, width - margin - 24, margin + 44);
  ctx.fillStyle = 'rgba(27,97,201,0.7)';
  ctx.font = `600 12px ${FONT_FAMILY}`;
  ctx.fillText(`${planCount} ${planCountSuffix.en}`, width - margin - 24, margin + 64);
  ctx.textAlign = 'left';

  // Table frame
  const tableX = margin + 24;
  const tableY = margin + titleHeight;
  const tableW = stationWidth + colWidth * DAYS.length;
  const tableH = headerHeight + tableContentHeight;
  fill(ctx, tableX, tableY, tableW, tableH, '#ffffff', 14);
  stroke(ctx, tableX, tableY, tableW, tableH, '#e0e2e6', 14);

  // Header row background + dividers
  fill(ctx, tableX, tableY, tableW, headerHeight, '#f8fafc', 14);
  drawLine(ctx, tableX, tableY + headerHeight, tableX + tableW, tableY + headerHeight, '#e0e2e6');
  drawLine(ctx, tableX + stationWidth, tableY, tableX + stationWidth, tableY + tableH, '#e0e2e6');

  // Station header (bilingual)
  const stationLabel = t('ph.field.station');
  ctx.font = `700 14px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(4,14,32,0.69)';
  ctx.textAlign = 'center';
  ctx.fillText(stationLabel.zh, tableX + stationWidth / 2, tableY + 30);
  ctx.font = `600 11px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(4,14,32,0.5)';
  ctx.fillText(stationLabel.en, tableX + stationWidth / 2, tableY + 50);

  // Day headers
  dates.forEach((day, idx) => {
    const x = tableX + stationWidth + idx * colWidth;
    drawLine(ctx, x, tableY, x, tableY + tableH, '#e0e2e6');
    ctx.fillStyle = '#181d26';
    ctx.font = `800 16px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(day.key, x + colWidth / 2, tableY + 28);
    ctx.fillStyle = 'rgba(4,14,32,0.58)';
    ctx.font = `600 12px ${FONT_FAMILY}`;
    ctx.fillText(day.date, x + colWidth / 2, tableY + 50);
  });

  // Body rows
  let rowY = tableY + headerHeight;
  STATIONS.forEach((station, stationIdx) => {
    const rowHeight = rowHeights[stationIdx];
    if (stationIdx > 0) {
      drawLine(ctx, tableX, rowY, tableX + tableW, rowY, '#e0e2e6');
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = station === '面点' ? '#006400' : '#a45300';
    ctx.font = `800 18px ${FONT_FAMILY}`;
    ctx.fillText(station, tableX + stationWidth / 2, rowY + rowHeight / 2 + 6);

    dates.forEach((day, dayIdx) => {
      const cellX = tableX + stationWidth + dayIdx * colWidth;
      const items = weekPlans.filter((item) => item.date === day.date && item.station === station);
      drawExportCell(ctx, cellX, rowY, colWidth, rowHeight, items);
    });
    rowY += rowHeight;
  });

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(4,14,32,0.48)';
  ctx.font = `500 12px ${FONT_FAMILY}`;
  const stamp = new Date().toLocaleString();
  ctx.fillText(`${exportedAt.zh} / ${exportedAt.en}: ${stamp}`, margin + 24, height - margin - 10);

  // Trigger download
  const link = document.createElement('a');
  link.download = `production-plan-${weekKey}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ---- cell measurement & drawing ----

function exportCellHeight(items: PHPlanItem[], colWidth: number): number {
  if (!items.length) return 260;
  const contentHeight = items.reduce((sum, item) => {
    const h =
      (item.type || 'plan') === 'note'
        ? exportNoteCardHeight(null, item, colWidth - 20)
        : exportCardHeight(null, item, colWidth - 20);
    return sum + h + 10;
  }, 14);
  return contentHeight + 14;
}

function exportNoteCardHeight(
  ctx: CanvasRenderingContext2D | null,
  item: PHPlanItem,
  width: number
): number {
  const measureCtx = ctx || exportMeasureContext();
  const untitled = t('ph.label.untitled');
  measureCtx.font = `800 13px ${FONT_FAMILY}`;
  const titleLines = wrapText(measureCtx, item.title || untitled.zh, width - 20).length;
  measureCtx.font = `500 12px ${FONT_FAMILY}`;
  const contentLines = item.content ? wrapNoteLines(measureCtx, item.content, width - 20).length : 0;
  return Math.max(52, 28 + titleLines * 16 + contentLines * 15 + 18);
}

function exportCardHeight(
  ctx: CanvasRenderingContext2D | null,
  item: PHPlanItem,
  width: number
): number {
  const measureCtx = ctx || exportMeasureContext();
  const noProduct = t('ph.export.noProduct');
  const noMaterial = t('ph.export.noMainMaterial');
  measureCtx.font = `800 14px ${FONT_FAMILY}`;
  const nameLines = wrapText(measureCtx, item.product_name || noProduct.zh, width - 20).length;
  const meta = [item.main_material_name, item.notes].filter(Boolean).join(' · ') || noMaterial.zh;
  measureCtx.font = `600 12px ${FONT_FAMILY}`;
  const metaLines = wrapText(measureCtx, meta, width - 20).length;
  return Math.max(104, 58 + nameLines * 16 + metaLines * 15);
}

function drawExportCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  items: PHPlanItem[]
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();

  if (!items.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4,14,32,0.28)';
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText('-', x + w / 2, y + h / 2 + 5);
    ctx.restore();
    return;
  }

  const noteLabel = t('ph.label.note');
  const untitled = t('ph.label.untitled');
  const noProduct = t('ph.export.noProduct');
  const noMaterial = t('ph.export.noMainMaterial');

  let cursorY = y + 14;
  items.forEach((item) => {
    const cardX = x + 10;
    const cardY = cursorY;
    const cardW = w - 20;

    if ((item.type || 'plan') === 'note') {
      const cardH = exportNoteCardHeight(ctx, item, cardW);
      fill(ctx, cardX, cardY, cardW, cardH, '#fefce8', 10);
      stroke(ctx, cardX, cardY, cardW, cardH, '#e8d96a', 10);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#78350f';
      ctx.font = `800 13px ${FONT_FAMILY}`;
      const title = item.title || untitled.zh;
      const titleLines = wrapText(ctx, title, cardW - 20);
      drawWrappedText(ctx, title, cardX + 10, cardY + 20, cardW - 20, 16);

      if (item.content) {
        ctx.fillStyle = '#92400e';
        ctx.font = `500 12px ${FONT_FAMILY}`;
        const contentLines = wrapNoteLines(ctx, item.content, cardW - 20);
        contentLines.forEach((line, idx) => {
          ctx.fillText(line, cardX + 10, cardY + 20 + titleLines.length * 16 + 4 + idx * 15);
        });
      }

      ctx.fillStyle = '#a16207';
      ctx.font = `700 10px ${FONT_FAMILY}`;
      ctx.fillText(noteLabel.zh, cardX + 10, cardY + cardH - 8);
      cursorY += cardH + 10;
    } else {
      const cardH = exportCardHeight(ctx, item, cardW);
      fill(ctx, cardX, cardY, cardW, cardH, '#ffffff', 10);
      stroke(ctx, cardX, cardY, cardW, cardH, '#d9dee7', 10);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#181d26';
      ctx.font = `800 14px ${FONT_FAMILY}`;
      drawWrappedText(ctx, item.product_name || noProduct.zh, cardX + 10, cardY + 22, cardW - 20, 17);

      ctx.fillStyle = 'rgba(4,14,32,0.58)';
      ctx.font = `600 11px ${FONT_FAMILY}`;
      ctx.fillText(item.product_code || '', cardX + 10, cardY + 58);

      ctx.fillStyle = '#1b61c9';
      ctx.font = `800 13px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `${Number(item.main_material_qty_kg || 0).toLocaleString()} kg`,
        cardX + cardW - 10,
        cardY + 58
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(4,14,32,0.69)';
      ctx.font = `600 12px ${FONT_FAMILY}`;
      const meta = [item.main_material_name, item.notes].filter(Boolean).join(' · ');
      drawWrappedText(ctx, meta || noMaterial.zh, cardX + 10, cardY + 80, cardW - 20, 16);

      cursorY += cardH + 10;
    }
  });

  ctx.restore();
}

// ---- text helpers ----

function wrapNoteLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of String(text || '').split('\n')) {
    const wrapped = wrapText(ctx, para, maxWidth);
    lines.push(...(wrapped.length ? wrapped : ['']));
  }
  return lines;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = Infinity
): string[] {
  const value = String(text || '');
  const lines: string[] = [];
  let current = '';
  for (const char of value) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (Number.isFinite(maxLines) && value.length && lines.join('').length < value.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  }
  return Number.isFinite(maxLines) ? lines.slice(0, maxLines) : lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = Infinity
): void {
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight);
  });
}

function exportMeasureContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.font = `800 14px ${FONT_FAMILY}`;
  return ctx;
}

// ---- shape primitives ----

function fill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  radius: number = 0
): void {
  ctx.fillStyle = color;
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fill();
}

function stroke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  radius: number = 0
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
}
