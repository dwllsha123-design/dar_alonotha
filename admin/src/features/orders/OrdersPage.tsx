import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, sourceLabel, statusBadgeClass, statusLabel } from '@/api/client';

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

function orderAccuratessCode(o: Order): string | null {
  const d = o.deliveries?.[0];
  const raw = d?.trackingNumber || d?.externalRef || o.externalTrackingNumber;
  return raw ? String(raw).trim() : null;
}

type Page = { id: string; name: string; publicCode: number };

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
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [facebookPageId, setFacebookPageId] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api<Page[]>('/facebook-pages')
      .then(setPages)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (facebookPageId) params.set('facebookPageId', facebookPageId);
    const qs = params.toString();
    api<Order[]>(`/orders${qs ? `?${qs}` : ''}`)
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, [status, source, facebookPageId]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`order-row-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
          <p>من هنا تتابعين كل الطلبات (المتجر، فيسبوك، نقطة البيع): حالة الطلب، اسم الزبون، والمصدر. استخدمي الفلاتر للبحث، و«إضافة طلب جديد» لتسجيل طلب فيسبوك يدوياً.</p>
        </div>
        <Link className="btn" to="/orders/new">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            add
          </span>
          إضافة طلب جديد
        </Link>
      </div>

      {error ? <div className="error">{error}</div> : null}

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
              placeholder="بحث برقم الطلب أو العميل أو Accuratess..."
              style={{ minWidth: 220, height: 32, padding: '0 12px' }}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>تتبع Accuratess</th>
                <th>الصفحة</th>
                <th>المصدر</th>
                <th>العميل</th>
                <th>المدينة</th>
                <th>الحالة</th>
                <th>المبلغ</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  id={`order-row-${o.id}`}
                  className={focusId === o.id ? 'row-focus' : undefined}
                >
                  <td style={{ fontWeight: 600, color: 'var(--primary-container)' }}>
                    {o.orderNumber}
                  </td>
                  <td>
                    {(() => {
                      const code = orderAccuratessCode(o);
                      const url =
                        o.deliveries?.[0]?.trackingUrl || o.shippingLabelUrl || null;
                      return (
                        <div className="tracking-code">
                          <span className="tracking-code-label">رقم الشحنة</span>
                          <span className={`tracking-code-value${code ? '' : ' empty'}`}>
                            {code || '—'}
                          </span>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, marginTop: 2 }}
                            >
                              فتح التتبع
                            </a>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {o.facebookPage?.name || '—'}
                    {o.pagePublicCode || o.facebookPage?.publicCode ? (
                      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                        #{o.pagePublicCode || o.facebookPage?.publicCode}
                      </div>
                    ) : null}
                  </td>
                  <td>{sourceLabel[o.source] || o.source}</td>
                  <td>
                    <div>{o.shippingName || '—'}</div>
                    <div style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>
                      {o.shippingPhone || ''}
                    </div>
                  </td>
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
                  <td>
                    {o.fulfillmentType === 'INTERNAL' || o.deliveryType === 'INTERNAL'
                      ? o.courierId || o.courier || o.deliveries?.[0]?.agentId
                        ? (
                          <Link
                            className="btn secondary"
                            to={`/delivery/print?orderIds=${o.id}`}
                            target="_blank"
                          >
                            طباعة البوليصة
                          </Link>
                          )
                        : (
                          <span className="muted">عيّني مندوباً أولاً</span>
                          )
                      : (
                        <Link
                          className="btn secondary"
                          to={`/delivery/print?orderIds=${o.id}`}
                          target="_blank"
                        >
                          طباعة البوليصة
                        </Link>
                      )}
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={10} className="empty">
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
