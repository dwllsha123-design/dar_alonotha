import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, money, statusBadgeClass } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { CategoriesPage } from '@/features/products/CategoriesPage';
import { ProductForm } from '@/features/products/ProductForm';
import type { CategoryRow, Product } from '@/features/products/productTypes';
import {
  colorHex,
  printBarcodes,
  productOriginal,
  productRetail,
  productSalePercent,
  salePriceFrom,
  statusLabelAr,
} from '@/features/products/productUtils';

export function ProductsPage() {
  const { isOwner, hasPermission } = useAuth();
  const canSeeCost = isOwner || hasPermission('products.edit') || hasPermission('settings.manage');
  const canCreate = hasPermission('products.create') || isOwner;
  const canEdit = hasPermission('products.edit') || isOwner;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [filterPrice, setFilterPrice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [salePercent, setSalePercent] = useState(20);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'categories' ? 'categories' : 'products';

  async function load() {
    const [data, cats] = await Promise.all([
      api<Product[]>('/products'),
      api<CategoryRow[]>('/categories').catch(() => [] as CategoryRow[]),
    ]);
    setProducts(data);
    setCategories(cats.filter((c) => c.isActive));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const term = q.trim().toLowerCase();
      if (term) {
        const hit = [
          p.nameAr,
          p.sku,
          ...p.variants.map((v) => v.sku),
          ...p.variants.map((v) => v.barcode),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
        if (!hit) return false;
      }
      if (filterCategory) {
        const catId = p.category?.id;
        const parentId = p.category?.parentId;
        if (catId !== filterCategory && parentId !== filterCategory) return false;
      }
      if (filterStatus && p.status !== filterStatus) return false;
      const stock = p.variants.reduce((n, v) => n + (v.available || 0), 0);
      if (filterStock === 'in' && stock <= 0) return false;
      if (filterStock === 'out' && stock > 0) return false;
      const price = productRetail(p);
      if (filterPrice === 'lt50' && !(price < 50)) return false;
      if (filterPrice === '50to150' && !(price >= 50 && price <= 150)) return false;
      if (filterPrice === 'gt150' && !(price > 150)) return false;
      return true;
    });
  }, [products, q, filterCategory, filterStatus, filterStock, filterPrice]);

  const activeCount = products.filter((p) => p.status === 'ACTIVE').length;

  function openCreate() {
    setEditing(null);
    setShowForm(true);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openEdit(p: Product, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    setEditing(p);
    setShowForm(true);
    setOpenId(p.id);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function archiveOrDelete(p: Product, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    if (!window.confirm(`حذف أو أرشفة «${p.nameAr}»؟`)) return;
    setDeletingId(p.id);
    setError('');
    try {
      const res = await api<{ ok: boolean; archived?: boolean }>(`/products/${p.id}`, {
        method: 'DELETE',
      });
      if (editing?.id === p.id) {
        setShowForm(false);
        setEditing(null);
      }
      await load();
      setNotice(res.archived ? 'تم إخفاء المنتج (أرشفة)' : 'تم حذف المنتج');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    } finally {
      setDeletingId(null);
    }
  }

  async function archiveOnly(p: Product, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    try {
      await api(`/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
      await load();
      setNotice('تم أرشفة المنتج');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الأرشفة');
    }
  }

  async function generateBarcode(variantId: string) {
    await api(`/barcodes/variants/${variantId}/generate`, { method: 'POST', body: '{}' });
    await load();
    setNotice('تم إصدار الباركود');
  }

  async function generateMissing() {
    const res = await api<{ count: number }>('/barcodes/variants/generate-missing', {
      method: 'POST',
      body: '{}',
    });
    await load();
    setNotice(`تم إصدار ${res.count} باركود للناقص`);
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
      setNotice('تم تطبيق التخفيض');
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : 'تعذر تطبيق التخفيض');
    } finally {
      setSaleBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>إدارة المنتجات</h1>
          <p>
            {tab === 'categories'
              ? 'أضيفي الفئات والتصنيفات ورتّبيها — تظهر في المتجر فوراً.'
              : 'أضيفي المنتج بخطوات واضحة: بيانات، صور، ألوان، مقاسات، ثم نشر.'}
          </p>
        </div>
        {tab === 'products' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canEdit ? (
              <button className="btn secondary" type="button" onClick={() => void generateMissing()}>
                إصدار للناقص
              </button>
            ) : null}
            {canCreate ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (showForm && !editing?.id) {
                    setShowForm(false);
                    setEditing(null);
                    return;
                  }
                  openCreate();
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  add
                </span>
                {showForm && !editing?.id ? 'إخفاء النموذج' : 'إضافة منتج'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="page-tabs" role="tablist" aria-label="أقسام المنتجات">
        <button
          type="button"
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setParams({})}
        >
          المنتجات
        </button>
        <button
          type="button"
          className={tab === 'categories' ? 'active' : ''}
          onClick={() => setParams({ tab: 'categories' })}
        >
          الفئات والأصناف
        </button>
      </div>

      {tab === 'categories' ? <CategoriesPage embedded /> : null}

      {tab === 'products' ? (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">إجمالي المنتجات</div>
              <div className="stat-value">{products.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">ظاهر في المتجر</div>
              <div className="stat-value">{activeCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">المتغيرات</div>
              <div className="stat-value">
                {products.reduce((n, p) => n + p.variants.length, 0)}
              </div>
            </div>
          </div>

          {notice ? <div className="success">{notice}</div> : null}
          {error ? <div className="error">{error}</div> : null}

          {showForm ? (
            <ProductForm
              key={editing?.id || (editing ? `clone-${editing.nameAr}` : 'new')}
              categories={categories}
              editing={editing}
              canSeeCost={canSeeCost}
              isOwner={isOwner}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
              onError={setError}
              onSaved={async (productId, msg) => {
                setNotice(msg);
                setShowForm(false);
                setEditing(null);
                await load();
                setOpenId(productId);
              }}
            />
          ) : null}
          <div className="panel">
            <div className="toolbar pf-list-toolbar">
              <strong>قائمة المنتجات</strong>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث بالاسم أو SKU أو الباركود..."
                style={{ minWidth: 200, height: 36, padding: '0 12px' }}
              />
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="">كل الفئات</option>
                {parentCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">كل الحالات</option>
                <option value="ACTIVE">ظاهر</option>
                <option value="DRAFT">مسودة</option>
                <option value="ARCHIVED">مخفي</option>
              </select>
              <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)}>
                <option value="">كل المخزون</option>
                <option value="in">متوفر</option>
                <option value="out">نفد</option>
              </select>
              <select value={filterPrice} onChange={(e) => setFilterPrice(e.target.value)}>
                <option value="">كل الأسعار</option>
                <option value="lt50">أقل من 50</option>
                <option value="50to150">50 – 150</option>
                <option value="gt150">أكثر من 150</option>
              </select>
            </div>

            <div className="table-wrap">
              <table className="pf-products-table">
                <thead>
                  <tr>
                    <th>الصورة</th>
                    <th>المنتج</th>
                    <th>الفئة</th>
                    <th>الألوان</th>
                    <th>المتغيرات</th>
                    <th>المخزون</th>
                    <th>السعر</th>
                    {isOwner ? <th>الجملة</th> : null}
                    {canSeeCost ? <th>التكلفة</th> : null}
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const colors = [
                      ...new Set(p.variants.map((v) => v.color).filter(Boolean)),
                    ] as string[];
                    const stock = p.variants.reduce((n, v) => n + (v.available || 0), 0);
                    const thumb =
                      p.images?.find((i) => i.isPrimary)?.url ||
                      p.images?.[0]?.url ||
                      p.variants.find((v) => v.imageUrl)?.imageUrl;
                    const open = openId === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr
                          className={open ? 'is-open' : ''}
                          onClick={() => setOpenId(open ? null : p.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                width={44}
                                height={55}
                                style={{ objectFit: 'cover', borderRadius: 8 }}
                              />
                            ) : (
                              <div className="pf-thumb-empty">—</div>
                            )}
                          </td>
                          <td>
                            <strong>{p.nameAr}</strong>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {p.sku || '—'}
                            </div>
                          </td>
                          <td>{p.category?.nameAr || '—'}</td>
                          <td>
                            <div className="pf-color-dots">
                              {colors.slice(0, 6).map((c) => (
                                <span
                                  key={c}
                                  title={c}
                                  className="color-dot"
                                  style={{ background: colorHex(c) || '#999' }}
                                />
                              ))}
                              {colors.length > 6 ? (
                                <span className="muted">+{colors.length - 6}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>{p.variants.length}</td>
                          <td>{stock}</td>
                          <td>
                            {money(productRetail(p))}
                            {productSalePercent(p) > 0 ? (
                              <div className="muted" style={{ fontSize: 12 }}>
                                خصم {productSalePercent(p)}%
                              </div>
                            ) : null}
                          </td>
                          {isOwner ? (
                            <td>
                              {p.wholesalePrice != null ? money(p.wholesalePrice) : '—'}
                            </td>
                          ) : null}
                          {canSeeCost ? (
                            <td>{p.costPrice != null ? money(p.costPrice) : '—'}</td>
                          ) : null}
                          <td>
                            <span className={statusBadgeClass(p.status)}>
                              {statusLabelAr(p.status)}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="pf-row-actions">
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={(e) => openEdit(p, e)}
                                >
                                  تعديل
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => setOpenId(open ? null : p.id)}
                              >
                                عرض
                              </button>
                              {canCreate ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing({
                                      ...p,
                                      id: '',
                                      nameAr: `${p.nameAr} (نسخة)`,
                                      sku: null,
                                    });
                                    setShowForm(true);
                                    setNotice('نسخة جاهزة للتعديل — احفظي لإنشاء منتج جديد');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                >
                                  نسخ
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={(e) => void archiveOnly(p, e)}
                                >
                                  أرشفة
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSaleProduct(p);
                                    setSalePercent(productSalePercent(p) || 20);
                                    setSaleError('');
                                  }}
                                >
                                  تخفيض
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="btn danger"
                                  disabled={deletingId === p.id}
                                  onClick={(e) => void archiveOrDelete(p, e)}
                                >
                                  {deletingId === p.id ? '...' : 'حذف'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="pf-detail-row">
                            <td colSpan={9 + (isOwner ? 1 : 0) + (canSeeCost ? 1 : 0)}>
                              <div className="pf-detail-panel">
                                <p>{p.description || 'بدون وصف'}</p>
                                <div className="pf-detail-images">
                                  {(p.images || []).map((img) => (
                                    <div key={img.id}>
                                      <img src={img.url} alt={img.color || ''} width={72} height={90} />
                                      <div className="muted" style={{ fontSize: 11 }}>
                                        {img.color || 'عامة'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="table-wrap">
                                  <table>
                                    <thead>
                                      <tr>
                                        <th>اللون</th>
                                        <th>المقاس</th>
                                        <th>المخزون</th>
                                        <th>SKU</th>
                                        <th>الباركود</th>
                                        <th></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {p.variants.map((v) => (
                                        <tr key={v.id}>
                                          <td>{v.color || '—'}</td>
                                          <td>{v.size || '—'}</td>
                                          <td>{v.available ?? '—'}</td>
                                          <td>{v.sku}</td>
                                          <td>
                                            <code>{v.barcode || '—'}</code>
                                          </td>
                                          <td>
                                            {canEdit && !v.barcode ? (
                                              <button
                                                type="button"
                                                className="btn ghost"
                                                onClick={() => void generateBarcode(v.id)}
                                              >
                                                إصدار باركود
                                              </button>
                                            ) : null}
                                            {v.barcode ? (
                                              <button
                                                type="button"
                                                className="btn ghost"
                                                onClick={() =>
                                                  printBarcodes([{ barcode: v.barcode as string }])
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
                                </div>
                                {p.variants.some((v) => v.barcode) ? (
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    style={{ marginTop: 8 }}
                                    onClick={() =>
                                      printBarcodes(
                                        p.variants
                                          .filter((v) => v.barcode)
                                          .map((v) => ({ barcode: v.barcode as string })),
                                      )
                                    }
                                  >
                                    طباعة كل الباركود
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!filtered.length ? (
                    <tr>
                      <td colSpan={12} className="empty">
                        لا توجد منتجات مطابقة
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {saleProduct ? (
        <div className="size-editor-overlay" role="dialog" aria-label="تخفيض المنتج">
          <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>تخفيض — {saleProduct.nameAr}</h3>
            <p className="muted">
              الأصلي {money(productOriginal(saleProduct))} · الحالي{' '}
              {money(productRetail(saleProduct))}
            </p>
            <div className="pf-discount-row">
              {[10, 20, 30, 40, 50].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn secondary${salePercent === p ? ' is-selected' : ''}`}
                  onClick={() => setSalePercent(p)}
                >
                  {p}%
                </button>
              ))}
            </div>
            <label>
              خصم مخصص
              <input
                type="number"
                min={0}
                max={90}
                value={salePercent}
                onChange={(e) => setSalePercent(Number(e.target.value) || 0)}
              />
            </label>
            <p>
              بعد الخصم:{' '}
              <strong>{money(salePriceFrom(productOriginal(saleProduct), salePercent))}</strong>
            </p>
            {saleError ? <div className="error">{saleError}</div> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                disabled={saleBusy}
                onClick={() => void saveSale(salePercent)}
              >
                تطبيق
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => void saveSale(0)}
              >
                إلغاء الخصم
              </button>
              <button type="button" className="btn ghost" onClick={() => setSaleProduct(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
