import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, money } from '@/api/client';

type OrderItem = {
  id: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: string | number;
  discount?: string | number;
  lineTotal: string | number;
  imageUrl?: string | null;
};

type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  shippingName?: string | null;
  shippingPhone?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  landmark?: string | null;
  notes?: string | null;
  discountAmount?: string | number;
  deliveryFee?: string | number;
  subtotal?: string | number;
  totalAmount?: string | number;
  items?: OrderItem[];
};

type EditLine = {
  key: string;
  id?: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
};

type Product = {
  id: string;
  nameAr: string;
  images?: Array<{ url: string; isPrimary?: boolean; sortOrder?: number; color?: string | null }>;
  variants: Array<{
    id: string;
    sku: string;
    price: string | number;
    retailPrice?: string | number;
    nameAr?: string;
    color?: string | null;
    size?: string | null;
    imageUrl?: string | null;
  }>;
};

type Props = {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
};

function variantThumb(product: Product, variant: Product['variants'][number]): string | null {
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

export function EditOrderModal({ orderId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState('');

  const [shippingName, setShippingName] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [lines, setLines] = useState<EditLine[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');

  const itemsLocked = status === 'DELIVERED' || status === 'OUT_FOR_DELIVERY' || status === 'CANCELLED';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api<OrderDetail>(`/orders/${orderId}`),
      api<Product[]>('/products').catch(() => [] as Product[]),
    ])
      .then(([order, productList]) => {
        if (cancelled) return;
        setOrderNumber(order.orderNumber);
        setStatus(order.status);
        setShippingName(order.shippingName || '');
        setShippingPhone(order.shippingPhone || '');
        setCity(order.city || '');
        setArea(order.area || '');
        setAddress(order.address || '');
        setLandmark(order.landmark || '');
        setNotes(order.notes || '');
        setDeliveryFee(Number(order.deliveryFee || 0));
        setDiscountAmount(Number(order.discountAmount || 0));
        setLines(
          (order.items || []).map((item) => ({
            key: item.id,
            id: item.id,
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            sku: item.sku,
            imageUrl: item.imageUrl,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice || 0),
          })),
        );
        setProducts(productList);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'تعذر تحميل الطلب');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const catalog = useMemo(
    () =>
      products.flatMap((p) =>
        p.variants.map((v) => {
          const price = Number(v.retailPrice ?? v.price);
          return {
            id: v.id,
            productName: p.nameAr,
            variantName: v.nameAr || [v.color, v.size].filter(Boolean).join(' / ') || v.sku,
            sku: v.sku,
            unitPrice: price,
            imageUrl: variantThumb(p, v),
            label: `${p.nameAr} — ${v.nameAr || [v.color, v.size].filter(Boolean).join('/') || v.sku}`,
          };
        }),
      ),
    [products],
  );

  const filteredCatalog = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);
    return catalog.filter((v) => v.label.toLowerCase().includes(q) || v.sku?.toLowerCase().includes(q)).slice(0, 40);
  }, [catalog, pickerQuery]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);

  function updateLine(key: string, patch: Partial<EditLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function addSelectedVariant() {
    const v = catalog.find((x) => x.id === selectedVariant);
    if (!v) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === v.id);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: `new-${v.id}-${Date.now()}`,
          variantId: v.id,
          productName: v.productName,
          variantName: v.variantName,
          sku: v.sku,
          imageUrl: v.imageUrl,
          quantity: 1,
          unitPrice: v.unitPrice,
        },
      ];
    });
    setSelectedVariant('');
    setPickerQuery('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!shippingName.trim() || !shippingPhone.trim()) {
      setError('اسم العميل ورقم الهاتف مطلوبان');
      return;
    }
    if (!itemsLocked && !lines.length) {
      setError('أضيفي منتجاً واحداً على الأقل');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        shippingName: shippingName.trim(),
        shippingPhone: shippingPhone.trim(),
        city: city.trim(),
        area: area.trim(),
        address: address.trim(),
        landmark: landmark.trim(),
        notes: notes.trim(),
        deliveryFee,
        discountAmount,
      };
      if (!itemsLocked) {
        body.items = lines.map((l) => ({
          ...(l.id ? { id: l.id } : {}),
          ...(l.variantId ? { variantId: l.variantId } : {}),
          productName: l.productName,
          variantName: l.variantName || undefined,
          sku: l.sku || undefined,
          imageUrl: l.imageUrl || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        }));
      }
      await api(`/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="size-editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="تعديل الطلب"
      onClick={onClose}
    >
      <div className="size-editor" style={{ width: 'min(860px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="size-editor-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>تعديل الطلب</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {orderNumber ? `رقم الطلب ${orderNumber}` : '…'}
              {status ? ` — ${status}` : ''}
            </p>
          </div>
          <button type="button" className="btn secondary sm" onClick={onClose} disabled={saving}>
            إغلاق
          </button>
        </div>

        {loading ? <div className="muted">جارٍ التحميل…</div> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading ? (
          <form className="stack" onSubmit={onSubmit} style={{ gap: 14 }}>
            <div className="form-grid two">
              <label>
                اسم العميل
                <input value={shippingName} onChange={(e) => setShippingName(e.target.value)} required />
              </label>
              <label>
                رقم الهاتف
                <input value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} required />
              </label>
              <label>
                المدينة
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                المنطقة
                <input value={area} onChange={(e) => setArea(e.target.value)} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                العنوان
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label>
                علامة مميزة
                <input value={landmark} onChange={(e) => setLandmark(e.target.value)} />
              </label>
              <label>
                ملاحظات
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label>
                رسوم التوصيل
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label>
                الخصم
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>

            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>المنتجات</strong>
              {itemsLocked ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  لا يمكن تعديل بنود هذا الطلب في حالته الحالية — يمكن تعديل بيانات العميل فقط.
                </p>
              ) : null}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>السعر</th>
                      <th>الكمية</th>
                      <th>الإجمالي</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.key}>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {l.imageUrl ? (
                              <img
                                src={l.imageUrl}
                                alt=""
                                style={{ width: 40, height: 50, objectFit: 'cover', borderRadius: 6 }}
                              />
                            ) : null}
                            <div>
                              <div style={{ fontWeight: 600 }}>{l.productName}</div>
                              {l.variantName ? <div className="muted" style={{ fontSize: 12 }}>{l.variantName}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={l.unitPrice}
                            disabled={itemsLocked}
                            style={{ width: 90 }}
                            onChange={(e) =>
                              updateLine(l.key, {
                                unitPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            value={l.quantity}
                            disabled={itemsLocked}
                            style={{ width: 70 }}
                            onChange={(e) =>
                              updateLine(l.key, {
                                quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                              })
                            }
                          />
                        </td>
                        <td>{money(l.quantity * l.unitPrice)}</td>
                        <td>
                          {!itemsLocked ? (
                            <button type="button" className="btn secondary sm" onClick={() => removeLine(l.key)}>
                              حذف
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!lines.length ? (
                      <tr>
                        <td colSpan={5} className="empty">
                          لا توجد منتجات
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {!itemsLocked ? (
                <div className="toolbar" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="بحث لإضافة منتج…"
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <select
                    value={selectedVariant}
                    onChange={(e) => setSelectedVariant(e.target.value)}
                    style={{ minWidth: 220 }}
                  >
                    <option value="">اختاري منتجاً</option>
                    {filteredCatalog.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} — {money(v.unitPrice)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!selectedVariant}
                    onClick={addSelectedVariant}
                  >
                    إضافة
                  </button>
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
                paddingTop: 4,
              }}
            >
              <div className="muted">
                المجموع: {money(subtotal)} — بعد الخصم والتوصيل: <strong>{money(total)}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
                  إلغاء
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
