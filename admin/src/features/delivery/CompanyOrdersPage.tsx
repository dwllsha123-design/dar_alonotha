import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, statusBadgeClass, statusLabel } from '@/api/client';

type CompanyOrder = {
  id: string;
  status: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  lastSyncedAt?: string | null;
  notes?: string | null;
  order: {
    orderNumber: string;
    shippingName?: string;
    shippingPhone?: string;
    city?: string;
    area?: string;
    facebookPage?: { name: string } | null;
  };
};

const ICONS: Record<string, { icon: string; label: string }> = {
  PENDING: { icon: 'schedule', label: 'بانتظار الشركة' },
  ASSIGNED: { icon: 'assignment_turned_in', label: 'استُلم في النظام' },
  PICKED_UP: { icon: 'inventory_2', label: 'تم الاستلام' },
  IN_TRANSIT: { icon: 'local_shipping', label: 'في الطريق' },
  DELIVERED: { icon: 'check_circle', label: 'تم التسليم' },
  FAILED: { icon: 'error', label: 'تعذر التسليم' },
  RETURNED: { icon: 'assignment_return', label: 'مرتجع' },
};

export function CompanyOrdersPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<CompanyOrder[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  async function load() {
    const data = await api<{ counts: Record<string, number>; orders: CompanyOrder[] }>(
      '/delivery/company-orders',
    );
    setCounts(data.counts || {});
    setOrders(data.orders || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = window.setInterval(() => load().catch(() => undefined), 15000);
    return () => window.clearInterval(t);
  }, []);

  async function syncAll() {
    setBusy(true);
    setError('');
    try {
      await api('/delivery/sync-accuratess', { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث');
    } finally {
      setBusy(false);
    }
  }

  const rows = filter ? orders.filter((o) => o.status === filter) : orders;

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>طلبات شركة التوصيل</h1>
          <p>حالات لحظية لطلبات خارج طرابلس بعد تمريرها تلقائياً عبر API الشركة. تُحدَّث كل 15 ثانية.</p>
        </div>
        <button className="btn" type="button" onClick={syncAll} disabled={busy}>
          {busy ? 'جاري التحديث...' : 'مزامنة الآن'}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="status-tiles">
        {Object.entries(ICONS).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={`status-tile${filter === key ? ' active' : ''}`}
            onClick={() => setFilter((v) => (v === key ? '' : key))}
          >
            <span className="material-symbols-outlined filled">{meta.icon}</span>
            <strong>{counts[key] || 0}</strong>
            <span>{meta.label}</span>
          </button>
        ))}
      </div>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>الحالة</th>
              <th>الطلب</th>
              <th>المدينة</th>
              <th>العميل</th>
              <th>التتبع</th>
              <th>آخر مزامنة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const meta = ICONS[d.status] || { icon: 'help', label: d.status };
              return (
                <tr key={d.id}>
                  <td>
                    <span className={statusBadgeClass(d.status)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        {meta.icon}
                      </span>
                      {statusLabel[d.status] || meta.label}
                    </span>
                  </td>
                  <td>
                    <div>{d.order.orderNumber}</div>
                    <div className="muted">{d.order.facebookPage?.name || ''}</div>
                  </td>
                  <td>{[d.order.area, d.order.city].filter(Boolean).join(' — ') || '—'}</td>
                  <td>
                    {d.order.shippingName}
                    <div className="muted">{d.order.shippingPhone}</div>
                  </td>
                  <td>
                    <div className="tracking-code">
                      <span className="tracking-code-label">رقم الشحنة</span>
                      <span
                        className={`tracking-code-value${d.trackingNumber ? '' : ' empty'}`}
                      >
                        {d.trackingNumber || '—'}
                      </span>
                      {d.trackingUrl ? (
                        <a href={d.trackingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          رابط التتبع
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {d.lastSyncedAt ? new Date(d.lastSyncedAt).toLocaleString('ar-LY') : '—'}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="empty">
                  لا توجد طلبات شركة توصيل
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Link className="btn secondary" to="/delivery">
        العودة للتوصيل
      </Link>
    </div>
  );
}
