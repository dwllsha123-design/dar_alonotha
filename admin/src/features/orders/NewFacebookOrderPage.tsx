import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '@/api/client';
import { isFacebookPageEmployee, useAuth } from '@/auth/AuthContext';

type ProductImage = {
  url: string;
  isPrimary?: boolean;
  sortOrder?: number;
  color?: string | null;
};

type Page = { id: string; name: string };
type Product = {
  id: string;
  nameAr: string;
  images?: ProductImage[];
  variants: Array<{
    id: string;
    sku: string;
    price: string | number;
    retailPrice?: string | number;
    nameAr?: string;
    color?: string | null;
    size?: string | null;
    imageUrl?: string | null;
    available?: number;
    availableQty?: number;
  }>;
};

type Line = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  imageUrl?: string | null;
};

type OutletCtx = { selectedFacebookPageId?: string };

const PAGE_STORAGE_KEY = 'selectedFacebookPageId';

function resolveVariantThumb(
  product: Product,
  variant: Product['variants'][number],
): string | null {
  if (variant.imageUrl?.trim()) return variant.imageUrl.trim();
  const images = product.images || [];
  const color = variant.color?.trim();
  if (color) {
    const byColor = images
      .filter((i) => i.color === color)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (byColor[0]?.url) return byColor[0].url;
  }
  const sorted = [...images].sort(
    (a, b) =>
      Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  return sorted[0]?.url || null;
}

export function NewFacebookOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const outlet = useOutletContext<OutletCtx | undefined>();
  const pageEmployee = isFacebookPageEmployee(user);
  const assignedPages = user?.facebookPages || [];
  const pickerRef = useRef<HTMLDivElement>(null);

  const [pages, setPages] = useState<Page[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [facebookPageId, setFacebookPageId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerPhone2, setCustomerPhone2] = useState('');
  const [cities, setCities] = useState<
    Array<{
      nameAr: string;
      deliveryType: string;
      areas: string[];
      requiresGender?: boolean;
      areaDetails?: Array<{
        nameAr: string;
        maleFee: number;
        femaleFee: number;
        maleEnabled?: boolean;
        femaleEnabled?: boolean;
      }>;
    }>
  >([]);
  const [city, setCity] = useState('طرابلس');
  const [area, setArea] = useState('');
  const [deliveryGender, setDeliveryGender] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryType, setDeliveryType] = useState('INTERNAL');
  const [deliveryLabel, setDeliveryLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [qty, setQty] = useState(1);
  const [unitPriceInput, setUnitPriceInput] = useState<number | ''>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const preferred =
      outlet?.selectedFacebookPageId ||
      (() => {
        try {
          return localStorage.getItem(PAGE_STORAGE_KEY) || '';
        } catch {
          return '';
        }
      })();

    if (pageEmployee && assignedPages.length) {
      setPages(assignedPages.map((p) => ({ id: p.id, name: p.name })));
      const match = assignedPages.find((p) => p.id === preferred);
      setFacebookPageId(match?.id || assignedPages[0].id);
    }

    Promise.all([
      pageEmployee
        ? Promise.resolve(null)
        : api<Page[]>('/facebook-pages').catch(() => [] as Page[]),
      api<Product[]>('/products'),
      api<{ cities: Array<{ nameAr: string; deliveryType: string; areas: string[] }> }>(
        '/store/delivery-options',
      ).catch(() => ({ cities: [] })),
    ])
      .then(([p, pr, zones]) => {
        if (!pageEmployee && p) {
          setPages(p);
          const match = p.find((x) => x.id === preferred);
          if (match) setFacebookPageId(match.id);
          else if (p[0]) setFacebookPageId(p[0].id);
        }
        setProducts(pr);
        setCities(zones.cities || []);
        if (zones.cities?.[0]) {
          setCity(zones.cities[0].nameAr);
          setArea(zones.cities[0].areas[0] || '');
        }
      })
      .catch((e) => setError(e.message));
  }, [pageEmployee, assignedPages, outlet?.selectedFacebookPageId]);

  useEffect(() => {
    if (!pageEmployee || !outlet?.selectedFacebookPageId) return;
    if (assignedPages.some((p) => p.id === outlet.selectedFacebookPageId)) {
      setFacebookPageId(outlet.selectedFacebookPageId);
    }
  }, [outlet?.selectedFacebookPageId, pageEmployee, assignedPages]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDocPointerDown(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, [pickerOpen]);

  const areas = useMemo(
    () => cities.find((c) => c.nameAr === city)?.areas || [],
    [cities, city],
  );
  const currentCity = cities.find((c) => c.nameAr === city);
  const requiresGender = Boolean(currentCity?.requiresGender);
  const areaDetail = currentCity?.areaDetails?.find((a) => a.nameAr === area);
  const maleEnabled = areaDetail?.maleEnabled !== false;
  const femaleEnabled = areaDetail?.femaleEnabled !== false;

  useEffect(() => {
    if (!requiresGender) return;
    if (deliveryGender === 'FEMALE' && !femaleEnabled && maleEnabled) {
      setDeliveryGender('MALE');
    } else if (deliveryGender === 'MALE' && !maleEnabled && femaleEnabled) {
      setDeliveryGender('FEMALE');
    }
  }, [area, requiresGender, maleEnabled, femaleEnabled, deliveryGender]);

  useEffect(() => {
    if (!city || !area) return;
    const qs = new URLSearchParams({ city, area });
    if (requiresGender) qs.set('gender', deliveryGender);
    api<{ deliveryFee: number; deliveryType: string; labelAr: string }>(
      `/delivery/quote?${qs}`,
    )
      .then((q) => {
        setDeliveryFee(q.deliveryFee);
        setDeliveryType(q.deliveryType);
        setDeliveryLabel(q.labelAr);
      })
      .catch(() => undefined);
  }, [city, area, deliveryGender, requiresGender]);

  const variants = useMemo(
    () =>
      products.flatMap((p) =>
        p.variants.map((v) => {
          const price = Number(v.retailPrice ?? v.price);
          const available = v.available ?? v.availableQty;
          return {
            ...v,
            productName: p.nameAr,
            price,
            available,
            imageUrl: resolveVariantThumb(p, v),
            label: `${p.nameAr} — ${v.nameAr || [v.color, v.size].filter(Boolean).join('/') || v.sku}`,
          };
        }),
      ),
    [products],
  );

  const filteredVariants = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter(
      (v) =>
        v.label.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        (v.color || '').toLowerCase().includes(q) ||
        (v.size || '').toLowerCase().includes(q),
    );
  }, [variants, pickerQuery]);

  const selected = variants.find((x) => x.id === selectedVariant);

  function selectVariant(id: string) {
    const v = variants.find((x) => x.id === id);
    setSelectedVariant(id);
    setUnitPriceInput(v ? Number(v.price) : '');
    setPickerOpen(false);
    setPickerQuery('');
  }

  function addLine() {
    const v = variants.find((x) => x.id === selectedVariant);
    if (!v) return;
    const price =
      unitPriceInput === '' || !Number.isFinite(Number(unitPriceInput))
        ? Number(v.price)
        : Math.max(0, Number(unitPriceInput));
    setLines((prev) => [
      ...prev,
      {
        variantId: v.id,
        productName: v.productName,
        variantName: v.nameAr || [v.color, v.size].filter(Boolean).join(' / ') || v.sku,
        sku: v.sku,
        quantity: qty,
        unitPrice: price,
        listPrice: Number(v.price),
        imageUrl: v.imageUrl,
      },
    ]);
    setSelectedVariant('');
    setUnitPriceInput('');
    setQty(1);
  }

  function updateLinePrice(index: number, value: number) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, unitPrice: Math.max(0, Number.isFinite(value) ? value : 0) } : l,
      ),
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = subtotal + deliveryFee;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lines.length) {
      setError('أضف منتجاً واحداً على الأقل');
      return;
    }
    if (!facebookPageId) {
      setError('اختر صفحة فيسبوك');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          source: 'FACEBOOK',
          facebookPageId,
          customerName,
          customerPhone,
          customerPhone2: customerPhone2 || undefined,
          shippingName: customerName,
          shippingPhone: customerPhone,
          city,
          area,
          deliveryGender: requiresGender ? deliveryGender : undefined,
          address,
          landmark,
          deliveryFee,
          notes,
          deliveryType,
          paymentMethod: 'COD',
          items: lines.map((l) => ({
            variantId: l.variantId,
            productName: l.productName,
            variantName: l.variantName,
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        }),
      });
      navigate('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء الطلب');
    } finally {
      setBusy(false);
    }
  }

  const pageLocked = pageEmployee && assignedPages.length <= 1;

  return (
    <div className="stack">
      <div className="page-title">
        <h1>طلب فيسبوك</h1>
        <p>
          سجّلي الطلب من محادثة ماسنجر بسرعة: بيانات الزبونة، العنوان، المنتج، والكمية.
          الموظفة: {user?.name}
          {pageEmployee ? ' — الصفحة تُسجَّل تلقائياً باسمك' : null}
        </p>
      </div>

      <form className="panel stack" onSubmit={onSubmit}>
        <div className="form-grid two">
          <label>
            اسم الصفحة (مصدر الطلب)
            {pageLocked ? (
              <input value={pages.find((p) => p.id === facebookPageId)?.name || ''} readOnly />
            ) : (
              <select
                value={facebookPageId}
                onChange={(e) => setFacebookPageId(e.target.value)}
                required
                disabled={pageEmployee && pages.length === 0}
              >
                <option value="">اختر الصفحة</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            اسم العميل
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            هاتف العميل
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
              inputMode="tel"
            />
          </label>
          <label>
            هاتف بديل (اختياري)
            <input
              value={customerPhone2}
              onChange={(e) => setCustomerPhone2(e.target.value)}
              inputMode="tel"
            />
          </label>
          <label>
            المدينة
            <select
              value={city}
              onChange={(e) => {
                const next = e.target.value;
                setCity(next);
                const found = cities.find((c) => c.nameAr === next);
                setArea(found?.areas[0] || '');
              }}
              required
            >
              {cities.map((c) => (
                <option key={c.nameAr} value={c.nameAr}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            المنطقة
            <select value={area} onChange={(e) => setArea(e.target.value)} required>
              <option value="">اختر المنطقة</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {requiresGender ? (
            <label>
              نوع المندوب
              <select
                value={deliveryGender}
                onChange={(e) => setDeliveryGender(e.target.value as 'MALE' | 'FEMALE')}
              >
                {femaleEnabled ? <option value="FEMALE">نسائي</option> : null}
                {maleEnabled ? <option value="MALE">رجالي</option> : null}
              </select>
            </label>
          ) : null}
          <label>
            العنوان الكامل
            <input value={address} onChange={(e) => setAddress(e.target.value)} required />
          </label>
          <label>
            علامة مميزة
            <input value={landmark} onChange={(e) => setLandmark(e.target.value)} />
          </label>
          <label>
            رسوم التوصيل
            <input type="number" value={deliveryFee} readOnly />
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              {deliveryLabel || 'يُحسب بعد اختيار المنطقة'} · {deliveryType}
            </span>
          </label>
        </div>

        <label>
          ملاحظات
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <div className="fb-order-add stack">
          <div className="form-grid two">
            <label className="fb-variant-picker-label">
              المنتج / المقاس / اللون
              <div className="fb-variant-picker" ref={pickerRef}>
                <button
                  type="button"
                  className="fb-variant-trigger"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                >
                  {selected ? (
                    <>
                      {selected.imageUrl ? (
                        <img src={selected.imageUrl} alt="" className="fb-variant-thumb" />
                      ) : (
                        <span className="fb-variant-thumb fb-variant-thumb-empty">—</span>
                      )}
                      <span className="fb-variant-trigger-text">
                        {selected.label} — {Number(selected.price)} د.ل
                      </span>
                    </>
                  ) : (
                    <span className="fb-variant-trigger-placeholder">اختر صنف</span>
                  )}
                </button>
                {pickerOpen ? (
                  <div className="fb-variant-menu" role="listbox">
                    <input
                      className="fb-variant-search"
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="بحث عن منتج..."
                      autoFocus
                    />
                    <div className="fb-variant-list">
                      {filteredVariants.length === 0 ? (
                        <div className="fb-variant-empty">لا توجد نتائج</div>
                      ) : (
                        filteredVariants.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="option"
                            aria-selected={v.id === selectedVariant}
                            className={`fb-variant-option${v.id === selectedVariant ? ' is-selected' : ''}`}
                            onClick={() => selectVariant(v.id)}
                          >
                            {v.imageUrl ? (
                              <img src={v.imageUrl} alt="" className="fb-variant-thumb" />
                            ) : (
                              <span className="fb-variant-thumb fb-variant-thumb-empty">—</span>
                            )}
                            <span className="fb-variant-option-meta">
                              <span className="fb-variant-option-name">{v.label}</span>
                              <span className="fb-variant-option-price">
                                {Number(v.price)} د.ل
                                {v.available != null ? ` · متوفر ${v.available}` : ''}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </label>
            <label>
              الكمية
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </label>
            <label>
              سعر الوحدة (د.ل)
              <input
                type="number"
                min={0}
                step="0.01"
                value={unitPriceInput}
                onChange={(e) =>
                  setUnitPriceInput(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder={selected ? String(selected.price) : 'اختر منتجاً أولاً'}
                disabled={!selectedVariant}
              />
              <span className="fb-price-hint">
                يمكن تعديله أو زيادته لمساعدة الزبونة · السعر الافتراضي:{' '}
                {selected ? `${Number(selected.price)} د.ل` : '—'}
              </span>
            </label>
          </div>
          <button className="btn secondary" type="button" onClick={addLine} disabled={!selectedVariant}>
            إضافة
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.variantId}-${i}`}>
                  <td>
                    <div className="fb-line-product">
                      {l.imageUrl ? (
                        <img src={l.imageUrl} alt="" className="fb-variant-thumb" />
                      ) : (
                        <span className="fb-variant-thumb fb-variant-thumb-empty">—</span>
                      )}
                      <span>
                        {l.productName}
                        {l.variantName ? ` — ${l.variantName}` : ''}
                      </span>
                    </div>
                  </td>
                  <td>{l.quantity}</td>
                  <td>
                    <input
                      className="fb-line-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(e) => updateLinePrice(i, Number(e.target.value))}
                      aria-label="سعر الوحدة"
                    />
                    {l.unitPrice !== l.listPrice ? (
                      <div className="fb-price-hint">أصل {l.listPrice}</div>
                    ) : null}
                  </td>
                  <td>{l.quantity * l.unitPrice}</td>
                  <td>
                    <button
                      type="button"
                      className="btn secondary fb-line-remove"
                      onClick={() => removeLine(i)}
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="toolbar">
          <strong>
            الإجمالي: {total} د.ل (منتجات {subtotal} + توصيل {deliveryFee})
          </strong>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'حفظ الطلب'}
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}
      </form>
    </div>
  );
}
