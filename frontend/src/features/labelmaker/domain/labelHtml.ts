import type { LabelPrintData, ProductTemplate } from '../types';
import { formatContains } from './allergens';
import { formatEnergy, formatGrams, formatMilligrams, perServing } from './nutrition';
import { normalizeFactoryInformation } from './product';

export function buildLabelHtml(data: LabelPrintData): string {
  const product = data.product;
  const factoryInformation = normalizeFactoryInformation(product.customerText);
  const serving = perServing(product);
  const rows = [
    ['Energy', formatEnergy(serving.energyKj), formatEnergy(product.nutritionPer100g.energyKj)],
    ['Protein', formatGrams(serving.proteinG), formatGrams(product.nutritionPer100g.proteinG)],
    ['Fat, total', formatGrams(serving.fatTotalG), formatGrams(product.nutritionPer100g.fatTotalG)],
    ['- saturated', formatGrams(serving.fatSaturatedG), formatGrams(product.nutritionPer100g.fatSaturatedG)],
    ['Carbohydrate', formatGrams(serving.carbohydrateG), formatGrams(product.nutritionPer100g.carbohydrateG)],
    ['- sugars', formatGrams(serving.sugarsG), formatGrams(product.nutritionPer100g.sugarsG)],
    ['Sodium', formatMilligrams(serving.sodiumMg), formatMilligrams(product.nutritionPer100g.sodiumMg)],
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 150mm 100mm; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 150mm;
      height: 100mm;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      color: #111;
      background: #fff;
    }
    .label {
      width: 150mm;
      height: 100mm;
      padding: 4mm 5mm 3mm 5mm;
      display: grid;
      grid-template-columns: 90mm 42mm;
      grid-template-rows: auto 1fr auto;
      gap: 2.5mm 4mm;
    }
    .title { grid-column: 1 / 3; border-bottom: 0.45mm solid #111; padding-bottom: 1.5mm; }
    .zh { font-size: 17pt; font-weight: 700; line-height: 1.05; }
    .en { font-size: 11pt; font-weight: 700; margin-top: 1mm; }
    .net { font-size: 11pt; font-weight: 700; margin-top: 1.2mm; }
    .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm; }
    .copy { font-size: 7.5pt; line-height: 1.25; }
    .left, .right { min-width: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 6.1pt; }
    th, td { border: 0.25mm solid #111; padding: 0.45mm 0.65mm; vertical-align: top; }
    th { font-weight: 700; text-align: left; }
    td:nth-child(2), td:nth-child(3), th:nth-child(2), th:nth-child(3) { text-align: right; }
    .contains { margin-top: 1.5mm; font-size: 8pt; font-weight: 700; }
    .footer { grid-column: 1 / 3; border-top: 0.35mm solid #111; padding-top: 1.3mm; display: grid; grid-template-columns: 1fr auto; gap: 4mm; align-items: end; }
    .expiry { font-size: 11pt; font-weight: 700; text-align: right; }
    .brand { font-size: 7.2pt; font-weight: 700; line-height: 1.18; }
    .haccp { display: inline-block; margin-top: 0.8mm; border: 0.25mm solid #111; padding: 0.35mm 1.1mm; font-size: 7pt; font-weight: 700; letter-spacing: 0; }
  </style>
</head>
<body>
  <main class="label">
    <section class="title">
      <div class="zh">${escapeHtml(product.productNameZh)}</div>
      <div class="en">${escapeHtml(product.productNameEn)}</div>
      <div class="net">NET WT ${Math.round(product.netWeightG)}G</div>
    </section>
    <section class="left">
      <div class="section-title">Ingredients</div>
      <div class="copy">${escapeHtml(product.ingredients.map((ingredient) => ingredient.name).join(', '))}</div>
      <div class="contains">${escapeHtml(formatContains(product.ingredients))}</div>
      <div style="height: 4mm"></div>
      <div class="section-title">Storage Conditions</div>
      <div class="copy">${escapeHtml(product.storageConditions)}</div>
    </section>
    <section class="right">
      <div class="section-title">Nutritional Information</div>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Avg. Quantity<br />Per Serving</th>
            <th>Avg. Quantity<br />Per 100g</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="3">Serving size: ${Math.round(product.servingSizeG)}g &nbsp; Servings per package: ${product.servingsPerPackage}</td></tr>
          ${rows.map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>
    <section class="footer">
      <div class="brand">${escapeHtml(factoryInformation).replace(/\n/g, '<br />')}<br /><span class="haccp">HACCP Certified</span></div>
      <div class="expiry">EXPIRY DATE<br />${escapeHtml(formatDate(data.expiryDate))}</div>
    </section>
  </main>
</body>
</html>`;
}

export function makePdfFileName(product: ProductTemplate, expiryDate: string): string {
  const name = product.productNameEn || 'label';
  return `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${expiryDate}`;
}

function formatDate(date: string): string {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
