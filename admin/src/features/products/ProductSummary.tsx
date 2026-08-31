import { money } from '@/api/client';
import type { ColorGroup, LocalImage } from './productTypes';
import { salePriceFrom, variantPreviewRows } from './productUtils';

type Props = {
  nameAr: string;
  categoryName?: string;
  retailPrice: number;
  discountPercent: number;
  generalImages: LocalImage[];
  colorGroups: ColorGroup[];
  saveBusy: boolean;
  onDraft: () => void;
  onPublish: () => void;
  onCancel: () => void;
  isEdit?: boolean;
};

export function ProductSummary({
  nameAr,
  categoryName,
  retailPrice,
  discountPercent,
  generalImages,
  colorGroups,
  saveBusy,
  onDraft,
  onPublish,
  onCancel,
  isEdit,
}: Props) {
  const variants = variantPreviewRows(colorGroups, retailPrice);
  const colorCount = colorGroups.length;
  const sizeCount = new Set(colorGroups.flatMap((g) => g.sizes)).size;
  const imageCount =
    generalImages.length + colorGroups.reduce((n, g) => n + g.images.length, 0);
  const stockTotal = variants.reduce((n, r) => n + r.qty, 0);
  const afterDiscount =
    discountPercent > 0 ? salePriceFrom(retailPrice, discountPercent) : retailPrice;

  return (
    <div className="pf-card pf-summary">
      <h3>ملخص قبل الحفظ</h3>
      <div className="pf-summary-grid">
        <div>
          <span className="muted">المنتج</span>
          <strong>{nameAr || '—'}</strong>
        </div>
        <div>
          <span className="muted">الفئة</span>
          <strong>{categoryName || '—'}</strong>
        </div>
        <div>
          <span className="muted">الألوان</span>
          <strong>{colorCount}</strong>
        </div>
        <div>
          <span className="muted">الصور</span>
          <strong>{imageCount}</strong>
        </div>
        <div>
          <span className="muted">المقاسات</span>
          <strong>{sizeCount}</strong>
        </div>
        <div>
          <span className="muted">المتغيرات</span>
          <strong>{variants.length}</strong>
        </div>
        <div>
          <span className="muted">السعر</span>
          <strong>{money(retailPrice)}</strong>
        </div>
        <div>
          <span className="muted">الخصم</span>
          <strong>
            {discountPercent > 0
              ? `${discountPercent}% → ${money(afterDiscount)}`
              : 'لا يوجد'}
          </strong>
        </div>
        <div>
          <span className="muted">إجمالي المخزون</span>
          <strong>{stockTotal}</strong>
        </div>
      </div>
      <div className="pf-summary-actions">
        <button type="button" className="btn secondary" disabled={saveBusy} onClick={onCancel}>
          إلغاء
        </button>
        <button type="button" className="btn secondary" disabled={saveBusy} onClick={onDraft}>
          {saveBusy ? 'جارٍ الحفظ...' : isEdit ? 'حفظ كمسودة' : 'حفظ كمسودة'}
        </button>
        <button type="button" className="btn" disabled={saveBusy} onClick={onPublish}>
          {saveBusy ? 'جارٍ الحفظ...' : isEdit ? 'حفظ ونشر' : 'نشر المنتج'}
        </button>
      </div>
    </div>
  );
}
