import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, statusBadgeClass, statusLabel } from '@/api/client';

type Delivery = {
  id: string;
  status: string;
  type: string;
  shippingSlipNo?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  externalRef?: string | null;
  accuratessCode?: string | null;
  lastSyncedAt?: string | null;
  fee: string | number;
  notes?: string;
  order: {
    id: string;
    orderNumber: string;
    shippingName?: string;
    shippingPhone?: string;
    city?: string;
    area?: string;
    totalAmount: string | number;
    deliveryType?: string;
    deliveryFee?: string | number;
    pagePublicCode?: number | null;
    fulfillmentType?: string | null;
    localStatus?: string | null;
    externalTrackingNumber?: string | null;
    facebookPage?: { id: string; name: string; publicCode: number } | null;
    courier?: { id: string; name: string; phone?: string | null } | null;
  };
  agent?: { name: string; phone?: string } | null;
  company?: { nameAr: string } | null;
};

type PendingOrder = {
  id: string;
  orderNumber: string;
  shippingName?: string;
  shippingPhone?: string;
  city?: string;
  area?: string;
  deliveryType: string;
  fulfillmentType?: string | null;
  localStatus?: string | null;
  deliveryFee: string | number;
  deliveryGender?: 'MALE' | 'FEMALE' | null;
  totalAmount: string | number;
  status: string;
  facebookPage?: { id: string; name: string; publicCode: number } | null;
  courierId?: string | null;
};

type Page = { id: string; name: string; publicCode: number };

type Agent = { id: string; name: string; phone?: string };
type Courier = { id: string; name: string; phone?: string | null; isActive: boolean };

export function DeliveryPage() {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [courierId, setCourierId] = useState('');
  const [courierName, setCourierName] = useState('');
  const [courierPhone, setCourierPhone] = useState('');
  const [fee, setFee] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const selected = useMemo(
    () => pending.find((o) => o.id === orderId) || null,
    [pending, orderId],
  );

  async function load() {
    const qs = pageId ? `?facebookPageId=${encodeURIComponent(pageId)}` : '';
    const [d, p, a, pg, c] = await Promise.all([
      api<Delivery[]>(`/delivery${qs}`),
      api<PendingOrder[]>('/delivery/pending-orders'),
      api<Agent[]>('/delivery/agents').catch(() => [] as Agent[]),
      api<Page[]>('/facebook-pages').catch(() => [] as Page[]),
      api<Courier[]>('/couriers').catch(() => [] as Courier[]),
    ]);
    setRows(d);
    setPending(p);
    setAgents(a);
    setPages(pg);
    setCouriers(c);
    if (!orderId && p[0]) setOrderId(p[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [pageId]);

  useEffect(() => {
    if (!selected) {
      setFee(null);
      return;
    }
    setFee(Number(selected.deliveryFee || 0));
    const qs = new URLSearchParams();
    if (selected.city) qs.set('city', selected.city);
    if (selected.area) qs.set('area', selected.area);
    if (selected.deliveryGender) qs.set('gender', selected.deliveryGender);
    else if (selected.deliveryType === 'INTERNAL' || selected.fulfillmentType === 'INTERNAL') {
      qs.set('gender', 'MALE');
    }
    api<{ deliveryFee: number }>(`/delivery/quote?${qs}`)
      .then((q) => setFee(q.deliveryFee))
      .catch(() => undefined);
  }, [selected?.id]);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setMsg('');
    try {
      const isInternal =
        selected.deliveryType === 'INTERNAL' || selected.fulfillmentType === 'INTERNAL';
      if (isInternal && courierId) {
        await api(`/orders/${orderId}/assign-courier`, {
          method: 'POST',
          body: JSON.stringify({ courierId }),
        });
        setMsg('تم إسناد الطلب للمندوب المحلي');
      } else {
        await api('/delivery/assign', {
          method: 'POST',
          body: JSON.stringify({
            orderId,
            type: selected.deliveryType,
            agentId: isInternal ? agentId || undefined : undefined,
            fee: fee ?? Number(selected.deliveryFee || 0),
          }),
        });
        setMsg(isInternal ? 'تم تعيين المندوب بنجاح' : 'تم إرسال الطلب لـ Accuratess');
      }
      setAgentId('');
      setCourierId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التعيين');
    }
  }

  async function setLocalStatus(orderIdForStatus: string, localStatus: string) {
    setError('');
    setMsg('');
    try {
      await api(`/orders/${orderIdForStatus}/local-status`, {
        method: 'PATCH',
        body: JSON.stringify({ localStatus }),
      });
      setMsg(
        localStatus === 'DELIVERED'
          ? 'تم التسليم'
          : localStatus === 'FAILED'
            ? 'تعذر التسليم'
            : 'تم تحديث حالة التوصيل الداخلي',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث الحالة');
    }
  }

  async function toggleCourier(c: Courier) {
    await api(`/couriers/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    await load();
  }

  async function syncOne(id: string) {
    setError('');
    setMsg('');
    try {
      await api(`/delivery/${id}/sync-accuratess`, { method: 'POST', body: '{}' });
      setMsg('تم تحديث حالة الشحنة من Accuratess');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل المزامنة');
    }
  }

  async function syncAll() {
    setError('');
    setMsg('');
    try {
      const res = await api<{ count: number }>('/delivery/sync-accuratess', {
        method: 'POST',
        body: '{}',
      });
      setMsg(`تمت مزامنة ${res.count} شحنة`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل المزامنة');
    }
  }

  async function addCourier(e: FormEvent) {
    e.preventDefault();
    if (!courierName.trim()) return;
    setError('');
    try {
      await api('/couriers', {
        method: 'POST',
        body: JSON.stringify({
          name: courierName.trim(),
          phone: courierPhone.trim() || undefined,
        }),
      });
      setCourierName('');
      setCourierPhone('');
      setMsg('تم إضافة المندوب');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة المندوب');
    }
  }

  async function fulfillSelected() {
    if (!orderId) return;
    setError('');
    setMsg('');
    try {
      const res = await api<{
        fulfillmentType: string;
        error?: string | null;
        externalTrackingNumber?: string | null;
        accuratessCode?: string | null;
        order?: { externalTrackingNumber?: string | null };
        fulfillmentError?: string | null;
      }>(`/orders/${orderId}/fulfill`, { method: 'POST', body: '{}' });
      const code = (
        res.externalTrackingNumber ||
        res.accuratessCode ||
        res.order?.externalTrackingNumber ||
        ''
      ).trim();
      if (res.fulfillmentType === 'INTERNAL') {
        setMsg('تم توجيه الطلب للتوصيل الداخلي');
      } else if (res.error || res.fulfillmentError) {
        setMsg(
          `شحن خارجي مع تنبيه: ${res.error || res.fulfillmentError}${
            code ? ` — رقم Accuratess: ${code}` : ''
          }`,
        );
      } else {
        setMsg(
          code
            ? `تم إرسال الطلب لشركة المعيار — رقم الشحنة: ${code}`
            : 'تم إرسال الطلب لشركة المعيار بحساب الصفحة',
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التوجيه');
    }
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>التوصيل</h1>
          <p>
            من هنا تنظّمين شحن الطلبات: طرابلس عبر المناديب المحليين، وخارجها عبر المعيار بمفتاح
            حساب الصفحة تلقائياً. يمكن أيضاً إعادة توجيه طلب يدوياً وطباعة البوليصات.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/delivery/company">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              local_shipping
            </span>
            طلبات شركة التوصيل
          </Link>
          <Link className="btn secondary" to="/tripoli-drivers">
            مناديب طرابلس
          </Link>
          <button className="btn secondary" type="button" onClick={() => syncAll()}>
            تحديث من Accuratess
          </button>
          <Link
            className="btn"
            to={
              pageId
                ? `/delivery/print?pageId=${pageId}`
                : `/delivery/print?ids=${(selectedIds.length ? selectedIds : rows.map((r) => r.id)).join(',')}`
            }
            target="_blank"
          >
            طباعة {pageId ? 'بوليصات الصفحة' : selectedIds.length ? `المحددة (${selectedIds.length})` : 'الكل'}
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">بانتظار التعيين</div>
          <div className="stat-value">{pending.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">المندوبون</div>
          <div className="stat-value">{agents.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">سجلات التوصيل</div>
          <div className="stat-value">{rows.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">خارجي معلّق</div>
          <div className="stat-value">
            {rows.filter((r) => r.type === 'EXTERNAL' && r.status === 'PENDING').length}
          </div>
        </div>
      </div>

      <form className="panel form-grid two" onSubmit={assign}>
        <div style={{ gridColumn: '1 / -1' }}>
          <strong>تعيين توصيل</strong>
        </div>
        <label>
          الطلب
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} required>
            <option value="">اختر طلب</option>
            {pending
              .filter((o) => !pageId || o.facebookPage?.id === pageId)
              .map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber} — {o.facebookPage?.name || 'بدون صفحة'} — {o.city || '—'} (
                {o.deliveryType === 'INTERNAL' ? 'داخلي' : 'خارجي'})
              </option>
            ))}
          </select>
        </label>
        {selected?.deliveryType === 'INTERNAL' || selected?.fulfillmentType === 'INTERNAL' ? (
          <>
            <label>
              المندوب المحلي
              <select value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                <option value="">اختر مندوب من قائمة المناديب</option>
                {couriers
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` — ${c.phone}` : ''}
                    </option>
                  ))}
              </select>
            </label>
            {!couriers.filter((c) => c.isActive).length ? (
              <label>
                مندوب نظام (احتياطي)
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  <option value="">اختر مندوب مستخدم</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.phone ? ` — ${a.phone}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : (
          <label>
            شركة التوصيل
            <input value="المعيار — بمفتاح حساب الصفحة تلقائياً" disabled />
          </label>
        )}
        <label>
          رسوم التوصيل
          <input type="number" value={fee ?? ''} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
        <div style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={!orderId}>
            {selected?.deliveryType === 'INTERNAL' || selected?.fulfillmentType === 'INTERNAL'
              ? 'إسناد لمندوب محلي'
              : 'إرسال لشركة التوصيل'}
          </button>
          <button className="btn secondary" type="button" disabled={!orderId} onClick={() => void fulfillSelected()}>
            توجيه ذكي (طرابلس/خارجي)
          </button>
        </div>
        {msg ? <div className="success" style={{ gridColumn: '1 / -1' }}>{msg}</div> : null}
        {error ? <div className="error" style={{ gridColumn: '1 / -1' }}>{error}</div> : null}
      </form>

      <form className="panel form-grid two" onSubmit={addCourier}>
        <div style={{ gridColumn: '1 / -1' }}>
          <strong>مناديب التوصيل المحلي (طرابلس)</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            المناديب النشطون: {couriers.filter((c) => c.isActive).length}
          </p>
          {couriers.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {couriers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`btn sm ${c.isActive ? 'secondary' : 'ghost'}`}
                  onClick={() => void toggleCourier(c)}
                  title={c.isActive ? 'إيقاف' : 'تفعيل'}
                >
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ''}
                  {c.isActive ? '' : ' (متوقف)'}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">لا يوجد مناديب بعد — أضيفي الأول أدناه</p>
          )}
        </div>
        <label>
          اسم المندوب
          <input value={courierName} onChange={(e) => setCourierName(e.target.value)} required />
        </label>
        <label>
          الهاتف
          <input value={courierPhone} onChange={(e) => setCourierPhone(e.target.value)} />
        </label>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="btn secondary" type="submit">
            إضافة مندوب
          </button>
        </div>
      </form>

      <div className="panel table-wrap">
        <div className="toolbar">
          <strong>سجلات التوصيل</strong>
          <select
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            style={{ minWidth: 200, height: 36, padding: '0 10px' }}
          >
            <option value="">كل الصفحات</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (#{p.publicCode})
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>البوليصة</th>
              <th>الطلب</th>
              <th>الصفحة</th>
              <th>النوع</th>
              <th>المندوب / الحالة المحلية</th>
              <th>العميل</th>
              <th>تتبع المعيار</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
                <td>{d.shippingSlipNo || '—'}</td>
                <td>{d.order.orderNumber}</td>
                <td>
                  {d.order.facebookPage?.name || '—'}
                  {d.order.facebookPage?.publicCode || d.order.pagePublicCode ? (
                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                      #{d.order.facebookPage?.publicCode || d.order.pagePublicCode}
                    </div>
                  ) : null}
                </td>
                <td>{d.type === 'INTERNAL' ? 'داخلي' : 'خارجي'}</td>
                <td>
                  {d.type === 'INTERNAL' ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 13 }}>
                        {d.order.courier?.name || d.agent?.name || 'بدون مندوب'}
                      </div>
                      <select
                        value={d.order.localStatus || ''}
                        onChange={(e) => {
                          if (e.target.value) void setLocalStatus(d.order.id, e.target.value);
                        }}
                        style={{ height: 32, fontSize: 12 }}
                      >
                        <option value="">الحالة المحلية</option>
                        <option value="PENDING">قيد الانتظار</option>
                        <option value="IN_WAREHOUSE">داخل المخزن</option>
                        <option value="OUT_FOR_DELIVERY">قيد التوصيل</option>
                        <option value="DELIVERED">تم التسليم</option>
                        <option value="FAILED">تعذر التسليم</option>
                        <option value="RETURNED">مرتجع</option>
                      </select>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {d.order.shippingName}
                  <div style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>
                    {d.order.shippingPhone}
                  </div>
                </td>
                <td>
                  {(() => {
                    const code =
                      d.accuratessCode ||
                      d.trackingNumber ||
                      d.externalRef ||
                      d.order.externalTrackingNumber ||
                      null;
                    return (
                      <div className="tracking-code">
                        <span className="tracking-code-label">Accuratess</span>
                        <span className={`tracking-code-value${code ? '' : ' empty'}`}>
                          {code || '—'}
                        </span>
                        {d.trackingUrl ? (
                          <a href={d.trackingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                            رابط التتبع
                          </a>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <span className={statusBadgeClass(d.status)}>
                    {statusLabel[d.status] || d.status}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {d.type === 'INTERNAL' && !d.order.courier && !d.agent ? (
                    <span className="muted">عيّني مندوباً أولاً</span>
                  ) : (
                    <Link className="btn secondary" to={`/delivery/print?ids=${d.id}`} target="_blank">
                      طباعة
                    </Link>
                  )}
                  {d.type === 'EXTERNAL' ? (
                    <button className="btn ghost" type="button" onClick={() => syncOne(d.id)}>
                      تحديث
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={10} className="empty">
                  لا توجد سجلات توصيل
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
