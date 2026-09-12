import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '@/api/client';
import { isFacebookPageEmployee, useAuth } from '@/auth/AuthContext';

type Page = { id: string; name: string };
type Product = {
  id: string;
  nameAr: string;
  variants: Array<{
    id: string;
    sku: string;
    price: string | number;
    retailPrice?: string | number;
    nameAr?: string;
    color?: string;
    size?: string;
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
};

type OutletCtx = { selectedFacebookPageId?: string };

const PAGE_STORAGE_KEY = 'selectedFacebookPageId';

export function NewFacebookOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const outlet = useOutletContext<OutletCtx | undefined>();
  const pageEmployee = isFacebookPageEmployee(user);
  const assignedPages = user?.facebookPages || [];

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
        p.variants.map((v) => ({
          ...v,
          productName: p.nameAr,
          price: Number(v.retailPrice ?? v.price),
          label: `${p.nameAr} — ${v.nameAr || [v.color, v.size].filter(Boolean).join('/') || v.sku}`,
        })),
      ),
    [products],
  );

  function addLine() {
    const v = variants.find((x) => x.id === selectedVariant);
    if (!v) return;
    setLines((prev) => [
      ...prev,
      {
        variantId: v.id,
        productName: v.productName,
        variantName: v.nameAr || [v.color, v.size].filter(Boolean).join(' / ') || v.sku,
        sku: v.sku,
        quantity: qty,
        unitPrice: Number(v.price),
      },
    ]);
    setSelectedVariant('');
    setQty(1);
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

        <div className="toolbar">
          <div className="form-grid two" style={{ flex: 1 }}>
            <label>
              المنتج / المقاس / اللون
              <select value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)}>
                <option value="">اختر صنف</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {Number(v.price)} د.ل
                    {v.availableQty != null ? ` (متوفر ${v.availableQty})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الكمية
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </label>
          </div>
          <button className="btn secondary" type="button" onClick={addLine}>
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
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.variantId}-${i}`}>
                  <td>
                    {l.productName}
                    {l.variantName ? ` — ${l.variantName}` : ''}
                  </td>
                  <td>{l.quantity}</td>
                  <td>{l.unitPrice}</td>
                  <td>{l.quantity * l.unitPrice}</td>
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
