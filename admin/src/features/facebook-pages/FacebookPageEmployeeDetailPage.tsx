import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, statusBadgeClass, statusLabel } from '@/api/client';
import {
  EMPLOYMENT_LABEL,
  PAGE_ROLE_LABEL,
  type PageSummary,
} from './pageStaffShared';

type StaffProfile = {
  user: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    status: string;
    employmentType?: string | null;
    monthlySalary?: string | number | null;
    roles?: Array<{ role: { code: string; nameAr: string } }>;
  };
  pages: Array<{
    pageId: string;
    role: string;
    agentCode?: number | null;
    assignedAt: string;
    page: {
      id: string;
      name: string;
      status: string;
      publicCode?: number;
    };
  }>;
  kpis: {
    ordersToday: number;
    ordersMonth: number;
    delivered: number;
    cancelled: number;
    commissionTotal: number;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string | number;
    createdAt: string;
    shippingName?: string | null;
    facebookPage?: { id: string; name: string } | null;
  }>;
};

export function FacebookPageEmployeeDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<StaffProfile | null>(null);
  const [allPages, setAllPages] = useState<PageSummary[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [assignPageId, setAssignPageId] = useState('');
  const [assignRole, setAssignRole] = useState('AGENT');

  const load = useCallback(async () => {
    const profile = await api<StaffProfile>(`/users/page-staff/${id}`);
    setData(profile);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<PageSummary[]>('/facebook-pages/admin/summary')
      .then(setAllPages)
      .catch(() => setAllPages([]));
  }, [load]);

  const availablePages = useMemo(() => {
    if (!data) return [];
    const assigned = new Set(data.pages.map((p) => p.pageId));
    return allPages.filter((p) => !assigned.has(p.id) && p.status === 'ACTIVE');
  }, [allPages, data]);

  async function assignPage(e: FormEvent) {
    e.preventDefault();
    if (!assignPageId) {
      setError('اختاري صفحة');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${assignPageId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: id, role: assignRole }),
      });
      setMsg('تم تعيين الصفحة');
      setAssignPageId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التعيين');
    } finally {
      setBusy(false);
    }
  }

  async function removeFromPage(pageId: string, pageName: string) {
    if (!confirm(`إزالة من الصفحة «${pageName}» فقط — لن تُعطّل الحساب`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${pageId}/members/${id}`, {
        method: 'DELETE',
        body: '{}',
      });
      setMsg('تمت الإزالة من الصفحة');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت الإزالة');
    } finally {
      setBusy(false);
    }
  }

  async function disableUser() {
    if (
      !confirm(
        'سيتم منع الموظفة من تسجيل الدخول والوصول إلى طلبات الصفحات.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/users/page-staff/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
      setMsg('تم تعطيل الحساب');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التعطيل');
    } finally {
      setBusy(false);
    }
  }

  async function reactivateUser() {
    if (!confirm('تفعيل حساب الموظفة مرة أخرى؟')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/users/page-staff/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      setMsg('تم تفعيل الحساب');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التفعيل');
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return <div className="panel muted">جارٍ التحميل...</div>;
  }

  if (!data) {
    return (
      <div className="stack">
        <div className="error">{error}</div>
        <Link className="btn secondary" to="/facebook-pages">
          رجوع
        </Link>
      </div>
    );
  }

  const { user, pages, kpis, recentOrders } = data;
  const emp = user.employmentType || 'NONE';

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>
            {user.name}{' '}
            <span className={statusBadgeClass(user.status)} style={{ verticalAlign: 'middle' }}>
              {user.status === 'ACTIVE'
                ? 'نشطة'
                : user.status === 'INACTIVE'
                  ? 'موقوفة'
                  : user.status}
            </span>
          </h1>
          <p>
            {EMPLOYMENT_LABEL[emp] || emp}
            {user.phone ? ` · ${user.phone}` : ''}
            {user.email ? ` · ${user.email}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.status === 'ACTIVE' ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={disableUser}>
              تعطيل الموظفة
            </button>
          ) : (
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={reactivateUser}
            >
              تفعيل الحساب
            </button>
          )}
          <Link className="btn ghost" to="/facebook-pages">
            رجوع للصفحات
          </Link>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="panel" style={{ padding: 12 }}>{msg}</div> : null}

      <div className="panel stack">
        <strong>الملف الشخصي</strong>
        <div className="form-grid two">
          <div>
            <div className="muted">نوع التوظيف</div>
            <div>{EMPLOYMENT_LABEL[emp] || emp}</div>
          </div>
          <div>
            <div className="muted">
              {emp === 'SALARY' ? 'المرتب الشهري' : 'إجمالي العمولة'}
            </div>
            <div>
              {emp === 'SALARY'
                ? money(user.monthlySalary || 0)
                : money(kpis.commissionTotal)}
            </div>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">طلبات اليوم</div>
          <div className="stat-value">{kpis.ordersToday}</div>
        </div>
        <div className="stat">
          <div className="stat-label">طلبات الشهر</div>
          <div className="stat-value">{kpis.ordersMonth}</div>
        </div>
        <div className="stat">
          <div className="stat-label">مُسلّم</div>
          <div className="stat-value">{kpis.delivered}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ملغي / مرتجع</div>
          <div className="stat-value">{kpis.cancelled}</div>
        </div>
        <div className="stat">
          <div className="stat-label">إجمالي العمولة</div>
          <div className="stat-value">{money(kpis.commissionTotal)}</div>
        </div>
      </div>

      <div className="panel stack">
        <strong>الصفحات التابعة لها</strong>
        {!pages.length ? (
          <p className="muted">غير مُعيَّنة على أي صفحة.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الصفحة</th>
                  <th>الحالة</th>
                  <th>الدور</th>
                  <th>تاريخ الإضافة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.pageId}>
                    <td>
                      <Link to={`/facebook-pages/${p.pageId}`}>
                        <strong>{p.page.name}</strong>
                      </Link>
                      {p.page.publicCode != null ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          #{p.page.publicCode}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={statusBadgeClass(p.page.status)}>
                        {p.page.status === 'ACTIVE' ? 'مفعّلة' : p.page.status}
                      </span>
                    </td>
                    <td>{PAGE_ROLE_LABEL[p.role] || p.role}</td>
                    <td>{new Date(p.assignedAt).toLocaleDateString('ar-LY')}</td>
                    <td>
                      <button
                        type="button"
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() => removeFromPage(p.pageId, p.page.name)}
                      >
                        إزالة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="form-grid two" onSubmit={assignPage}>
          <label>
            إضافة صفحة
            <select
              value={assignPageId}
              onChange={(e) => setAssignPageId(e.target.value)}
              required
            >
              <option value="">— اختاري صفحة —</option>
              {availablePages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (#{p.publicCode})
                </option>
              ))}
            </select>
          </label>
          <label>
            الدور
            <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
              {Object.entries(PAGE_ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="toolbar" style={{ alignItems: 'end' }}>
            <button className="btn" type="submit" disabled={busy || !availablePages.length}>
              تعيين
            </button>
          </div>
        </form>
        {!availablePages.length ? (
          <p className="muted">لا صفحات إضافية متاحة للتعيين.</p>
        ) : null}
      </div>

      <div className="panel stack">
        <strong>آخر الطلبات</strong>
        {!recentOrders.length ? (
          <p className="muted">لا طلبات.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>الصفحة</th>
                  <th>العميل</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/orders?focus=${o.id}`}>{o.orderNumber}</Link>
                    </td>
                    <td>{o.facebookPage?.name || '—'}</td>
                    <td>{o.shippingName || '—'}</td>
                    <td>{money(o.totalAmount)}</td>
                    <td>
                      <span className={statusBadgeClass(o.status)}>
                        {statusLabel[o.status] || o.status}
                      </span>
                    </td>
                    <td>{new Date(o.createdAt).toLocaleDateString('ar-LY')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
