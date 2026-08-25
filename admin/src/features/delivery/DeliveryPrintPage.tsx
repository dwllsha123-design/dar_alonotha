import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, money } from '@/api/client';

type Slip = {
  id: string;
  shippingSlipNo?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  accuratessCode?: string | null;
  pagePublicCode?: number | null;
  pageCode?: number | null;
  fee: string | number;
  type: string;
  status: string;
  senderName?: string | null;
  sourcePage?: string | number | null;
  agent?: { name: string; phone?: string } | null;
  company?: { nameAr: string } | null;
  order: {
    orderNumber: string;
    shippingName?: string;
    shippingPhone?: string;
    city?: string;
    area?: string;
    address?: string;
    notes?: string;
    totalAmount: string | number;
    externalTrackingNumber?: string | null;
    shippingLabelUrl?: string | null;
    items: Array<{
      productName: string;
      variantName?: string;
      quantity: number;
      lineTotal: string | number;
    }>;
    facebookPage?: { name: string; publicCode: number } | null;
    pagePublicCode?: number | null;
  };
};

function slipAccuratessCode(s: Slip): string | null {
  const raw =
    s.accuratessCode ||
    s.trackingNumber ||
    s.order.externalTrackingNumber ||
    null;
  return raw ? String(raw).trim() : null;
}

export function DeliveryPrintPage() {
  const [params] = useSearchParams();
  const ids = useMemo(
    () => (params.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean),
    [params],
  );
  const orderIds = useMemo(
    () => (params.get('orderIds') || '').split(',').map((s) => s.trim()).filter(Boolean),
    [params],
  );
  const pageId = params.get('pageId') || '';
  const [slips, setSlips] = useState<Slip[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const body: { ids?: string[]; orderIds?: string[]; facebookPageId?: string } = {};
    if (pageId) body.facebookPageId = pageId;
    else if (orderIds.length) body.orderIds = orderIds;
    else if (ids.length) body.ids = ids;
    else {
      setError('لا توجد بوليصات للطباعة');
      return;
    }
    api<{ slips: Slip[] }>('/delivery/slips/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    })
      .then((d) => {
        setSlips(d.slips || []);
        setTimeout(() => window.print(), 400);
      })
      .catch((e) => setError(e.message));
  }, [ids.join(','), orderIds.join(','), pageId]);

  if (error) return <div className="login-page">{error}</div>;
  if (!slips.length) return <div className="login-page">جارٍ تحميل البوليصات...</div>;

  return (
    <div className="print-root" dir="rtl">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .slip { page-break-after: always; }
        }
        .print-root { padding: 24px; font-family: "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #1a1a1a; }
        .slip { border: 1px solid #ccc; padding: 20px; margin-bottom: 24px; }
        .slip h1 { margin: 0 0 8px; font-size: 22px; }
        .accuratess-banner {
          margin: 14px 0 18px;
          padding: 14px 16px;
          border: 2px solid #9a3412;
          background: #fff7ed;
          border-radius: 8px;
          text-align: center;
        }
        .accuratess-banner .label {
          font-size: 13px;
          font-weight: 700;
          color: #9a3412;
          margin-bottom: 6px;
        }
        .accuratess-banner .code {
          font-family: ui-monospace, Consolas, monospace;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #7c2d12;
          direction: ltr;
          unicode-bidi: plaintext;
        }
        .accuratess-banner .missing {
          font-size: 16px;
          font-weight: 600;
          color: #94a3b8;
          letter-spacing: 0;
        }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
        .party { border: 1px solid #bbb; padding: 12px 14px; border-radius: 6px; }
        .party h2 { margin: 0 0 8px; font-size: 13px; color: #666; font-weight: 600; }
        .party .name { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 16px 0; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 13px; }
        th { background: #f5f5f5; }
      `}</style>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => window.print()}>
          طباعة
        </button>
        <button type="button" onClick={() => window.close()}>
          إغلاق
        </button>
      </div>
      {slips.map((s) => {
        const code = slipAccuratessCode(s);
        const trackUrl = s.trackingUrl || s.order.shippingLabelUrl || null;
        return (
          <section className="slip" key={s.id}>
            <h1>بوليصة شحن — دار الأنوثة</h1>
            <div>رقم البوليصة: {s.shippingSlipNo || '—'}</div>
            <div>رقم الطلب: {s.order.orderNumber}</div>

            <div className="accuratess-banner">
              <div className="label">رقم شحنة Accuratess / المعيار</div>
              {code ? (
                <div className="code">{code}</div>
              ) : (
                <div className="missing">لا يوجد رقم شحنة بعد</div>
              )}
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700 }}>
                رمز الصفحة:{' '}
                {s.pagePublicCode ??
                  s.pageCode ??
                  s.order.facebookPage?.publicCode ??
                  s.order.pagePublicCode ??
                  '—'}
              </div>
              {trackUrl ? (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  رابط التتبع: {trackUrl}
                </div>
              ) : null}
            </div>

            <div className="parties">
              <div className="party">
                <h2>الراسل</h2>
                <div className="name">
                  {s.senderName ||
                    s.order.facebookPage?.name ||
                    (typeof s.sourcePage === 'string' ? s.sourcePage : null) ||
                    'دار الأنوثة'}
                </div>
                <div>
                  رمز الصفحة:{' '}
                  {s.order.facebookPage?.publicCode || s.order.pagePublicCode || '—'}
                </div>
              </div>
              <div className="party">
                <h2>المستلم</h2>
                <div className="name">{s.order.shippingName || '—'}</div>
                <div>الهاتف: {s.order.shippingPhone || '—'}</div>
                <div>
                  {[s.order.address, s.order.area, s.order.city].filter(Boolean).join(' — ') ||
                    '—'}
                </div>
              </div>
            </div>
            <div className="meta">
              <div>
                <strong>رقم Accuratess:</strong> {code || '—'}
              </div>
              <div>التحصيل: {money(s.order.totalAmount)}</div>
              <div>رسوم التوصيل: {money(s.fee)}</div>
              <div>
                المندوب/الشركة:{' '}
                {s.agent?.name ||
                  s.company?.nameAr ||
                  (s.type === 'EXTERNAL' ? 'Accuratess' : '—')}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {s.order.items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      {it.productName}
                      {it.variantName ? ` — ${it.variantName}` : ''}
                    </td>
                    <td>{it.quantity}</td>
                    <td>{money(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.order.notes ? <p style={{ marginTop: 12 }}>ملاحظات: {s.order.notes}</p> : null}
          </section>
        );
      })}
    </div>
  );
}
