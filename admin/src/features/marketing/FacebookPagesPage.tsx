import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, statusBadgeClass } from '@/api/client';

type Page = {
  id: string;
  name: string;
  publicCode: number;
  pageId?: string | null;
  notes?: string | null;
  status: string;
  username?: string | null;
  hasCredentials?: boolean;
  referralLink?: string;
  shortUrl?: string;
  storefrontUrl?: string;
  _count?: { orders: number };
  shippingAccount?: {
    id: string;
    label?: string | null;
    pageIdentifier?: string | null;
    hasToken?: boolean;
    apiToken?: string | null;
    isActive?: boolean;
    notes?: string | null;
  } | null;
  employees: Array<{
    role: string;
    agentCode?: number | null;
    user: { id: string; name: string; phone?: string };
  }>;
};

type User = { id: string; name: string };

const emptyForm = { name: '', pageId: '', notes: '' };

export function FacebookPagesPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [staffPageId, setStaffPageId] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('AGENT');
  const [credPageId, setCredPageId] = useState('');
  const [pageUsername, setPageUsername] = useState('');
  const [pagePassword, setPagePassword] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [shipPageId, setShipPageId] = useState('');
  const [shipToken, setShipToken] = useState('');
  const [shipLabel, setShipLabel] = useState('');
  const [shipMsg, setShipMsg] = useState('');

  async function load() {
    const [p, u] = await Promise.all([
      api<Page[]>('/facebook-pages'),
      api<User[]>('/users').catch(() => [] as User[]),
    ]);
    setPages(p);
    setUsers(u);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function openShipping(p: Page) {
    setShipPageId(p.id);
    setShipLabel(p.shippingAccount?.label || p.name);
    setShipToken('');
    setShipMsg('');
  }

  async function saveShipping(e: FormEvent) {
    e.preventDefault();
    if (!shipPageId || !shipToken.trim()) {
      setError('أدخلي مفتاح حساب المعيار لهذه الصفحة');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${shipPageId}/shipping-account`, {
        method: 'PUT',
        body: JSON.stringify({
          apiToken: shipToken.trim(),
          label: shipLabel || undefined,
          pageIdentifier: shipLabel || undefined,
          isActive: true,
        }),
      });
      setShipMsg('تم حفظ حساب الشحن لهذه الصفحة');
      setShipPageId('');
      setShipToken('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ حساب الشحن');
    } finally {
      setBusy(false);
    }
  }

  async function clearShipping(pageId: string) {
    if (!confirm('إزالة مفتاح حساب المعيار لهذه الصفحة؟')) return;
    await api(`/facebook-pages/${pageId}/shipping-account`, { method: 'DELETE' });
    await load();
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(p: Page) {
    setEditingId(p.id);
    setForm({ name: p.name, pageId: p.pageId || '', notes: p.notes || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        pageId: form.pageId || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await api(`/facebook-pages/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/facebook-pages', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Page) {
    setError('');
    try {
      await api(`/facebook-pages/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير الحالة');
    }
  }

  async function remove(p: Page) {
    if (!window.confirm(`حذف الصفحة «${p.name}»؟ لن يُحذف إن كانت لها طلبات.`)) return;
    setError('');
    try {
      await api(`/facebook-pages/${p.id}`, { method: 'DELETE', body: '{}' });
      if (editingId === p.id) resetForm();
      if (staffPageId === p.id) {
        setStaffPageId('');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  }

  function openStaff(p: Page) {
    setStaffPageId(p.id);
    setMemberUserId('');
    setMemberRole('AGENT');
  }

  function openCredentials(p: Page) {
    setCredPageId(p.id);
    setPageUsername(p.username || '');
    setPagePassword('');
  }

  async function saveCredentials(e: FormEvent) {
    e.preventDefault();
    if (!credPageId || !pageUsername.trim() || !pagePassword.trim()) {
      setError('أدخلي اسم المستخدم وكلمة المرور للصفحة');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${credPageId}/credentials`, {
        method: 'PUT',
        body: JSON.stringify({ username: pageUsername.trim(), password: pagePassword }),
      });
      setCredPageId('');
      setPagePassword('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ بيانات الدخول');
    } finally {
      setBusy(false);
    }
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!staffPageId || !memberUserId) return;
    setError('');
    try {
      await api(`/facebook-pages/${staffPageId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: memberUserId, role: memberRole }),
      });
      setMemberUserId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة الموظف');
    }
  }

  async function removeMember(pageId: string, userId: string) {
    if (!confirm('إزالة هذا الموظف من الصفحة؟')) return;
    await api(`/facebook-pages/${pageId}/members/${userId}`, { method: 'DELETE', body: '{}' });
    await load();
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      setError('تعذر النسخ');
    }
  }

  const staffPage = pages.find((p) => p.id === staffPageId);

  return (
    <div className="stack">
      <div className="page-title">
        <h1>إدارة الصفحات</h1>
        <p>
          من هنا تضيفين صفحات فيسبوك. لكل صفحة رابط متجر خاص، وأي طلب يدخل منه يُسجَّل على الصفحة. اربطي لكل صفحة مفتاح حساب المعيار من «حساب المعيار» حتى يُستخدم تلقائياً للشحن الخارجي. اضغطي «طباعة البوليصات» لطباعة بوليصات شحن طلبات تلك الصفحة.
          يمكنكِ تعديل الصفحة، تفعيلها أو إيقافها، أو حذفها إن لم يكن لها طلبات.
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <form className="panel form-grid two" onSubmit={onSubmit}>
        <div style={{ gridColumn: '1 / -1' }}>
          <strong>{editingId ? 'تعديل صفحة' : 'صفحة جديدة'}</strong>
        </div>
        <label>
          اسم الصفحة
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="مثال: دار الأنوثة — طرابلس"
          />
        </label>
        <label>
          معرّف فيسبوك (اختياري)
          <input
            value={form.pageId}
            onChange={(e) => setForm((f) => ({ ...f, pageId: e.target.value }))}
            placeholder="Facebook Page ID"
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          ملاحظات داخلية (لا تظهر للزبونة)
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديل' : 'إنشاء صفحة + رابط فريد'}
          </button>
          {editingId ? (
            <button className="btn secondary" type="button" onClick={resetForm}>
              إلغاء التعديل
            </button>
          ) : null}
        </div>
      </form>

      {credPageId ? (
        <form className="panel form-grid two" onSubmit={saveCredentials}>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>
              بيانات دخول الصفحة — {pages.find((x) => x.id === credPageId)?.name || ''}
            </strong>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              كل صفحة لها اسم مستخدم وكلمة مرور خاصة للدخول إلى لوحة التحكم.
            </p>
          </div>
          <label>
            اسم المستخدم
            <input
              value={pageUsername}
              onChange={(e) => setPageUsername(e.target.value)}
              placeholder="page_lavina"
              required
              dir="ltr"
            />
          </label>
          <label>
            كلمة المرور
            <input
              type="password"
              value={pagePassword}
              onChange={(e) => setPagePassword(e.target.value)}
              required
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={busy}>
              حفظ بيانات الدخول
            </button>
            <button className="btn ghost" type="button" onClick={() => setCredPageId('')}>
              إلغاء
            </button>
          </div>
        </form>
      ) : null}

      {staffPage ? (
        <div className="panel stack">
          <strong>موظفو صفحة {staffPage.name}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {staffPage.employees.map((e) => (
              <li key={e.user.id} style={{ marginBottom: 6 }}>
                {e.user.name} — {e.role}
                <button
                  type="button"
                  className="btn ghost"
                  style={{ marginInlineStart: 8, padding: '2px 8px', fontSize: 12 }}
                  onClick={() => removeMember(staffPage.id, e.user.id)}
                >
                  إزالة
                </button>
              </li>
            ))}
            {!staffPage.employees.length ? (
              <li className="muted">لا يوجد موظفون بعد</li>
            ) : null}
          </ul>
          <form className="form-grid two" onSubmit={addMember}>
            <label>
              إضافة موظف
              <select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} required>
                <option value="">— اختاري —</option>
                {users
                  .filter((u) => !staffPage.employees.some((e) => e.user.id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              الدور
              <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                <option value="AGENT">مسوّق</option>
                <option value="ADMIN">أدمن</option>
                <option value="MANAGER">مدير</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
              <button className="btn secondary" type="submit">
                إضافة
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setStaffPageId('')}
              >
                إغلاق
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {shipPageId ? (
        <form className="panel form-grid two" onSubmit={saveShipping}>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>
              حساب المعيار — {pages.find((x) => x.id === shipPageId)?.name || ''}
            </strong>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              ضعي مفتاح API الخاص بهذه الصفحة عند شركة المعيار. عند طلب خارج طرابلس يختار النظام هذا
              المفتاح تلقائياً (مثل حساب لافينا).
            </p>
          </div>
          <label>
            اسم الحساب / المعرّف
            <input value={shipLabel} onChange={(e) => setShipLabel(e.target.value)} />
          </label>
          <label>
            مفتاح API (Token)
            <input
              value={shipToken}
              onChange={(e) => setShipToken(e.target.value)}
              placeholder="الصقِ التوكن هنا"
              required
            />
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
            <button className="btn" type="submit" disabled={busy}>
              حفظ حساب الشحن
            </button>
            <button className="btn ghost" type="button" onClick={() => setShipPageId('')}>
              إلغاء
            </button>
          </div>
          {shipMsg ? (
            <div className="success" style={{ gridColumn: '1 / -1' }}>
              {shipMsg}
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="panel" style={{ display: 'grid', gap: 14 }}>
        <strong>الصفحات الحالية</strong>
        {pages.map((p) => (
          <article
            key={p.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 14,
              opacity: p.status === 'ACTIVE' ? 1 : 0.6,
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{p.name}</strong>
                  <span className={statusBadgeClass(p.status)}>
                    {p.status === 'ACTIVE' ? 'مفعّلة' : 'متوقفة'}
                  </span>
                  <span className="muted">#{p.publicCode}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  الطلبات المرتبطة: {p._count?.orders ?? 0}
                  {p.notes ? ` · ${p.notes}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" type="button" onClick={() => startEdit(p)}>
                  تعديل
                </button>
                <button className="btn secondary" type="button" onClick={() => void toggle(p)}>
                  {p.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                </button>
                <button className="btn ghost" type="button" onClick={() => void remove(p)}>
                  حذف
                </button>
                <button className="btn ghost" type="button" onClick={() => openStaff(p)}>
                  الموظفون
                </button>
                <button className="btn ghost" type="button" onClick={() => openCredentials(p)}>
                  {p.hasCredentials ? 'تعديل الدخول' : 'بيانات الدخول'}
                </button>
                <button className="btn ghost" type="button" onClick={() => openShipping(p)}>
                  حساب المعيار
                </button>
                <Link
                  className="btn secondary"
                  to={`/delivery/print?pageId=${p.id}`}
                  target="_blank"
                >
                  طباعة البوليصات
                </Link>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ wordBreak: 'break-all', fontSize: 13 }}>
                رابط المتجر: {p.storefrontUrl}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn sm secondary"
                  type="button"
                  onClick={() => copy(p.storefrontUrl || '', `s-${p.id}`)}
                >
                  {copied === `s-${p.id}` ? 'تم النسخ' : 'نسخ رابط المتجر'}
                </button>
                <button
                  className="btn sm secondary"
                  type="button"
                  onClick={() =>
                    copy(p.shortUrl || `http://127.0.0.1:3000/r/${p.publicCode}`, `r-${p.id}`)
                  }
                >
                  {copied === `r-${p.id}` ? 'تم النسخ' : 'نسخ الرابط المختصر'}
                </button>
              </div>
            </div>

            <div className="muted" style={{ fontSize: 13 }}>
              الموظفون:{' '}
              {p.employees.length
                ? p.employees
                    .map((e) =>
                      e.agentCode
                        ? `${e.user.name} (#${e.agentCode})`
                        : `${e.user.name}`,
                    )
                    .join('، ')
                : 'لم يُعيَّن أحد بعد'}
            </div>
            <div style={{ fontSize: 13 }}>
              حساب المعيار:{' '}
              {p.shippingAccount?.hasToken ? (
                <span className="badge success">
                  مربوط ({p.shippingAccount.label || p.name}) — {p.shippingAccount.apiToken}
                </span>
              ) : (
                <span className="muted">غير مربوط — اضغطي «حساب المعيار»</span>
              )}
              {p.shippingAccount?.hasToken ? (
                <button
                  className="btn sm ghost"
                  type="button"
                  style={{ marginInlineStart: 8 }}
                  onClick={() => void clearShipping(p.id)}
                >
                  إزالة المفتاح
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!pages.length ? (
          <div className="empty">لا توجد صفحات بعد — أنشئي الأولى من النموذج أعلاه</div>
        ) : null}
      </div>
    </div>
  );
}
