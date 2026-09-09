import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, sourceLabel, statusBadgeClass, statusLabel } from '@/api/client';

type OrderItem = {
  id: string;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: string | number;
  lineTotal: string | number;
  imageUrl?: string | null;
};

type Order = {
  id: string;
  orderNumber: string;
  source: string;
  status: string;
  totalAmount: string | number;
  shippingName?: string;
  shippingPhone?: string;
  city?: string;
  createdAt: string;
  pagePublicCode?: number | null;
  deliveryType?: string;
  fulfillmentType?: string | null;
  courierId?: string | null;
  externalTrackingNumber?: string | null;
  shippingLabelUrl?: string | null;
  courier?: { id: string; name: string } | null;
  facebookPage?: { id: string; name: string; publicCode?: number } | null;
  createdBy?: { id: string; name: string } | null;
  items?: OrderItem[];
  deliveries?: Array<{
    id: string;
    shippingSlipNo?: string | null;
    status: string;
    agentId?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    externalRef?: string | null;
  }>;
};

type Courier = { id: string; name: string; phone?: string | null; isActive: boolean };
type Page = { id: string; name: string; publicCode: number };

function orderAccuratessCode(o: Order): string | null {
  const d = o.deliveries?.[0];
  const raw = d?.trackingNumber || d?.externalRef || o.externalTrackingNumber;
  return raw ? String(raw).trim() : null;
}

function isExternalOrder(o: Order) {
  if (o.fulfillmentType === 'EXTERNAL' || o.deliveryType === 'EXTERNAL') return true;
  if (o.fulfillmentType === 'INTERNAL' || o.deliveryType === 'INTERNAL') return false;
  const city = (o.city || '').replace(/\s+/g, '');
  return Boolean(city) && !city.includes('طرابلس');
}

function canPrintWaybill(o: Order) {
  if (o.courierId || o.courier) return true;
  const d = o.deliveries?.[0];
  if (d?.shippingSlipNo || d?.trackingNumber || d?.externalRef) return true;
  if (o.externalTrackingNumber) return true;
  return false;
}

const STATUS_TABS = [
  { value: '', label: 'الكل' },
  { value: 'NEW', label: 'جديد' },
  { value: 'CONFIRMED', label: 'مؤكد' },
  { value: 'PREPARING', label: 'تجهيز' },
  { value: 'OUT_FOR_DELIVERY', label: 'توصيل' },
  { value: 'DELIVERED', label: 'مسلم' },
  { value: 'CANCELLED', label: 'ملغي' },
];

export function OrdersPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus') || '';
  const [orders, setOrders] = useState<Order[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [facebookPageId, setFacebookPageId] = useState('');
  const [q, setQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refreshOrders() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (facebookPageId) params.set('facebookPageId', facebookPageId);
    const qs = params.toString();
    const list = await api<Order[]>(`/orders${qs ? `?${qs}` : ''}`);
    setOrders(list);
    return list;
  }

  useEffect(() => {
    api<Page[]>('/facebook-pages')
      .then(setPages)
      .catch(() => undefined);
    api<Courier[]>('/couriers')
      .then(setCouriers)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshOrders().catch((e) => setError(e.message));
  }, [status, source, facebookPageId]);

  const activeCouriers = useMemo(
    () => couriers.filter((c) => c.isActive),
    [couriers],
  );

  function startAssign(orderId: string) {
    setError('');
    setMsg('');
    setAssigningId(orderId);
    setSelectedCourierId('');
  }

  function cancelAssign() {
    setAssigningId(null);
    setSelectedCourierId('');
  }

  async function confirmAssign(o: Order) {
    setError('');
    setMsg('');
    setBusyId(o.id);
    try {
      if (isExternalOrder(o)) {
        await api(`/orders/${o.id}/fulfill`, { method: 'POST', body: '{}' });
        setMsg(`تم إرسال الطلب ${o.orderNumber} لشركة التوصيل`);
      } else {
        if (!selectedCourierId) {
          setError('اختاري مندوباً أولاً');
          return;
        }
        await api(`/orders/${o.id}/assign-courier`, {
          method: 'POST',
          body: JSON.stringify({ courierId: selectedCourierId }),
        });
        setMsg(`تم تعيين المندوب للطلب ${o.orderNumber}`);
      }
      cancelAssign();
      await refreshOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التعيين');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!focusId) return;
    setExpandedId(focusId);
    const el = document.getElementById(`order-row-${focusId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, orders]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((o) =>
      [
        o.orderNumber,
        o.shippingName,
        o.shippingPhone,
        o.city,
        o.facebookPage?.name,
        orderAccuratessCode(o),
        ...(o.items || []).map((i) => i.productName),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [orders, q]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: orders.length };
    for (const o of orders) map[o.status] = (map[o.status] || 0) + 1;
    return map;
  }, [orders]);

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>إدارة الطلبات</h1>
          <p>
            اضغطي على الطلب لعرض صور المنتجات — لتسهيل التجهيز والإخراج. الطلبات الجديدة والمؤكدة
            تظهر بصور كل لون/مقاس.
          </p>
        </div>
        <Link className="btn" to="/orders/new">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            add
          </span>
          إضافة طلب جديد
        </Link>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {msg ? (
        <div className="panel" style={{ padding: '10px 14px', color: 'var(--primary-container)' }}>
          {msg}
        </div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="stat-label">إجمالي المعروض</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">جديد</div>
          <div className="stat-value">{counts.NEW || 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">قيد التجهيز/التوصيل</div>
          <div className="stat-value">
            {(counts.PREPARING || 0) + (counts.OUT_FOR_DELIVERY || 0) + (counts.READY || 0)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">تم التسليم</div>
          <div className="stat-value">{counts.DELIVERED || 0}</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_TABS.map((t) => (
              <button
                key={t.value || 'all'}
                type="button"
                className={`btn sm ${status === t.value ? '' : 'secondary'}`}
                onClick={() => setStatus(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={facebookPageId}
              onChange={(e) => setFacebookPageId(e.target.value)}
              style={{ minWidth: 180, height: 32, padding: '0 10px' }}
            >
              <option value="">كل الصفحات</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (#{p.publicCode})
                </option>
              ))}
            </select>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{ minWidth: 140, height: 32, padding: '0 10px' }}
            >
              <option value="">كل المصادر</option>
              <option value="WEBSITE">الموقع</option>
              <option value="FACEBOOK">فيسبوك</option>
              <option value="POS">نقطة البيع</option>
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث برقم الطلب أو العميل أو المنتج..."
              style={{ minWidth: 220, height: 32, padding: '0 12px' }}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>المنتجات</th>
                <th>العميل</th>
                <th>أنشأه</th>
                <th>المدينة</th>
                <th>الحالة</th>
                <th>المبلغ</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const open = expandedId === o.id;
                const items = o.items || [];
                return (
                  <Fragment key={o.id}>
                    <tr
                      id={`order-row-${o.id}`}
                      className={`${focusId === o.id ? 'row-focus ' : ''}order-row-click`.trim()}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(open ? null : o.id)}
                    >
                      <td style={{ fontWeight: 600, color: 'var(--primary-container)' }}>
                        {o.orderNumber}
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 400 }}>
                          {sourceLabel[o.source] || o.source}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {items.slice(0, 4).map((item) =>
                            item.imageUrl ? (
                              <img
                                key={item.id}
                                src={item.imageUrl}
                                alt={item.productName}
                                title={`${item.productName} × ${item.quantity}`}
                                style={{
                                  width: 44,
                                  height: 55,
                                  objectFit: 'cover',
                                  borderRadius: 6,
                                  border: '1px solid var(--outline-variant)',
                                }}
                              />
                            ) : (
                              <span
                                key={item.id}
                                className="muted"
                                style={{ fontSize: 12, maxWidth: 80 }}
                                title={item.productName}
                              >
                                {item.productName.slice(0, 12)}
                              </span>
                            ),
                          )}
                          {items.length > 4 ? (
                            <span className="muted" style={{ fontSize: 12 }}>
                              +{items.length - 4}
                            </span>
                          ) : null}
                          {!items.length ? <span className="muted">—</span> : null}
                        </div>
                      </td>
                      <td>
                        <div>{o.shippingName || '—'}</div>
                        <div style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>
                          {o.shippingPhone || ''}
                        </div>
                      </td>
                      <td>{o.createdBy?.name || '—'}</td>
                      <td>{o.city || '—'}</td>
                      <td>
                        <span
                          className={statusBadgeClass(
                            o.deliveries?.[0]?.status === 'FAILED' ? 'FAILED' : o.status,
                          )}
                        >
                          {o.deliveries?.[0]?.status === 'FAILED'
                            ? statusLabel.FAILED
                            : statusLabel[o.status] || o.status}
                        </span>
                      </td>
                      <td>{money(o.totalAmount)}</td>
                      <td style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>
                        {new Date(o.createdAt).toLocaleString('ar-LY')}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {canPrintWaybill(o) ? (
                          <Link
                            className="btn secondary sm"
                            to={`/delivery/print?orderIds=${o.id}`}
                            target="_blank"
                          >
                            طباعة البوليصة
                          </Link>
                        ) : assigningId === o.id ? (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              minWidth: 180,
                            }}
                          >
                            {!isExternalOrder(o) ? (
                              <select
                                value={selectedCourierId}
                                onChange={(e) => setSelectedCourierId(e.target.value)}
                                style={{ height: 32, padding: '0 8px' }}
                                disabled={busyId === o.id}
                              >
                                <option value="">اختر المندوب</option>
                                {activeCouriers.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.phone ? ` — ${c.phone}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>
                                خارج طرابلس → Accuratess
                              </span>
                            )}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn sm"
                                disabled={
                                  busyId === o.id ||
                                  (!isExternalOrder(o) && !selectedCourierId)
                                }
                                onClick={() => confirmAssign(o)}
                              >
                                {busyId === o.id ? 'جاري…' : 'تأكيد'}
                              </button>
                              <button
                                type="button"
                                className="btn secondary sm"
                                disabled={busyId === o.id}
                                onClick={cancelAssign}
                              >
                                إلغاء
                              </button>
                            </div>
                            {!isExternalOrder(o) && !activeCouriers.length ? (
                              <span className="muted" style={{ fontSize: 12 }}>
                                لا يوجد مندوبون نشطون — أضيفي من صفحة التوصيل
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => startAssign(o.id)}
                          >
                            تعيين مندوب
                          </button>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--surface-container-low)' }}>
                          <div style={{ padding: '12px 8px' }}>
                            <strong style={{ display: 'block', marginBottom: 10 }}>
                              تجهيز الطلب — {items.length} منتج
                            </strong>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 12,
                              }}
                            >
                              {items.map((item) => (
                                <div
                                  key={item.id}
                                  style={{
                                    display: 'flex',
                                    gap: 10,
                                    padding: 10,
                                    borderRadius: 10,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--outline-variant)',
                                  }}
                                >
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.productName}
                                      style={{
                                        width: 72,
                                        height: 90,
                                        objectFit: 'cover',
                                        borderRadius: 8,
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: 72,
                                        height: 90,
                                        borderRadius: 8,
                                        background: 'var(--surface-container)',
                                        display: 'grid',
                                        placeItems: 'center',
                                        flexShrink: 0,
                                      }}
                                    >
                                      <span className="material-symbols-outlined">checkroom</span>
                                    </div>
                                  )}
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600 }}>{item.productName}</div>
                                    {item.variantName ? (
                                      <div className="muted" style={{ fontSize: 13 }}>
                                        {item.variantName}
                                      </div>
                                    ) : null}
                                    <div style={{ marginTop: 6, fontSize: 14 }}>
                                      الكمية: <strong>{item.quantity}</strong>
                                    </div>
                                    {item.sku ? (
                                      <div className="muted" style={{ fontSize: 12 }}>
                                        SKU: {item.sku}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {orderAccuratessCode(o) ? (
                              <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                                تتبع Accuratess: {orderAccuratessCode(o)}
                              </div>
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
                  <td colSpan={9} className="empty">
                    لا توجد طلبات مطابقة
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
