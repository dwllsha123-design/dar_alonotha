import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

type Page = { id: string; name: string };
type Product = {
  id: string;
  nameAr: string;
  variants: Array<{ id: string; sku: string; price: string | number; nameAr?: string; color?: string; size?: string }>;
};

type Line = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
};

export function NewFacebookOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pages, setPages] = useState<Page[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [facebookPageId, setFacebookPageId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
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
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [qty, setQty] = useState(1);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    Promise.all([
      api<Page[]>('/facebook-pages'),
      api<Product[]>('/products'),
      api<{ cities: Array<{ nameAr: string; deliveryType: string; areas: string[] }> }>(
        '/store/delivery-options',
      ).catch(() => ({ cities: [] })),
    ])
      .then(([p, pr, zones]) => {
        setPages(p);
        setProducts(pr);
        if (p[0]) setFacebookPageId(p[0].id);
        setCities(zones.cities || []);
        if (zones.cities?.[0]) {
          setCity(zones.cities[0].nameAr);
          setArea(zones.cities[0].areas[0] || '');
        }
      })
      .catch((e) => setError(e.message));
  }, []);

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
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = subtotal - discountAmount + deliveryFee;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lines.length) {
      setError('أضف منتجاً واحداً على الأقل');
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
          shippingName: customerName,
          shippingPhone: customerPhone,
          city,
          area,
          deliveryGender: requiresGender ? deliveryGender : undefined,
          address,
          landmark,
          deliveryFee,
          discountAmount,
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

  return (
    <div className="stack">
      <div className="page-title">
        <h1>طلب فيسبوك</h1>
        <p>
          من هنا تسجّلين طلباً وصل عبر محادثة فيسبوك: بيانات الزبون، المنتجات، المدينة، والصفحة التي جاء منها الطلب حتى يُحسب للمصدر الصحيح. الموظفة: {user?.name}
        </p>
      </div>

      <form className="panel stack" onSubmit={onSubmit}>
        <div className="form-grid two">
          <label>
            اسم الصفحة (مصدر الطلب)
            <select
              value={facebookPageId}
              onChange={(e) => setFacebookPageId(e.target.value)}
              required
            >
              <option value="">اختر الصفحة</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            هاتف العميل
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
          </label>
          <label>
            اسم العميل
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
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
            العنوان
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            علامة مميزة
            <input value={landmark} onChange={(e) => setLandmark(e.target.value)} />
          </label>
          <label>
            رسوم التوصيل (تلقائي)
            <input type="number" value={deliveryFee} readOnly />
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              {deliveryLabel || 'يُحسب بعد اختيار المنطقة'}
            </span>
          </label>
          <label>
            خصم
            <input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
          </label>
        </div>

        <label>
          ملاحظات
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <div className="toolbar">
          <div className="form-grid two" style={{ flex: 1 }}>
            <label>
              المنتج
              <select value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)}>
                <option value="">اختر صنف</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {Number(v.price)} د.ل
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
              {lines.map((l, idx) => (
                <tr key={`${l.variantId}-${idx}`}>
                  <td>
                    {l.productName}
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{l.variantName}</div>
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
          <strong>الإجمالي: {total.toLocaleString('ar-LY')} د.ل</strong>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'إنشاء الطلب'}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </form>
    </div>
  );
}
