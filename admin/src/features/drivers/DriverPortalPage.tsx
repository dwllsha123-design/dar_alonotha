import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, money } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { BarcodeScanner } from '@/components/BarcodeScanner';

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED' | string;
type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'COD' | 'OTHER' | string;

type OrderCard = {
  id: string;
  orderNumber: string;
  orderBarcode?: string;
  shippingName?: string;
  shippingPhone?: string;
  area?: string;
  address?: string;
  city?: string;
  localStatus?: string | null;
  status: string;
  totalAmount: string | number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  items: Array<{ productName: string; quantity: number }>;
};

function isPrepaid(paymentStatus?: PaymentStatus) {
  return paymentStatus === 'PAID';
}

function paymentLabel(paymentStatus?: PaymentStatus) {
  if (paymentStatus === 'PAID') return 'خالصة (مدفوعة مسبقاً)';
  if (paymentStatus === 'PARTIAL') return 'مدفوعة جزئياً — أكمل التحصيل عند الاستلام';
  if (paymentStatus === 'REFUNDED') return 'مسترجعة';
  return 'الدفع عند الاستلام';
}

export function DriverPortalPage() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState<'new' | 'way' | 'done' | 'return'>('new');
  const [grouped, setGrouped] = useState<{
    new: OrderCard[];
    onTheWay: OrderCard[];
    delivered: OrderCard[];
    returns: OrderCard[];
  }>({ new: [], onTheWay: [], delivered: [], returns: [] });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanOn, setScanOn] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{
      new: OrderCard[];
      onTheWay: OrderCard[];
      delivered: OrderCard[];
      returns: OrderCard[];
    }>('/driver/orders');
    setGrouped({
      new: data.new || [],
      onTheWay: data.onTheWay || [],
      delivered: data.delivered || [],
      returns: data.returns || [],
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    load().catch((e) => setError(e.message));
    const t = window.setInterval(() => {
      load().catch(() => undefined);
      api('/driver/heartbeat', { method: 'POST', body: '{}' }).catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(t);
  }, [user, load]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const send = (lat: number, lng: number) => {
      api('/driver/location', {
        method: 'POST',
        body: JSON.stringify({ lat, lng }),
      }).catch(() => undefined);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => send(p.coords.latitude, p.coords.longitude),
      () => undefined,
      { enableHighAccuracy: true },
    );
    const watch = navigator.geolocation.watchPosition(
      (p) => send(p.coords.latitude, p.coords.longitude),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  if (loading) return <div className="login-page">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;

  async function setStatus(id: string, localStatus: string) {
    setError('');
    try {
      await api(`/driver/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ localStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث');
    }
  }

  async function doReturn(code: string) {
    setError('');
    setMsg('');
    setScanOn(false);
    try {
      await api('/driver/returns', {
        method: 'POST',
        body: JSON.stringify({ barcode: code, reason: 'failed_delivery_return' }),
      });
      setMsg('تم إرجاع الطلبية إلى المخزن وتحديث الحالة');
      setBarcode('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الإرجاع');
    }
  }

  const lists = {
    new: grouped.new,
    way: grouped.onTheWay,
    done: grouped.delivered,
    return: grouped.returns,
  };
  const current = lists[tab];

  return (
    <div className="driver-shell">
      <header className="driver-head">
        <div>
          <strong>{user.name}</strong>
          <div className="muted">مناديب طرابلس</div>
        </div>
        <button className="btn ghost" type="button" onClick={logout}>
          خروج
        </button>
      </header>

      <div className="driver-tiles">
        <button type="button" className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          <span className="material-symbols-outlined">package_2</span>
          طلبات جديدة
          <b>{grouped.new.length}</b>
        </button>
        <button type="button" className={tab === 'way' ? 'active' : ''} onClick={() => setTab('way')}>
          <span className="material-symbols-outlined">local_shipping</span>
          في الطريق
          <b>{grouped.onTheWay.length}</b>
        </button>
        <button type="button" className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>
          <span className="material-symbols-outlined">check_circle</span>
          تم التوصيل
          <b>{grouped.delivered.length}</b>
        </button>
        <button
          type="button"
          className={tab === 'return' ? 'active' : ''}
          onClick={() => {
            setTab('return');
            setScanOn(true);
          }}
        >
          <span className="material-symbols-outlined">restart_alt</span>
          إرجاع
          <b>{grouped.returns.length}</b>
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="badge success">{msg}</div> : null}

      {tab === 'return' ? (
        <div className="panel stack">
          <p>امسحي باركود الطلبية المتعذر تسليمها. تُحدَّث الحالة ويُرجع المخزون تلقائياً.</p>
          <button className="btn" type="button" onClick={() => setScanOn((v) => !v)}>
            {scanOn ? 'إيقاف الكاميرا' : 'فتح قارئ الباركود'}
          </button>
          {scanOn ? (
            <BarcodeScanner
              active={scanOn}
              onDetected={(code) => {
                setBarcode(code);
                void doReturn(code);
              }}
            />
          ) : null}
          <form
            className="toolbar"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (barcode.trim()) void doReturn(barcode.trim());
            }}
          >
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="ORD-...."
              style={{ flex: 1 }}
            />
            <button className="btn" type="submit">
              إرجاع للمخزن
            </button>
          </form>
        </div>
      ) : null}

      <div className="stack">
        {current.map((o) => {
          const prepaid = isPrepaid(o.paymentStatus);
          const collectAmount = prepaid ? 0 : Number(o.totalAmount || 0);
          return (
            <article key={o.id} className="panel stack">
              <strong>{o.orderNumber}</strong>
              <div>{o.shippingName} — {o.shippingPhone}</div>
              <div className="muted">{[o.address, o.area, o.city].filter(Boolean).join(' — ')}</div>
              <div>{o.items.map((i) => `${i.productName} ×${i.quantity}`).join('، ')}</div>

              <div className={`driver-pay ${prepaid ? 'is-paid' : 'is-cod'}`}>
                <span className={`badge ${prepaid ? 'success' : 'warning'}`}>
                  {paymentLabel(o.paymentStatus)}
                </span>
                {prepaid ? (
                  <div className="driver-pay-amount">
                    <span className="muted">لا يوجد مبلغ للتحصيل</span>
                    <strong className="driver-pay-value muted">{money(0)}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      إجمالي الطلبية: {money(o.totalAmount)}
                    </span>
                  </div>
                ) : (
                  <div className="driver-pay-amount">
                    <span>المبلغ المطلوب تحصيله</span>
                    <strong className="driver-pay-value">{money(collectAmount)}</strong>
                  </div>
                )}
              </div>

              {tab === 'new' ? (
                <button className="btn" type="button" onClick={() => setStatus(o.id, 'OUT_FOR_DELIVERY')}>
                  استلام والانطلاق
                </button>
              ) : null}
              {tab === 'way' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" type="button" onClick={() => setStatus(o.id, 'DELIVERED')}>
                    تم التوصيل
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setStatus(o.id, 'FAILED')}>
                    تعذر الاستلام
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {!current.length && tab !== 'return' ? <div className="empty">لا توجد طلبات في هذا القسم</div> : null}
      </div>
    </div>
  );
}
