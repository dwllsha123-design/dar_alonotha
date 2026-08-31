import {
  COLOR_OPTIONS,
  type ColorGroup,
  type LocalImage,
  type Product,
} from './productTypes';

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function colorHex(name?: string | null) {
  if (!name) return '';
  return COLOR_OPTIONS.find((c) => c.name === name)?.hex || '';
}

export function productRetail(p: Product) {
  return Number(p.retailPrice ?? p.basePrice ?? 0);
}

export function productOriginal(p: Product) {
  const retail = productRetail(p);
  const base = Number(p.basePrice ?? 0);
  return base > retail ? base : retail;
}

export function productSalePercent(p: Product) {
  const original = productOriginal(p);
  const retail = productRetail(p);
  return original > retail && original > 0
    ? Math.round(((original - retail) / original) * 100)
    : 0;
}

export function salePriceFrom(original: number, percent: number) {
  return Math.max(1, Math.round((original * (100 - percent)) / 100));
}

export function emptyColorGroup(color: string): ColorGroup {
  return {
    key: uid(),
    color,
    images: [],
    sizes: [],
    qtyBySize: {},
  };
}

export function makeLocalFromFile(file: File): LocalImage {
  return {
    key: uid(),
    file,
    preview: URL.createObjectURL(file),
  };
}

export function makeLocalFromExisting(img: {
  id: string;
  url: string;
}): LocalImage {
  return {
    key: img.id,
    file: null,
    preview: img.url,
    existingId: img.id,
    existingUrl: img.url,
  };
}

export function revokePreview(img: LocalImage) {
  if (img.file && img.preview.startsWith('blob:')) {
    URL.revokeObjectURL(img.preview);
  }
}

export function revokeAll(images: LocalImage[]) {
  images.forEach(revokePreview);
}

export function variantPreviewRows(groups: ColorGroup[], retailPrice: number) {
  const rows: Array<{ color: string; size: string; qty: number; price: number }> = [];
  for (const g of groups) {
    const sizes = g.sizes.length ? g.sizes : [];
    for (const size of sizes) {
      rows.push({
        color: g.color,
        size,
        qty: Math.max(0, Number(g.qtyBySize[size] || 0)),
        price: retailPrice,
      });
    }
  }
  return rows;
}

export function statusLabelAr(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'ظاهر';
    case 'DRAFT':
      return 'مسودة';
    case 'ARCHIVED':
      return 'مخفي';
    default:
      return status;
  }
}

export function printBarcodes(labels: Array<{ barcode: string }>) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>باركود</title>
  <style>
    body{font-family:Tahoma,sans-serif;padding:16px}
    .label{border:1px dashed #999;padding:12px;margin:0 0 12px;page-break-inside:avoid;text-align:center}
    svg{max-width:100%}
    .code{letter-spacing:2px;margin-top:4px;direction:ltr;unicode-bidi:plaintext}
  </style></head><body>
  ${labels
    .map(
      (l, i) =>
        `<div class="label"><svg id="b${i}"></svg><div class="code">${l.barcode}</div></div>`,
    )
    .join('')}
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    const labels = ${JSON.stringify(labels.map((l) => l.barcode))};
    labels.forEach((code, i) => { try { JsBarcode('#b'+i, code, {format:'CODE128', width:1.6, height:48, displayValue:false}); } catch(e) {} });
    setTimeout(() => window.print(), 400);
  <\/script></body></html>`);
  w.document.close();
}
