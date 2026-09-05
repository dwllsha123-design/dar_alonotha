import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getAttributionMeta, money } from '../api/client';
import { useCart, useCartStock } from '../cart/CartContext';
import { useAuth } from '../auth/AuthContext';

type DeliveryCity = {
  nameAr: string;
  mode: string;
  deliveryType: string;
  areas: string[];
  requiresGender?: boolean;
  areaDetails?: Array<{ nameAr: string; maleFee: number; femaleFee: number }>;
};

type Quote = {
  deliveryFee: number;
  labelAr: string;
  deliveryType: string;
  mode: string;
  gender?: 'MALE' | 'FEMALE' | null;
  maleFee?: number | null;
  femaleFee?: number | null;
  requiresGender?: boolean;
};

type Profile = {
  name?: string;
  phone?: string | null;
  customer?: {
    city?: string | null;
    area?: string | null;
    landmark?: string | null;
  } | null;
};

export function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const { unavailable, canCheckout, loaded } = useCartStock();
  const { user } = useAuth();
  const navigate = useNavigate();
  const attr = getAttributionMeta();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [cities, setCities] = useState<DeliveryCity[]>([]);
  const [notesMap, setNotesMap] = useState<{ internal?: string; external?: string }>({});
  const [city, setCity] = useState('طرابلس');
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoMsg, setPromoMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deliveryGender, setDeliveryGender] = useState<'MALE' | 'FEMALE'>('FEMALE');

  useEffect(() => {
    api<{ cities: DeliveryCity[]; notes?: { internal?: string; external?: string } }>(
      '/store/delivery-options',
    )
      .then((d) => {
        setCities(d.cities || []);
        setNotesMap(d.notes || {});
        const first = d.cities?.[0];
        if (first) {
          setCity(first.nameAr);
          setArea(first.areas[0] || '');
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user || !cities.length) return;
    setName((prev) => prev || user.name || '');
    setPhone((prev) => prev || user.phone || '');
    api<Profile>('/store/me')
      .then((me) => {
        if (me.name) setName(me.name);
        if (me.phone) setPhone(me.phone);
        const c = me.customer;
        if (!c) return;
        if (c.city && cities.some((x) => x.nameAr === c.city)) {
          setCity(c.city);
          const found = cities.find((x) => x.nameAr === c.city);
          if (c.area && found?.areas.includes(c.area)) setArea(c.area);
          else setArea(found?.areas[0] || '');
        }
        if (c.landmark) setLandmark(c.landmark);
      })
      .catch(() => undefined);
  }, [user, cities]);

  const areas = useMemo(
    () => cities.find((c) => c.nameAr === city)?.areas || [],
    [cities, city],
  );
  const currentCity = cities.find((c) => c.nameAr === city);
  const requiresGender = Boolean(currentCity?.requiresGender);
  const areaDetail = currentCity?.areaDetails?.find((a) => a.nameAr === area);

  useEffect(() => {
    if (!city) return;
    const qs = new URLSearchParams({ city });
    if (area) qs.set('area', area);
    if (requiresGender) qs.set('gender', deliveryGender);
    api<Quote>(`/store/delivery-quote?${qs}`)
      .then(setQuote)
      .catch(() => undefined);
  }, [city, area, deliveryGender, requiresGender]);

  if (!items.length) {
    return (
      <div className="container section empty-state">
        <h2 className="headline-md">سلتك ما زالت فارغة</h2>
        <Link className="btn" to="/products">
          ابدئي التسوق
        </Link>
      </div>
    );
  }

  const deliveryFee = quote?.deliveryFee ?? 0;
  const deliveryNote =
    quote?.deliveryType === 'INTERNAL' ? notesMap.internal : notesMap.external;

  async function applyPromo() {
    setPromoMsg('');
    try {
      const res = await api<{ discount: number; code: string }>('/store/promo/validate', {
        method: 'POST',
        body: JSON.stringify({ code: promoCode, subtotal }),
      });
      setDiscount(res.discount);
      setPromoMsg(`تم تطبيق الخصم: ${money(res.discount)}`);
    } catch (err) {
      setDiscount(0);
      setPromoMsg(err instanceof Error ? err.message : 'كود غير صالح');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!area) {
      setError('اختاري المنطقة لإظهار سعر التوصيل');
      return;
    }
    if (requiresGender && !deliveryGender) {
      setError('اختاري نوع المندوب لحساب سعر التوصيل');
      return;
    }
    if (!canCheckout) {
      setError(
        unavailable.length
          ? 'بعض المنتجات في السلة غير متوفرة. ارجعي للسلة واحذفيها.'
          : 'تعذر إتمام الطلب لأن أحد المنتجات غير متوفر',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const order = await api<{
        id: string;
        orderNumber: string;
        totalAmount: number;
        subtotal: number;
        deliveryFee: number;
        discountAmount: number;
        status: string;
        deliveryType: string;
      }>('/store/checkout', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone,
          city,
          area,
          deliveryGender: requiresGender ? deliveryGender : undefined,
          landmark,
          notes,
          paymentMethod,
          attributionToken: attr.token,
          pagePublicCode: attr.pagePublicCode,
          agentPublicCode: attr.agentPublicCode,
          promoCode: promoCode || undefined,
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        }),
      });
      clear();
      navigate(`/order-success/${order.orderNumber}`, { state: order });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تأكيد الطلب');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container section">
      <div className="section-head">
        <h2>إتمام الطلب</h2>
      </div>
      <form className="panel form-grid two" onSubmit={onSubmit}>
        <label>
          الاسم
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          الهاتف
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
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
            <option value="">اختاري المنطقة</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {requiresGender ? (
          <label style={{ gridColumn: '1 / -1' }}>
            نوع المندوب
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={deliveryGender === 'FEMALE' ? 'btn' : 'btn secondary'}
                onClick={() => setDeliveryGender('FEMALE')}
              >
                مندوبة نسائية
                {areaDetail || quote?.femaleFee != null
                  ? ` — ${money(areaDetail?.femaleFee ?? quote?.femaleFee ?? 0)}`
                  : ''}
              </button>
              <button
                type="button"
                className={deliveryGender === 'MALE' ? 'btn' : 'btn secondary'}
                onClick={() => setDeliveryGender('MALE')}
              >
                مندوب رجالي
                {areaDetail || quote?.maleFee != null
                  ? ` — ${money(areaDetail?.maleFee ?? quote?.maleFee ?? 0)}`
                  : ''}
              </button>
            </div>
          </label>
        ) : null}
        <label>
          أقرب نقطة دالة
          <input value={landmark} onChange={(e) => setLandmark(e.target.value)} />
        </label>
        <label>
          طريقة الدفع
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="COD">الدفع عند الاستلام</option>
            <option value="CASH">نقداً</option>
            <option value="BANK_TRANSFER">تحويل بنكي</option>
          </select>
        </label>
        <label>
          ملاحظات
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        <div className="promo-row" style={{ gridColumn: '1 / -1' }}>
          <label style={{ flex: 1 }}>
            كود الخصم
            <div className="promo-apply">
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="أدخلي الكود إن وُجد"
              />
              <button className="btn secondary" type="button" onClick={() => void applyPromo()}>
                تطبيق
              </button>
            </div>
          </label>
          {promoMsg ? <div className="muted" style={{ fontSize: 13 }}>{promoMsg}</div> : null}
        </div>
        {deliveryNote ? (
          <div className="muted" style={{ gridColumn: '1 / -1', fontSize: 13 }}>
            {deliveryNote}
          </div>
        ) : null}
        <div style={{ gridColumn: '1 / -1' }} className="panel">
          <div>المجموع: {money(subtotal)}</div>
          {discount ? <div>الخصم: −{money(discount)}</div> : null}
          <div>
            {quote?.labelAr || 'رسوم التوصيل'}:{' '}
            {area ? money(deliveryFee) : '— اختاري المنطقة أولاً'}
          </div>
          <strong style={{ fontSize: 22, display: 'block', marginTop: 8 }}>
            الإجمالي:{' '}
            {area ? money(Math.max(0, subtotal - discount) + deliveryFee) : '—'}
          </strong>
        </div>
        {unavailable.length ? (
          <div className="stock-out-banner" style={{ gridColumn: '1 / -1' }} role="status">
            غير متوفر
            <span>احذفي المنتجات النافدة من السلة قبل تأكيد الطلب.</span>
          </div>
        ) : null}
        {error ? (
          <div className="error" style={{ gridColumn: '1 / -1' }}>
            {error}
          </div>
        ) : null}
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
          <button className="btn" type="submit" disabled={busy || !area || !canCheckout}>
            {busy ? 'جارٍ التأكيد...' : loaded && !canCheckout ? 'غير متوفر — تعذر تأكيد الطلب' : 'تأكيد الطلب'}
          </button>
          <Link className="btn secondary" to="/cart">
            رجوع للسلة
          </Link>
        </div>
      </form>
    </section>
  );
}
