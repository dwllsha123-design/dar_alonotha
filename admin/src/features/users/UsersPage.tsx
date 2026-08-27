import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';

type Permission = {
  id: string;
  code: string;
  nameAr: string;
  module: string;
};

type Role = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  permissions: Array<{ permission: Permission }>;
};

type UserRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  employmentType?: string;
  monthlySalary?: string | number | null;
  roles: Array<{ role: { id: string; code: string; nameAr: string } }>;
  createdAt: string;
};

const statusAr: Record<string, string> = {
  PENDING: 'بانتظار الموافقة',
  ACTIVE: 'نشط',
  INACTIVE: 'موقوف',
  SUSPENDED: 'معلّق',
};

const moduleLabel: Record<string, string> = {
  orders: 'الطلبات',
  products: 'المنتجات',
  inventory: 'المخزون',
  pos: 'نقطة البيع',
  reports: 'التقارير',
  commissions: 'العمولات',
  delivery: 'التوصيل',
  customers: 'العملاء',
  facebook: 'الصفحات',
  users: 'المستخدمون',
  settings: 'الإعدادات',
  marketing: 'التسويق',
  audit: 'سجل النشاط',
};

export function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pending, setPending] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Agent@12345');
  const [roleCodes, setRoleCodes] = useState<string[]>(['sales_agent']);
  const [employmentType, setEmploymentType] = useState('COMMISSION');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const staffRoles = useMemo(
    () => roles.filter((r) => r.code !== 'customer'),
    [roles],
  );

  const selectedRole = useMemo(
    () => staffRoles.find((r) => r.code === roleCodes[0]) || null,
    [staffRoles, roleCodes],
  );

  async function load() {
    const [u, r, p] = await Promise.all([
      api<UserRow[]>('/users'),
      api<Role[]>('/users/roles'),
      api<UserRow[]>('/users/pending-marketers'),
    ]);
    setRows(u);
    setRoles(r);
    setPending(p);
    if (!expandedRole && r.length) {
      const first = r.find((x) => x.code !== 'customer');
      if (first) setExpandedRole(first.code);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          password,
          roleCodes,
          employmentType,
          monthlySalary: employmentType === 'SALARY' && monthlySalary ? Number(monthlySalary) : undefined,
        }),
      });
      setName('');
      setPhone('');
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الإنشاء');
    }
  }

  async function approve(id: string) {
    await api(`/users/${id}/approve-marketer`, { method: 'POST', body: '{}' });
    await load();
  }

  async function reject(id: string) {
    await api(`/users/${id}/reject-marketer`, { method: 'POST', body: '{}' });
    await load();
  }

  async function setEmployment(id: string, type: string, salary?: number) {
    await api(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        employmentType: type,
        monthlySalary: type === 'SALARY' ? salary : null,
      }),
    });
    await load();
  }

  async function createSalaryRecord(userId: string, amount: number) {
    const now = new Date();
    await api('/users/salary-payments', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        amount,
      }),
    });
    await load();
  }

  async function setStatus(id: string, status: string) {
    await api(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  function groupPermissions(role: Role) {
    const map = new Map<string, Permission[]>();
    for (const rp of role.permissions) {
      const p = rp.permission;
      const key = p.module || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  return (
    <div className="stack">
      <div className="page-title">
        <h1>المستخدمون والصلاحيات</h1>
        <p>من هنا تضيفين الموظفات وتحددين صلاحيات كل وظيفة: من يدخل نقطة البيع، من يعدّل المنتجات، ومن يعتمد المسوّقين الجدد.</p>
      </div>
      {error ? <div className="error">{error}</div> : null}

      <div className="panel stack">
        <div className="toolbar">
          <strong>صلاحيات كل مسمى</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            اضغط على المسمى لعرض صلاحياته بالتفصيل
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {staffRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={`btn${expandedRole === role.code ? '' : ' secondary'}`}
              onClick={() =>
                setExpandedRole((prev) => (prev === role.code ? null : role.code))
              }
            >
              {role.nameAr}
              <span style={{ opacity: 0.75, fontSize: 12 }}>
                ({role.permissions.length})
              </span>
            </button>
          ))}
        </div>

        {staffRoles
          .filter((r) => r.code === expandedRole)
          .map((role) => (
            <div
              key={role.id}
              style={{
                border: '1px solid var(--outline-variant)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <div>
                  <strong style={{ fontSize: 18 }}>{role.nameAr}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    الرمز: {role.code} · عدد الصلاحيات: {role.permissions.length}
                  </div>
                </div>
              </div>

              {!role.permissions.length ? (
                <div className="empty">لا توجد صلاحيات مرتبطة بهذا المسمى</div>
              ) : (
                <div className="form-grid two">
                  {groupPermissions(role).map(([module, perms]) => (
                    <div key={module}>
                      <strong style={{ display: 'block', marginBottom: 8 }}>
                        {moduleLabel[module] || module}
                      </strong>
                      <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
                        {perms.map((p) => (
                          <li key={p.id}>
                            {p.nameAr}
                            <span className="muted" style={{ fontSize: 12, marginInlineStart: 6 }}>
                              ({p.code})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      {pending.length ? (
        <div className="panel">
          <div className="toolbar">
            <strong>مسوقون بانتظار الموافقة ({pending.length})</strong>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الهاتف</th>
                  <th>التاريخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.phone || '—'}</td>
                    <td>{new Date(u.createdAt).toLocaleString('ar-LY')}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" type="button" onClick={() => approve(u.id)}>
                        موافقة
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => reject(u.id)}
                      >
                        رفض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <form className="panel form-grid two" onSubmit={onCreate}>
        <div style={{ gridColumn: '1 / -1' }}>
          <strong>إضافة مستخدم</strong>
        </div>
        <label>
          الاسم
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          الهاتف
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label>
          البريد
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          كلمة المرور
          <input value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          نوع التوظيف
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
            <option value="NONE">بدون</option>
            <option value="SALARY">راتب شهري</option>
            <option value="COMMISSION">عمولة بالقطعة</option>
          </select>
        </label>
        {employmentType === 'SALARY' ? (
          <label>
            الراتب الشهري (د.ل)
            <input
              type="number"
              min={0}
              value={monthlySalary}
              onChange={(e) => setMonthlySalary(e.target.value)}
            />
          </label>
        ) : null}
        <label>
          المسمى / الدور
          <select
            value={roleCodes[0] || ''}
            onChange={(e) => {
              setRoleCodes([e.target.value]);
              setExpandedRole(e.target.value);
            }}
          >
            {staffRoles.map((r) => (
              <option key={r.id} value={r.code}>
                {r.nameAr} ({r.permissions.length} صلاحية)
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="btn" type="submit">
            حفظ
          </button>
        </div>

        {selectedRole ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              صلاحيات المسمى المختار ({selectedRole.nameAr}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedRole.permissions.map((rp) => (
                <span key={rp.permission.id} className="badge info">
                  {rp.permission.nameAr}
                </span>
              ))}
              {!selectedRole.permissions.length ? (
                <span className="muted">بدون صلاحيات</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>المسمى</th>
              <th>التوظيف</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.phone || u.email || '—'}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {u.roles.map((r) => (
                      <button
                        key={r.role.id}
                        type="button"
                        className="badge brand"
                        style={{ border: 0, cursor: 'pointer' }}
                        onClick={() => setExpandedRole(r.role.code)}
                        title="عرض صلاحيات هذا المسمى"
                      >
                        {r.role.nameAr}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <select
                    value={u.employmentType || 'NONE'}
                    onChange={(e) =>
                      setEmployment(
                        u.id,
                        e.target.value,
                        e.target.value === 'SALARY' ? Number(u.monthlySalary || 0) : undefined,
                      )
                    }
                    style={{ minWidth: 120 }}
                  >
                    <option value="NONE">بدون</option>
                    <option value="SALARY">راتب</option>
                    <option value="COMMISSION">عمولة</option>
                  </select>
                  {u.employmentType === 'SALARY' ? (
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      {u.monthlySalary ? `${u.monthlySalary} د.ل` : '—'}
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ marginInlineStart: 6, padding: '2px 6px', fontSize: 11 }}
                        onClick={() =>
                          createSalaryRecord(u.id, Number(u.monthlySalary || 0))
                        }
                      >
                        راتب الشهر
                      </button>
                    </div>
                  ) : null}
                </td>
                <td>{statusAr[u.status] || u.status}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {u.status !== 'ACTIVE' ? (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => setStatus(u.id, 'ACTIVE')}
                    >
                      تفعيل
                    </button>
                  ) : (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setStatus(u.id, 'INACTIVE')}
                    >
                      إيقاف
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
