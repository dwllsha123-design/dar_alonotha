import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, statusBadgeClass } from '@/api/client';
import type { PageSummary } from './pageStaffShared';

export function FacebookPagesListPage() {
  const [rows, setRows] = useState<PageSummary[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const data = await api<PageSummary[]>('/facebook-pages/admin/summary');
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (q && !r.name.includes(q) && !String(r.publicCode).includes(q)) return false;
      return true;
    });
  }, [rows, q, status]);

  async function toggleStatus(p: PageSummary) {
    const next = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const label = next === 'ACTIVE' ? 'تفعيل' : 'تعطيل';
    if (!confirm(`${label} صفحة «${p.name}»؟`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      setMsg(`تم ${label} الصفحة`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>صفحات الفيسبوك</h1>
          <p>إدارة الصفحات والموظفات والأداء — بدون ربط Messenger API.</p>
        </div>
        <Link className="btn" to="/facebook-pages/new">
          إضافة صفحة
        </Link>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="panel" style={{ padding: 12 }}>{msg}</div> : null}

      <div className="panel toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <input
          placeholder="بحث باسم الصفحة..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="ALL">كل الحالات</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
      </div>

      {!filtered.length ? (
        <div className="panel muted">لا صفحات مطابقة.</div>
      ) : (
        <div className="table-wrap panel">
          <table>
            <thead>
              <tr>
                <th>اسم الصفحة</th>
                <th>الحالة</th>
                <th>الموظفات</th>
                <th>طلبات اليوم</th>
                <th>طلبات الشهر</th>
                <th>مُسلّم</th>
                <th>المبيعات (مُسلّم)</th>
                <th>آخر طلب</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/facebook-pages/${p.id}`}>
                      <strong>{p.name}</strong>
                    </Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      #{p.publicCode}
                    </div>
                  </td>
                  <td>
                    <span className={statusBadgeClass(p.status)}>{p.status}</span>
                  </td>
                  <td>{p.employeeCount}</td>
                  <td>{p.ordersToday}</td>
                  <td>{p.ordersMonth}</td>
                  <td>{p.deliveredCount}</td>
                  <td>{money(p.salesDelivered)}</td>
                  <td>
                    {p.lastOrder ? (
                      <>
                        {p.lastOrder.orderNumber}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {new Date(p.lastOrder.createdAt).toLocaleDateString('ar-LY')}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Link className="btn sm secondary" to={`/facebook-pages/${p.id}`}>
                        عرض
                      </Link>
                      <Link className="btn sm secondary" to={`/facebook-pages/${p.id}/edit`}>
                        تعديل
                      </Link>
                      <Link
                        className="btn sm secondary"
                        to={`/facebook-pages/${p.id}?tab=employees`}
                      >
                        الموظفات
                      </Link>
                      <Link
                        className="btn sm secondary"
                        to={`/facebook-pages/${p.id}?tab=orders`}
                      >
                        الطلبات
                      </Link>
                      <Link
                        className="btn sm secondary"
                        to={`/facebook-pages/${p.id}?tab=performance`}
                      >
                        التقارير
                      </Link>
                      <button
                        type="button"
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() => toggleStatus(p)}
                      >
                        {p.status === 'ACTIVE' ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FacebookPageNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [internalLabel, setInternalLabel] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>('/facebook-pages', {
        method: 'POST',
        body: JSON.stringify({
          name,
          internalLabel: internalLabel || undefined,
          facebookUrl: facebookUrl || undefined,
          notes: notes || undefined,
        }),
      });
      navigate(`/facebook-pages/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الإنشاء');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-title">
        <h1>إضافة صفحة فيسبوك</h1>
        <p>الطلبات تُدخل يدوياً من المحادثات — لا حاجة لبيانات Messenger API.</p>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <form className="panel stack" onSubmit={onSubmit}>
        <label>
          اسم الصفحة *
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          اسم تعريفي داخلي
          <input value={internalLabel} onChange={(e) => setInternalLabel(e.target.value)} />
        </label>
        <label>
          رابط فيسبوك (اختياري)
          <input
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.target.value)}
            placeholder="https://facebook.com/..."
          />
        </label>
        <label>
          ملاحظات
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        <p className="muted">الحالة الافتراضية: ACTIVE</p>
        <div className="toolbar">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الإنشاء...' : 'إنشاء الصفحة'}
          </button>
          <Link className="btn secondary" to="/facebook-pages">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
