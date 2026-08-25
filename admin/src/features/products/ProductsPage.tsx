import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiUpload, money, statusBadgeClass } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { CategoriesPage } from '@/features/products/CategoriesPage';

type ProductImage = { id: string; url: string; isPrimary: boolean; color?: string | null };
type Variant = {
  id: string;
  sku: string;
  barcode?: string | null;
  color?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  retailPrice: number;
  price?: number;
  available?: number;
};
type Product = {
  id: string;
  nameAr: string;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  retailPrice?: string | number;
  basePrice: string | number;
  costPrice?: string | number;
  wholesalePrice?: string | number;
  status: string;
  category?: { id: string; nameAr: string; slug: string } | null;
  images?: ProductImage[];
  variants: Variant[];
};
type VariantDraft = {
  size: string;
  color: string;
  sku: string;
  retailPrice: string;
  imageUrl: string;
  imageFile: File | null;
  quantity: string;
};
type ColorGroup = {
  color: string;
  imageUrl: string;
  imageFile: File | null;
  preview: string;
  sizes: string[];
  qtyBySize: Record<string, string>;
  quantity: string;
};

const emptyVariant = (): VariantDraft => ({
  size: '',
  color: '',
  sku: '',
  retailPrice: '',
  imageUrl: '',
  imageFile: null,
  quantity: '0',
});

function emptyColorGroup(color: string): ColorGroup {
  return {
    color,
    imageUrl: '',
    imageFile: null,
    preview: '',
    sizes: [],
    qtyBySize: {},
    quantity: '0',
  };
}

const SALE_PRESETS = [10, 15, 20, 25, 30, 40, 50];

function productRetail(p: Product) {
  return Number(p.retailPrice ?? p.basePrice ?? 0);
}

function productOriginal(p: Product) {
  const retail = productRetail(p);
  const base = Number(p.basePrice ?? 0);
  return base > retail ? base : retail;
}

function productSalePercent(p: Product) {
  const original = productOriginal(p);
  const retail = productRetail(p);
  return original > retail && original > 0 ? Math.round(((original - retail) / original) * 100) : 0;
}

function salePriceFrom(original: number, percent: number) {
  return Math.max(1, Math.round((original * (100 - percent)) / 100));
}

const SIZE_OPTIONS = [
  { value: 'S', wide: false },
  { value: 'M', wide: false },
  { value: 'L', wide: false },
  { value: 'XL', wide: false },
  { value: '2XL', wide: false },
  { value: '3XL', wide: false },
  { value: '4XL', wide: false },
  { value: '5XL', wide: false },
  { value: 'Big size', wide: true },
  { value: 'Free size', wide: true },
] as const;

const COLOR_OPTIONS = [
  { name: 'أسود', hex: '#1a1a1a', light: false },
  { name: 'أبيض', hex: '#f7f7f7', light: true },
  { name: 'رمادي', hex: '#8a8a8a', light: false },
  { name: 'بيج', hex: '#d8c3a5', light: true },
  { name: 'كريمي', hex: '#f4ead5', light: true },
  { name: 'نود', hex: '#e0b7a0', light: true },
  { name: 'بني', hex: '#6b3f2a', light: false },
  { name: 'ذهبي', hex: '#c9a227', light: true },
  { name: 'فضي', hex: '#c0c0c0', light: true },
  { name: 'أحمر', hex: '#c4392b', light: false },
  { name: 'عنابي', hex: '#7b1e3c', light: false },
  { name: 'وردي', hex: '#e89bb0', light: true },
  { name: 'كحلي', hex: '#1e3a5f', light: false },
  { name: 'أزرق', hex: '#3b6ea5', light: false },
  { name: 'أخضر', hex: '#3d7a5a', light: false },
  { name: 'زيتي', hex: '#6b6e3a', light: false },
  { name: 'بنفسجي', hex: '#6b4c8a', light: false },
  { name: 'برتقالي', hex: '#d96c2c', light: false },
  { name: 'أصفر', hex: '#e4c44a', light: true },
  {
    name: 'ملون',
    hex: 'conic-gradient(#c4392b, #e4c44a, #3d7a5a, #3b6ea5, #6b4c8a, #c4392b)',
    light: false,
  },
] as const;

function colorHex(name?: string | null) {
  if (!name) return '';
  return COLOR_OPTIONS.find((c) => c.name === name)?.hex || '';
}

function toggleValue(current: string, next: string) {
  return current === next ? '' : next;
}

function SizePicker({
  value,
  values,
  multi,
  onChange,
  onToggle,
}: {
  value?: string;
  values?: string[];
  multi?: boolean;
  onChange?: (size: string) => void;
  onToggle?: (size: string) => void;
}) {
  const selected = multi ? values || [] : value ? [value] : [];
  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 13 }}>المقاس</div>
      <div className="size-pills" role="listbox" aria-label="المقاس">
        {SIZE_OPTIONS.map((s) => {
          const on = selected.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              className={`size-pill${s.wide ? ' wide' : ''}${on ? ' active' : ''}`}
              aria-pressed={on}
              onClick={() =>
                multi ? onToggle?.(s.value) : onChange?.(toggleValue(value || '', s.value))
              }
            >
              {s.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  values,
  multi,
  onChange,
  onToggle,
}: {
  value?: string;
  values?: string[];
  multi?: boolean;
  onChange?: (color: string) => void;
  onToggle?: (color: string) => void;
}) {
  const selected = multi ? values || [] : value ? [value] : [];
  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 13 }}>
        اللون{!multi && value ? ` — ${value}` : multi ? ' — اختاري لوناً أو أكثر' : ''}
      </div>
      <div className="color-swatches" role="listbox" aria-label="اللون">
        {COLOR_OPTIONS.map((c) => {
          const on = selected.includes(c.name);
          return (
            <button
              key={c.name}
              type="button"
              title={c.name}
              aria-label={c.name}
              aria-pressed={on}
              className={`color-swatch${c.light ? ' light' : ''}${on ? ' active' : ''}`}
              style={{ background: c.hex }}
              onClick={() =>
                multi ? onToggle?.(c.name) : onChange?.(toggleValue(value || '', c.name))
              }
            >
              {on ? <span className="tick">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function printBarcodes(
  labels: Array<{ barcode: string; productName: string; sku: string; size?: string | null; color?: string | null }>,
) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>باركود</title>
  <style>
    body{font-family:Tahoma,sans-serif;padding:16px}
    .label{border:1px dashed #999;padding:12px;margin:0 0 12px;page-break-inside:avoid;text-align:center}
    .name{font-weight:700;margin-bottom:4px}
    .meta{color:#555;font-size:12px;margin-bottom:8px}
    svg{max-width:100%}
  </style></head><body>
  ${labels
    .map(
      (l, i) =>
        `<div class="label"><div class="name">${l.productName}</div>
         <div class="meta">${[l.color, l.size, l.sku].filter(Boolean).join(' · ')}</div>
         <svg id="b${i}"></svg><div style="letter-spacing:2px;margin-top:4px">${l.barcode}</div></div>`,
    )
    .join('')}
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script>
    const labels = ${JSON.stringify(labels.map((l) => l.barcode))};
    labels.forEach((code, i) => { try { JsBarcode('#b'+i, code, {format:'CODE128', width:1.6, height:48, displayValue:false}); } catch(e) {} });
    setTimeout(() => window.print(), 400);
  </script></body></html>`);
  w.document.close();
}

export function ProductsPage() {
  const { isOwner, hasPermission } = useAuth();
  const canSeeCost = isOwner || hasPermission('products.edit') || hasPermission('settings.manage');
  const canCreate = hasPermission('products.create') || isOwner;
  const canEdit = hasPermission('products.edit') || isOwner;
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [retailPrice, setRetailPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [newVar, setNewVar] = useState<VariantDraft>(emptyVariant());
  const [imageUrl, setImageUrl] = useState('');
  const [imageColor, setImageColor] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productStatus, setProductStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [saveBusy, setSaveBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [salePercent, setSalePercent] = useState(20);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'categories' ? 'categories' : 'products';

  async function load() {
    const data = await api<Product[]>('/products');
    setProducts(data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function openSale(p: Product, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    setSaleProduct(p);
    setSalePercent(productSalePercent(p) || 20);
    setSaleError('');
  }

  async function saveSale(percent: number) {
    if (!saleProduct) return;
    setSaleBusy(true);
    setSaleError('');
    try {
      await api(`/products/${saleProduct.id}/discount`, {
        method: 'POST',
        body: JSON.stringify({ percent }),
      });
      setSaleProduct(null);
      await load();
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : 'تعذر تطبيق التخفيض');
    } finally {
      setSaleBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) =>
      [p.nameAr, p.brand, p.sku, ...p.variants.map((v) => v.sku), ...p.variants.map((v) => v.barcode)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [products, q]);

  const activeCount = products.filter((p) => p.status === 'ACTIVE').length;
  const colSpan = 6 + (isOwner ? 1 : 0) + (canSeeCost ? 1 : 0);

  function resetForm() {
    setEditingId(null);
    setProductStatus('ACTIVE');
    setNameAr('');
    setDescription('');
    setRetailPrice(0);
    setWholesalePrice('');
    setCostPrice('');
    setSku('');
    setBrand('');
    setImageUrls('');
    setPendingFiles([]);
    setColorGroups([]);
  }

  function cancelForm() {
    resetForm();
    setShowCreate(false);
  }

  function startEdit(p: Product, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    setEditingId(p.id);
    setProductStatus((p.status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED') || 'ACTIVE');
    setNameAr(p.nameAr);
    setDescription(p.description || '');
    setRetailPrice(productRetail(p));
    setWholesalePrice(p.wholesalePrice != null && p.wholesalePrice !== '' ? Number(p.wholesalePrice) : '');
    setCostPrice(p.costPrice != null && p.costPrice !== '' ? Number(p.costPrice) : '');
    setSku(p.sku || '');
    setBrand(p.brand || '');
    setImageUrls('');
    setPendingFiles([]);
    setColorGroups([]);
    setShowCreate(true);
    setOpenId(p.id);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleColorGroup(color: string) {
    setColorGroups((prev) =>
      prev.some((g) => g.color === color)
        ? prev.filter((g) => g.color !== color)
        : [...prev, emptyColorGroup(color)],
    );
  }

  function updateColorGroup(color: string, patch: Partial<ColorGroup>) {
    setColorGroups((prev) => prev.map((g) => (g.color === color ? { ...g, ...patch } : g)));
  }

  function toggleGroupSize(color: string, size: string) {
    setColorGroups((prev) =>
      prev.map((g) => {
        if (g.color !== color) return g;
        const sizes = g.sizes.includes(size)
          ? g.sizes.filter((s) => s !== size)
          : [...g.sizes, size];
        const qtyBySize = { ...g.qtyBySize };
        if (!qtyBySize[size]) qtyBySize[size] = g.quantity || '0';
        return { ...g, sizes, qtyBySize };
      }),
    );
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaveBusy(true);
    try {
      if (editingId) {
        await api(`/products/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nameAr,
            description: description || undefined,
            retailPrice,
            wholesalePrice: isOwner && wholesalePrice !== '' ? Number(wholesalePrice) : undefined,
            costPrice: canSeeCost && costPrice !== '' ? Number(costPrice) : undefined,
            brand: brand || undefined,
            status: productStatus,
          }),
        });
        for (const file of pendingFiles) {
          await apiUpload(`/products/${editingId}/images/upload`, file);
        }
        setNotice('تم حفظ التغييرات');
        const keptId = editingId;
        resetForm();
        setShowCreate(false);
        await load();
        setOpenId(keptId);
        return;
      }

      const variantPayload = colorGroups.flatMap((g) => {
        const sizes = g.sizes.length ? g.sizes : [''];
        return sizes.map((size) => ({
          color: g.color,
          size: size || undefined,
          imageUrl: g.imageUrl || undefined,
          quantity: Number((size ? g.qtyBySize[size] : g.quantity) || 0),
          retailPrice: Number(retailPrice || 0),
        }));
      });
      const created = await api<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          nameAr,
          description: description || undefined,
          retailPrice,
          wholesalePrice: isOwner && wholesalePrice !== '' ? Number(wholesalePrice) : undefined,
          costPrice: canSeeCost && costPrice !== '' ? Number(costPrice) : undefined,
          sku: sku || undefined,
          brand: brand || undefined,
          imageUrls: imageUrls
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          variants: variantPayload.length ? variantPayload : undefined,
        }),
      });
      for (const file of pendingFiles) {
        await apiUpload(`/products/${created.id}/images/upload`, file);
      }
      for (const g of colorGroups) {
        if (!g.imageFile) continue;
        await apiUpload(
          `/products/${created.id}/images/upload?color=${encodeURIComponent(g.color)}`,
          g.imageFile,
        );
      }
      resetForm();
      setShowCreate(false);
      await load();
      setOpenId(created.id);
      setNotice('تم حفظ المنتج');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setSaveBusy(false);
    }
  }

  async function removeProduct(p: Product, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    if (
      !window.confirm(
        `حذف «${p.nameAr}» من المتجر؟ إن كان مرتبطاً بطلبات سابقة سيُخفى فقط ويبقى في السجلات.`,
      )
    ) {
      return;
    }
    setError('');
    setNotice('');
    setDeletingId(p.id);
    try {
      const res = await api<{ ok: boolean; archived?: boolean }>(`/products/${p.id}`, {
        method: 'DELETE',
      });
      if (editingId === p.id) cancelForm();
      await load();
      setNotice(
        res.archived
          ? `تم إخفاء «${p.nameAr}» من المتجر لأنه مرتبط بطلبات أو تحويلات مخزون`
          : `تم حذف «${p.nameAr}»`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المنتج');
    } finally {
      setDeletingId(null);
    }
  }

  async function generateBarcode(variantId: string) {
    setError('');
    try {
      await api(`/barcodes/variants/${variantId}/generate`, { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إصدار الباركود');
    }
  }

  async function generateMissing() {
    setError('');
    try {
      const res = await api<{ count: number }>('/barcodes/variants/generate-missing', {
        method: 'POST',
        body: '{}',
      });
      await load();
      alert(`تم إصدار ${res.count} باركود`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الإصدار');
    }
  }

  async function addSize(productId: string) {
    if (!newVar.size && !newVar.color) {
      setError('اختاري المقاس أو اللون');
      return;
    }
    setError('');
    const product = products.find((p) => p.id === productId);
    const created = await api<Variant>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify({
        size: newVar.size || undefined,
        color: newVar.color || undefined,
        sku: newVar.sku || undefined,
        imageUrl: newVar.imageUrl || undefined,
        quantity: Number(newVar.quantity || 0),
        retailPrice: Number(newVar.retailPrice || product?.retailPrice || 0),
      }),
    });
    if (newVar.imageFile && (newVar.color || created?.id)) {
      await apiUpload(
        `/products/${productId}/images/upload${newVar.color ? `?color=${encodeURIComponent(newVar.color)}` : ''}`,
        newVar.imageFile,
      );
    }
    setNewVar(emptyVariant());
    await load();
  }

  async function uploadToProduct(productId: string, file: File, color?: string) {
    const qs = color ? `?color=${encodeURIComponent(color)}` : '';
    await apiUpload(`/products/${productId}/images/upload${qs}`, file);
    await load();
  }

  async function addImageLink(productId: string) {
    if (!imageUrl.trim()) return;
    await api(`/products/${productId}/images`, {
      method: 'POST',
      body: JSON.stringify({
        url: imageUrl.trim(),
        color: imageColor || undefined,
      }),
    });
    setImageUrl('');
    setImageColor('');
    await load();
  }

  async function removeImage(productId: string, imageId: string) {
    await api(`/products/${productId}/images/${imageId}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>إدارة المنتجات</h1>
          <p>
            {tab === 'categories'
              ? 'أضيفي الفئات والتصنيفات ورتّبيها — تظهر في المتجر فوراً.'
              : 'من هنا تضيفين منتجاتك: الألوان بصورها، المقاسات، المخزون، والباركود الفريد لكل لون/مقاس.'}
          </p>
        </div>
        {tab === 'products' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canEdit ? (
              <button className="btn secondary" type="button" onClick={() => void generateMissing()}>
                إصدار باركود للناقص
              </button>
            ) : null}
            {canCreate ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (showCreate && !editingId) {
                    cancelForm();
                    return;
                  }
                  resetForm();
                  setShowCreate(true);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  add
                </span>
                {showCreate && !editingId ? 'إخفاء النموذج' : 'إضافة منتج'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="page-tabs" role="tablist" aria-label="أقسام المنتجات">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'products'}
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setParams({})}
        >
          المنتجات
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'categories'}
          className={tab === 'categories' ? 'active' : ''}
          onClick={() => setParams({ tab: 'categories' })}
        >
          التصنيفات
        </button>
      </div>

      {tab === 'categories' ? <CategoriesPage embedded /> : null}

      {tab === 'products' ? (
        <>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">إجمالي المنتجات</div>
          <div className="stat-value">{products.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">نشط</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">المقاسات / المتغيرات</div>
          <div className="stat-value">{products.reduce((n, p) => n + (p.variants?.length || 0), 0)}</div>
        </div>
      </div>

      {showCreate ? (
        <form className="panel form-grid two" onSubmit={(e) => void onSave(e)}>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>{editingId ? 'تعديل المنتج' : 'منتج جديد'}</strong>
            {editingId ? (
              <p className="muted" style={{ margin: '6px 0 0' }}>
                غيّري البيانات ثم اضغطي «حفظ التغييرات». الألوان والمقاسات تُدار من صف المنتج في القائمة.
              </p>
            ) : null}
          </div>
          <label>
            اسم المنتج
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            الوصف
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <label>
            سعر البيع د.ل
            <input
              type="number"
              value={retailPrice}
              onChange={(e) => setRetailPrice(Number(e.target.value))}
              required
            />
          </label>
          {isOwner ? (
            <label>
              سعر الجملة
              <input
                type="number"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
          ) : null}
          {canSeeCost ? (
            <label>
              سعر التكلفة
              <input
                type="number"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
          ) : null}
          <label>
            {editingId ? 'SKU' : 'SKU (اختياري — يُولَّد DA-xxxx تلقائياً)'}
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="اتركيه فارغاً للتوليد التلقائي"
              disabled={Boolean(editingId)}
            />
          </label>
          <label>
            العلامة
            <input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          {editingId ? (
            <label>
              الظهور في المتجر
              <select
                value={productStatus}
                onChange={(e) =>
                  setProductStatus(e.target.value as 'DRAFT' | 'ACTIVE' | 'ARCHIVED')
                }
              >
                <option value="ACTIVE">ظاهر في المتجر</option>
                <option value="DRAFT">مسودة</option>
                <option value="ARCHIVED">مخفي</option>
              </select>
            </label>
          ) : null}
          <label style={{ gridColumn: '1 / -1' }}>
            صور المنتج — الأفضل 1200×1500 (عمودي 4:5). أي صورة تُقصّ وتُحفظ WebP بهذا المقاس للمتجر.
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
            />
            {pendingFiles.length ? (
              <span style={{ fontSize: 12 }}>{pendingFiles.length} صورة جاهزة للرفع بعد الحفظ</span>
            ) : null}
          </label>
          {editingId ? null : (
          <label style={{ gridColumn: '1 / -1' }}>
            أو روابط صور (كل رابط في سطر)
            <textarea
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              rows={3}
              placeholder="https://..."
            />
          </label>
          )}
          {editingId ? null : (
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>الألوان والمقاسات والمخزون</strong>
            <p style={{ margin: '6px 0 10px', fontSize: 13 }}>
              اختاري الألوان. لكل لون صورة مستقلة وكمية مخزون وباركود يُولَّد تلقائياً. إن اخترتِ عدة مقاسات يُنشأ صف لكل مقاس تحت نفس اللون.
            </p>
            <ColorPicker
              multi
              values={colorGroups.map((g) => g.color)}
              onToggle={toggleColorGroup}
            />
            {colorGroups.map((g) => (
              <div key={g.color} className="variant-block">
                <div className="variant-block-head">
                  <span className="color-chip">
                    <span className="color-dot" style={{ background: colorHex(g.color) || '#ccc' }} />
                    {g.color}
                  </span>
                  <button className="btn ghost" type="button" onClick={() => toggleColorGroup(g.color)}>
                    حذف اللون
                  </button>
                </div>
                <div className="color-image-row">
                  {g.preview || g.imageUrl ? (
                    <img
                      className="color-image-preview"
                      src={g.preview || g.imageUrl}
                      alt={g.color}
                    />
                  ) : (
                    <div className="color-image-preview placeholder">بدون صورة</div>
                  )}
                  <div className="form-grid" style={{ flex: 1 }}>
                    <label>
                      صورة هذا اللون — تُحفظ 1200×1500 WebP تلقائياً
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          updateColorGroup(g.color, {
                            imageFile: file,
                            preview: file ? URL.createObjectURL(file) : '',
                          });
                        }}
                      />
                    </label>
                    <label>
                      أو رابط صورة هذا اللون
                      <input
                        value={g.imageUrl}
                        placeholder="https://..."
                        onChange={(e) => updateColorGroup(g.color, { imageUrl: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
                <SizePicker
                  multi
                  values={g.sizes}
                  onToggle={(size) => toggleGroupSize(g.color, size)}
                />
                {g.sizes.length ? (
                  <div className="form-grid two">
                    {g.sizes.map((size) => (
                      <label key={size}>
                        مخزون {g.color} / {size}
                        <input
                          type="number"
                          min={0}
                          value={g.qtyBySize[size] ?? '0'}
                          onChange={(e) =>
                            updateColorGroup(g.color, {
                              qtyBySize: { ...g.qtyBySize, [size]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <label>
                    مخزون هذا اللون (بدون تمييز مقاس)
                    <input
                      type="number"
                      min={0}
                      value={g.quantity}
                      onChange={(e) => updateColorGroup(g.color, { quantity: e.target.value })}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={saveBusy}>
              {saveBusy
                ? 'جارٍ الحفظ...'
                : editingId
                  ? 'حفظ التغييرات'
                  : 'حفظ المنتج وإصدار الباركود'}
            </button>
            <button className="btn secondary" type="button" disabled={saveBusy} onClick={cancelForm}>
              إلغاء
            </button>
          </div>
        </form>
      ) : null}

      {notice ? <div className="success">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="panel">
        <div className="toolbar">
          <strong>قائمة المنتجات</strong>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو SKU أو الباركود..."
            style={{ minWidth: 240, height: 36, padding: '0 12px' }}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>التصنيف</th>
                <th>البيع</th>
                {isOwner ? <th>الجملة</th> : null}
                {canSeeCost ? <th>التكلفة</th> : null}
                <th>المقاسات</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <Fragment key={p.id}>
                  <tr
                    style={{
                      cursor: 'pointer',
                      background: editingId === p.id ? 'rgba(201, 162, 39, 0.12)' : undefined,
                    }}
                    onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  >
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {p.images?.[0]?.url ? (
                          <img
                            src={p.images[0].url}
                            alt=""
                            width={40}
                            height={50}
                            style={{ objectFit: 'cover', borderRadius: 6 }}
                          />
                        ) : null}
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.nameAr}</div>
                          <div style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>{p.brand}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.category?.nameAr || '—'}</td>
                    <td>
                      {productSalePercent(p) > 0 ? (
                        <div>
                          <div style={{ textDecoration: 'line-through', opacity: 0.55, fontSize: 12 }}>
                            {money(productOriginal(p))}
                          </div>
                          <div style={{ fontWeight: 800 }}>
                            {money(productRetail(p))}{' '}
                            <span className="badge warning">خصم {productSalePercent(p)}%</span>
                          </div>
                        </div>
                      ) : (
                        money(p.retailPrice ?? p.basePrice)
                      )}
                    </td>
                    {isOwner ? <td>{p.wholesalePrice != null ? money(p.wholesalePrice) : '—'}</td> : null}
                    {canSeeCost ? <td>{p.costPrice != null ? money(p.costPrice) : '—'}</td> : null}
                    <td>{p.variants.length}</td>
                    <td>
                      <span className={statusBadgeClass(p.status)}>
                        {p.status === 'ACTIVE'
                          ? 'ظاهر'
                          : p.status === 'ARCHIVED'
                            ? 'مخفي'
                            : p.status === 'DRAFT'
                              ? 'مسودة'
                              : p.status}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div
                          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" className="btn sm" onClick={(e) => startEdit(p, e)}>
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="btn sm danger"
                            disabled={deletingId === p.id}
                            onClick={(e) => void removeProduct(p, e)}
                          >
                            {deletingId === p.id ? 'جارٍ الحذف...' : 'حذف'}
                          </button>
                          <button type="button" className="btn sm secondary" onClick={(e) => openSale(p, e)}>
                            تخفيض
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                  {openId === p.id ? (
                    <tr key={`${p.id}-d`}>
                      <td colSpan={colSpan}>
                        <div style={{ display: 'grid', gap: 14 }}>
                          {canEdit ? (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <button type="button" className="btn" onClick={(e) => startEdit(p, e)}>
                                تعديل المنتج
                              </button>
                              <button type="button" className="btn" onClick={(e) => openSale(p, e)}>
                                تخفيض على هذا المنتج
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                disabled={deletingId === p.id}
                                onClick={(e) => void removeProduct(p, e)}
                              >
                                {deletingId === p.id ? 'جارٍ الحذف...' : 'حذف المنتج'}
                              </button>
                              {productSalePercent(p) > 0 ? (
                                <span className="muted">
                                  يظهر في المتجر الآن: {money(productRetail(p))} بدل {money(productOriginal(p))} (خصم{' '}
                                  {productSalePercent(p)}%)
                                </span>
                              ) : (
                                <span className="muted">اضغطي تخفيض، اختاري النسبة، وستظهر للزبونة فوراً</span>
                              )}
                            </div>
                          ) : null}
                          <div>
                            <strong>الصور</strong>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                              {(p.images || []).map((img) => (
                                <div key={img.id} style={{ position: 'relative' }}>
                                  <img
                                    src={img.url}
                                    alt={img.color || ''}
                                    width={72}
                                    height={90}
                                    style={{ objectFit: 'cover', borderRadius: 8 }}
                                  />
                                  {img.color ? (
                                    <div style={{ fontSize: 12, marginTop: 4 }}>{img.color}</div>
                                  ) : (
                                    <div style={{ fontSize: 12, marginTop: 4, color: 'var(--on-surface-variant)' }}>
                                      عامة
                                    </div>
                                  )}
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      className="btn ghost"
                                      style={{ display: 'block', marginTop: 4, padding: '2px 8px' }}
                                      onClick={() => void removeImage(p.id, img.id)}
                                    >
                                      حذف
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            {canEdit ? (
                              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  title="تُحفظ 1200×1500 WebP"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void uploadToProduct(p.id, f, imageColor || undefined);
                                  }}
                                />
                                <select
                                  value={imageColor}
                                  onChange={(e) => setImageColor(e.target.value)}
                                  style={{ minWidth: 140 }}
                                >
                                  <option value="">صورة عامة</option>
                                  {COLOR_OPTIONS.map((c) => (
                                    <option key={c.name} value={c.name}>
                                      لون: {c.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="رابط صورة"
                                  value={imageUrl}
                                  onChange={(e) => setImageUrl(e.target.value)}
                                />
                                <button className="btn secondary" type="button" onClick={() => void addImageLink(p.id)}>
                                  إضافة رابط
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div>
                            <strong>المتغيرات — مخزون وباركود لكل لون/مقاس</strong>
                            <table>
                              <thead>
                                <tr>
                                  <th>صورة</th>
                                  <th>المقاس</th>
                                  <th>اللون</th>
                                  <th>SKU</th>
                                  <th>المخزون</th>
                                  <th>السعر</th>
                                  <th>الباركود</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.variants.map((v) => (
                                  <tr key={v.id}>
                                    <td>
                                      {v.imageUrl ? (
                                        <img
                                          src={v.imageUrl}
                                          alt={v.color || ''}
                                          width={36}
                                          height={46}
                                          style={{ objectFit: 'cover', borderRadius: 6 }}
                                        />
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                    <td>{v.size || '—'}</td>
                                    <td>
                                      {v.color ? (
                                        <span className="color-chip">
                                          {colorHex(v.color) ? (
                                            <span
                                              className="color-dot"
                                              style={{ background: colorHex(v.color) }}
                                            />
                                          ) : null}
                                          {v.color}
                                        </span>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                    <td>{v.sku}</td>
                                    <td>{v.available ?? '—'}</td>
                                    <td>{money(v.retailPrice ?? v.price ?? 0)}</td>
                                    <td>
                                      <code>{v.barcode || '—'}</code>
                                    </td>
                                    <td>
                                      {canEdit && !v.barcode ? (
                                        <button
                                          className="btn ghost"
                                          type="button"
                                          onClick={() => void generateBarcode(v.id)}
                                        >
                                          إصدار باركود
                                        </button>
                                      ) : v.barcode ? (
                                        <button
                                          className="btn ghost"
                                          type="button"
                                          onClick={() =>
                                            printBarcodes([
                                              {
                                                barcode: v.barcode as string,
                                                productName: p.nameAr,
                                                sku: v.sku,
                                                size: v.size,
                                                color: v.color,
                                              },
                                            ])
                                          }
                                        >
                                          طباعة
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {canEdit ? (
                              <div className="variant-block" style={{ marginTop: 10 }}>
                                <ColorPicker
                                  value={newVar.color}
                                  onChange={(color) => setNewVar((x) => ({ ...x, color }))}
                                />
                                <SizePicker
                                  value={newVar.size}
                                  onChange={(size) => setNewVar((x) => ({ ...x, size }))}
                                />
                                <div className="color-image-row">
                                  {newVar.imageFile ? (
                                    <img
                                      className="color-image-preview"
                                      src={URL.createObjectURL(newVar.imageFile)}
                                      alt=""
                                    />
                                  ) : newVar.imageUrl ? (
                                    <img className="color-image-preview" src={newVar.imageUrl} alt="" />
                                  ) : null}
                                  <div className="form-grid" style={{ flex: 1 }}>
                                    <label>
                                      صورة اللون
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) =>
                                          setNewVar((x) => ({
                                            ...x,
                                            imageFile: e.target.files?.[0] || null,
                                          }))
                                        }
                                      />
                                    </label>
                                    <label>
                                      أو رابط الصورة
                                      <input
                                        value={newVar.imageUrl}
                                        onChange={(e) => setNewVar((x) => ({ ...x, imageUrl: e.target.value }))}
                                      />
                                    </label>
                                  </div>
                                </div>
                                <div className="form-grid two">
                                  <label>
                                    الكمية الابتدائية
                                    <input
                                      placeholder="مخزون هذا اللون/المقاس"
                                      type="number"
                                      min={0}
                                      value={newVar.quantity}
                                      onChange={(e) => setNewVar((x) => ({ ...x, quantity: e.target.value }))}
                                    />
                                  </label>
                                  <label>
                                    السعر
                                    <input
                                      placeholder="سعر هذا المقاس"
                                      type="number"
                                      value={newVar.retailPrice}
                                      onChange={(e) => setNewVar((x) => ({ ...x, retailPrice: e.target.value }))}
                                    />
                                  </label>
                                </div>
                                <button className="btn secondary" type="button" onClick={() => void addSize(p.id)}>
                                  إضافة اللون/المقاس + باركود ومخزون
                                </button>
                              </div>
                            ) : null}
                            {p.variants.some((v) => v.barcode) ? (
                              <button
                                className="btn"
                                type="button"
                                style={{ marginTop: 8 }}
                                onClick={() =>
                                  printBarcodes(
                                    p.variants
                                      .filter((v) => v.barcode)
                                      .map((v) => ({
                                        barcode: v.barcode as string,
                                        productName: p.nameAr,
                                        sku: v.sku,
                                        size: v.size,
                                        color: v.color,
                                      })),
                                  )
                                }
                              >
                                طباعة كل الباركود
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={colSpan} className="empty">
                    لا توجد منتجات — اضغطي «إضافة منتج»
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {saleProduct ? (
        <div className="size-editor-overlay" role="dialog" aria-label="تخفيض المنتج">
          <div className="size-editor">
            <div className="size-editor-head">
              <strong>تخفيض سريع</strong>
              <span className="muted">{saleProduct.nameAr}</span>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              اختاري النسبة. السعر الأصلي يبقى ظاهراً مشطوباً في المتجر، والسعر الجديد هو سعر البيع.
            </p>
            {saleError ? <p className="error">{saleError}</p> : null}
            <div className="size-pills" style={{ marginBottom: 14 }}>
              {SALE_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`size-pill${salePercent === pct ? ' active' : ''}`}
                  onClick={() => setSalePercent(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <label>
              أو اكتبي النسبة
              <input
                type="number"
                min={0}
                max={90}
                value={salePercent}
                onChange={(e) => setSalePercent(Math.min(90, Math.max(0, Number(e.target.value) || 0)))}
              />
            </label>
            <div className="panel" style={{ marginTop: 14, padding: 14 }}>
              <div className="muted">السعر الأصلي</div>
              <div style={{ textDecoration: salePercent > 0 ? 'line-through' : undefined }}>
                {money(productOriginal(saleProduct))}
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                سعر الزبونة بعد الخصم
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {salePercent > 0
                  ? money(salePriceFrom(productOriginal(saleProduct), salePercent))
                  : money(productOriginal(saleProduct))}
                {salePercent > 0 ? `  (−${salePercent}%)` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button
                className="btn"
                type="button"
                disabled={saleBusy || salePercent <= 0}
                onClick={() => void saveSale(salePercent)}
              >
                {saleBusy ? 'جارٍ الحفظ...' : 'تطبيق التخفيض'}
              </button>
              {productSalePercent(saleProduct) > 0 ? (
                <button
                  className="btn secondary"
                  type="button"
                  disabled={saleBusy}
                  onClick={() => void saveSale(0)}
                >
                  إلغاء التخفيض
                </button>
              ) : null}
              <button className="btn ghost" type="button" disabled={saleBusy} onClick={() => setSaleProduct(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
