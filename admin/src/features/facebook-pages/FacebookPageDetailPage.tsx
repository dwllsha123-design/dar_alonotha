import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, money, statusBadgeClass, statusLabel } from '@/api/client';
import {
  EMPLOYMENT_LABEL,
  PAGE_ROLE_LABEL,
  periodPreset,
} from './pageStaffShared';

type Tab = 'overview' | 'employees' | 'orders' | 'performance' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'employees', label: 'الموظفات' },
  { id: 'orders', label: 'الطلبات' },
  { id: 'performance', label: 'الأداء' },
  { id: 'settings', label: 'الإعدادات' },
];

type PageMeta = {
  id: string;
  name: string;
  status: string;
  publicCode?: number;
  notes?: string | null;
  storefrontUrl?: string;
  shortUrl?: string;
  referralLink?: string;
  _count?: { orders: number };
  shippingAccount?: {
    id: string;
    label?: string | null;
    hasToken?: boolean;
    isActive?: boolean;
  } | null;
  employees?: Array<{
    userId: string;
    role: string;
    user: { id: string; name: string };
  }>;
};

type ShippingAccountOption = {
  id: string;
  label: string;
  pageName: string;
  pagePublicCode: number;
  facebookPageId: string;
};

type Dashboard = {
  page: PageMeta;
  kpis: {
    ordersToday: number;
    ordersMonth: number;
    delivered: number;
    cancelled: number;
    returned: number;
    salesDelivered: number;
    activeEmployees: number;
    deliveryRate: number;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string | number;
    shippingName?: string | null;
    shippingPhone?: string | null;
    createdAt: string;
    salesAgent?: { id: string; name: string } | null;
  }>;
  topEmployees: Array<{
    agentId: string;
    name: string;
    delivered: number;
    orders: number;
    pieces: number;
  }>;
};

type EmployeeRow = {
  userId: string;
  role: string;
  agentCode?: number | null;
  assignedAt: string;
  orders: number;
  delivered: number;
  commissionTotal: number;
  user: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    status: string;
    employmentType?: string | null;
    monthlySalary?: string | number | null;
  };
};

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string | number;
  shippingName?: string | null;
  shippingPhone?: string | null;
  createdAt: string;
  salesAgent?: { id: string; name: string } | null;
  items?: Array<{ quantity: number }>;
  deliveries?: Array<{ id: string; status: string }>;
};

type PerformanceRow = {
  userId: string;
  name: string;
  status: string;
  role: string;
  employmentType?: string | null;
  monthlySalary?: string | number | null;
  orders: number;
  pieces: number;
  delivered: number;
  cancelled: number;
  returned: number;
  deliveryRate: number;
  commissionEarned: number;
};

type PageReport = {
  page: PageMeta;
  period: { from: string; to: string };
  totals: {
    orders: number;
    delivered: number;
    cancelled: number;
    returned: number;
    piecesDelivered: number;
    salesValue: number;
  };
  employees: Array<{
    userId: string;
    name: string;
    delivered: number;
    orders: number;
    pieces: number;
  }>;
};

type UserOption = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
};

type EditForm = {
  role: string;
  employmentType: string;
  monthlySalary: string;
  commissionPerPiece: string;
};

function piecesOf(o: OrderRow) {
  return (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
}

function deliveryLabel(o: OrderRow) {
  const d = o.deliveries?.[0];
  if (!d) return '—';
  return statusLabel[d.status] || d.status;
}

export function FacebookPageDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'overview';

  const [page, setPage] = useState<PageMeta | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [perfRows, setPerfRows] = useState<PerformanceRow[]>([]);
  const [report, setReport] = useState<PageReport | null>(null);

  const [orderStatus, setOrderStatus] = useState('');
  const [orderQ, setOrderQ] = useState('');

  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [from, setFrom] = useState(() => periodPreset('month').from);
  const [to, setTo] = useState(() => periodPreset('month').to);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    role: 'AGENT',
    employmentType: 'COMMISSION',
    monthlySalary: '',
    commissionPerPiece: '',
  });

  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersForbidden, setUsersForbidden] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState('AGENT');
  const [userSearch, setUserSearch] = useState('');

  const [newStaff, setNewStaff] = useState({
    name: '',
    phone: '',
    password: '',
    role: 'AGENT',
    employmentType: 'COMMISSION',
    monthlySalary: '',
    commissionPerPiece: '',
  });

  const [settings, setSettings] = useState({ name: '', notes: '', status: 'ACTIVE' });
  const [shipAccounts, setShipAccounts] = useState<ShippingAccountOption[]>([]);
  const [shipSelect, setShipSelect] = useState('');
  const [shipToken, setShipToken] = useState('');
  const [shipLabel, setShipLabel] = useState('');
  const [copied, setCopied] = useState('');
  const [printPreset, setPrintPreset] = useState<'today' | 'range' | 'ready' | 'shipped'>('today');
  const [printFrom, setPrintFrom] = useState('');
  const [printTo, setPrintTo] = useState('');
  const [printBusy, setPrintBusy] = useState(false);

  function setTab(next: Tab) {
    setSearchParams(next === 'overview' ? {} : { tab: next });
  }

  const loadPage = useCallback(async () => {
    const p = await api<PageMeta>(`/facebook-pages/${id}`);
    setPage(p);
    setSettings({
      name: p.name || '',
      notes: p.notes || '',
      status: p.status || 'ACTIVE',
    });
    setShipSelect(p.shippingAccount?.id || '');
    setShipLabel(p.shippingAccount?.label || p.name || '');
    setShipToken('');
  }, [id]);

  const loadShippingAccounts = useCallback(async () => {
    const list = await api<ShippingAccountOption[]>('/facebook-pages/shipping-accounts');
    setShipAccounts(list);
  }, []);

  const loadDashboard = useCallback(async () => {
    const data = await api<Dashboard>(`/facebook-pages/${id}/dashboard`);
    setDashboard(data);
    setPage((prev) => prev || data.page);
  }, [id]);

  const loadEmployees = useCallback(async () => {
    const data = await api<{ page: PageMeta; employees: EmployeeRow[] }>(
      `/facebook-pages/${id}/employees-stats`,
    );
    setEmployees(data.employees);
    setPage((prev) => prev || data.page);
  }, [id]);

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams({ facebookPageId: id });
    if (orderStatus) params.set('status', orderStatus);
    const list = await api<OrderRow[]>(`/orders?${params}`);
    setOrders(list);
  }, [id, orderStatus]);

  const loadPerformance = useCallback(async () => {
    const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const [perf, rep] = await Promise.all([
      api<{ employees: PerformanceRow[] }>(`/facebook-pages/${id}/performance?${qs}`),
      api<PageReport>(`/facebook-pages/${id}/report?${qs}`),
    ]);
    setPerfRows(perf.employees);
    setReport(rep);
  }, [id, from, to]);

  useEffect(() => {
    setError('');
    loadPage().catch((e) => setError(e.message));
  }, [loadPage]);

  useEffect(() => {
    if (tab !== 'settings') return;
    loadShippingAccounts().catch(() => setShipAccounts([]));
  }, [tab, loadShippingAccounts]);

  useEffect(() => {
    if (!id) return;
    setError('');
    setMsg('');
    if (tab === 'overview') {
      loadDashboard().catch((e) => setError(e.message));
    } else if (tab === 'employees') {
      loadEmployees().catch((e) => setError(e.message));
      setUsersForbidden(false);
      api<UserOption[]>('/users')
        .then((list) => {
          setUsers(list);
          setUsersForbidden(false);
        })
        .catch(() => {
          setUsers([]);
          setUsersForbidden(true);
        });
    } else if (tab === 'orders') {
      loadOrders().catch((e) => setError(e.message));
    } else if (tab === 'performance') {
      loadPerformance().catch((e) => setError(e.message));
    }
  }, [tab, id, loadDashboard, loadEmployees, loadOrders, loadPerformance]);

  function applyPreset(p: 'today' | 'week' | 'month') {
    const range = periodPreset(p);
    setPreset(p);
    setFrom(range.from);
    setTo(range.to);
  }

  const filteredOrders = useMemo(() => {
    const q = orderQ.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const hay = [
        o.orderNumber,
        o.shippingName,
        o.shippingPhone,
        o.salesAgent?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, orderQ]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const memberIds = new Set(employees.map((e) => e.userId));
    return users
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => {
        if (!q) return true;
        return (
          u.name.toLowerCase().includes(q) ||
          (u.phone || '').includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [users, userSearch, employees]);

  function startEdit(row: EmployeeRow) {
    setEditingId(row.userId);
    setEditForm({
      role: row.role || 'AGENT',
      employmentType: row.user.employmentType || 'NONE',
      monthlySalary:
        row.user.monthlySalary != null && row.user.monthlySalary !== ''
          ? String(row.user.monthlySalary)
          : '',
      commissionPerPiece: '',
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        role: editForm.role,
        employmentType: editForm.employmentType,
      };
      if (editForm.employmentType === 'SALARY' && editForm.monthlySalary !== '') {
        body.monthlySalary = Number(editForm.monthlySalary);
      }
      if (
        editForm.employmentType === 'COMMISSION' &&
        editForm.commissionPerPiece !== ''
      ) {
        body.commissionPerPiece = Number(editForm.commissionPerPiece);
      }
      await api(`/facebook-pages/${id}/members/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setMsg('تم تحديث بيانات الموظفة');
      setEditingId(null);
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`إزالة «${name}» من الصفحة فقط — لن تُعطّل الحساب`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${id}/members/${userId}`, {
        method: 'DELETE',
        body: '{}',
      });
      setMsg('تمت إزالة الموظفة من الصفحة');
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت الإزالة');
    } finally {
      setBusy(false);
    }
  }

  async function disableUser(userId: string, name: string) {
    if (
      !confirm(
        `سيتم منع الموظفة «${name}» من تسجيل الدخول والوصول إلى طلبات الصفحات.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/users/page-staff/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
      setMsg('تم تعطيل حساب الموظفة');
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التعطيل');
    } finally {
      setBusy(false);
    }
  }

  async function assignExisting(e: FormEvent) {
    e.preventDefault();
    if (!assignUserId) {
      setError('اختاري موظفة موجودة');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: assignUserId, role: assignRole }),
      });
      setMsg('تم تعيين الموظفة على الصفحة');
      setAssignUserId('');
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التعيين');
    } finally {
      setBusy(false);
    }
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: newStaff.name,
        phone: newStaff.phone || undefined,
        password: newStaff.password,
        role: newStaff.role,
        employmentType: newStaff.employmentType,
      };
      if (newStaff.employmentType === 'SALARY' && newStaff.monthlySalary !== '') {
        body.monthlySalary = Number(newStaff.monthlySalary);
      }
      if (
        newStaff.employmentType === 'COMMISSION' &&
        newStaff.commissionPerPiece !== ''
      ) {
        body.commissionPerPiece = Number(newStaff.commissionPerPiece);
      }
      await api(`/facebook-pages/${id}/staff`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMsg('تم إنشاء الموظفة وتعيينها على الصفحة');
      setNewStaff({
        name: '',
        phone: '',
        password: '',
        role: 'AGENT',
        employmentType: 'COMMISSION',
        monthlySalary: '',
        commissionPerPiece: '',
      });
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء الموظفة');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await api<PageMeta>(`/facebook-pages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: settings.name,
          notes: settings.notes || undefined,
          status: settings.status,
        }),
      });
      setPage((prev) => ({ ...prev, ...updated }));
      setMsg('تم حفظ إعدادات الصفحة');
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('تعذّر نسخ الرابط');
    }
  }

  async function saveShippingLink() {
    setBusy(true);
    setError('');
    try {
      if (!shipSelect) {
        await api(`/facebook-pages/${id}/shipping-account/link`, {
          method: 'PUT',
          body: JSON.stringify({ shippingAccountId: null }),
        });
        setMsg('تم إزالة ربط حساب المعيار');
      } else if (shipSelect === '__new__') {
        if (!shipToken.trim()) {
          setError('أدخلي مفتاح حساب المعيار أو اختاري حساباً موجوداً');
          setBusy(false);
          return;
        }
        await api(`/facebook-pages/${id}/shipping-account`, {
          method: 'PUT',
          body: JSON.stringify({
            apiToken: shipToken.trim(),
            label: shipLabel || settings.name,
            pageIdentifier: shipLabel || settings.name,
            isActive: true,
          }),
        });
        setMsg('تم حفظ حساب المعيار لهذه الصفحة');
        setShipToken('');
      } else {
        await api(`/facebook-pages/${id}/shipping-account/link`, {
          method: 'PUT',
          body: JSON.stringify({ shippingAccountId: shipSelect }),
        });
        setMsg('تم ربط حساب المعيار بالصفحة');
      }
      await loadPage();
      await loadShippingAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ حساب الشحن');
    } finally {
      setBusy(false);
    }
  }

  async function deletePage() {
    if (!confirm('حذف الصفحة نهائياً؟ هذا متاح فقط إن لم تكن هناك طلبات.')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${id}`, { method: 'DELETE' });
      window.location.href = '/facebook-pages';
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'لا يمكن حذف الصفحة لوجود طلبات مرتبطة بها. يمكنك إيقاف الصفحة بدلاً من حذفها.',
      );
    } finally {
      setBusy(false);
    }
  }

  function buildPrintQuery() {
    const qs = new URLSearchParams({ pageId: id });
    if (printPreset === 'today') {
      const d = new Date().toISOString().slice(0, 10);
      qs.set('from', d);
      qs.set('to', d);
    } else if (printPreset === 'range') {
      if (printFrom) qs.set('from', printFrom);
      if (printTo) qs.set('to', printTo);
    } else if (printPreset === 'ready') {
      qs.set('readyOnly', '1');
    } else if (printPreset === 'shipped') {
      qs.set('hasShipment', '1');
    }
    return qs;
  }

  async function printPageSlips() {
    setPrintBusy(true);
    setError('');
    try {
      window.open(`/delivery/print?${buildPrintQuery().toString()}`, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل فتح الطباعة');
    } finally {
      setPrintBusy(false);
    }
  }

  const storefrontUrl =
    page?.storefrontUrl ||
    (page?.publicCode != null ? `/?page=${page.publicCode}` : '');
  const title = page?.name || dashboard?.page.name || 'صفحة فيسبوك';
  const status = page?.status || dashboard?.page.status || '';

  return (
    <div className="stack">
      <div className="topbar">
        <div className="page-title">
          <h1>
            {title}{' '}
            {status ? (
              <span className={statusBadgeClass(status)} style={{ verticalAlign: 'middle' }}>
                {status === 'ACTIVE' ? 'مفعّلة' : status === 'INACTIVE' ? 'متوقفة' : status}
              </span>
            ) : null}
          </h1>
          <p>
            {page?.publicCode != null ? `#${page.publicCode} · ` : null}
            إدارة الصفحة والموظفات والطلبات والأداء
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/orders/new">
            إضافة طلب
          </Link>
          <button type="button" className="btn secondary" onClick={() => setTab('orders')}>
            عرض الطلبات
          </button>
          <button type="button" className="btn secondary" onClick={() => setTab('performance')}>
            التقارير
          </button>
          <Link className="btn ghost" to={`/facebook-pages/${id}/edit`}>
            تعديل
          </Link>
          <Link className="btn ghost" to="/facebook-pages">
            رجوع
          </Link>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="panel" style={{ padding: 12 }}>{msg}</div> : null}

      <div className="panel toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn sm ${tab === t.id ? '' : 'secondary'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="stack">
          <div className="panel stack">
            <strong>رابط متجر الصفحة</strong>
            <p className="muted" style={{ margin: 0 }}>
              أي طلب من هذا الرابط يُنسب تلقائياً لهذه الصفحة — الزبون لا يختار الصفحة يدوياً.
            </p>
            <code style={{ wordBreak: 'break-all' }}>{storefrontUrl || '—'}</code>
            <div className="toolbar" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn sm"
                disabled={!storefrontUrl}
                onClick={() => storefrontUrl && copyText('store', storefrontUrl)}
              >
                {copied === 'store' ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
              <a
                className="btn sm secondary"
                href={storefrontUrl || '#'}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!storefrontUrl}
              >
                فتح المتجر
              </a>
            </div>
          </div>

          <div className="panel stack">
            <strong>طباعة البوليصات</strong>
            <p className="muted" style={{ margin: 0 }}>
              طباعة بوليصات طلبات هذه الصفحة فقط عبر نظام الشحن الحالي.
            </p>
            <div className="form-grid two">
              <label>
                التصفية
                <select
                  value={printPreset}
                  onChange={(e) =>
                    setPrintPreset(e.target.value as typeof printPreset)
                  }
                >
                  <option value="today">اليوم</option>
                  <option value="range">تاريخ محدد / نطاق</option>
                  <option value="ready">جاهزة للشحن</option>
                  <option value="shipped">تم إنشاء شحنة لها</option>
                </select>
              </label>
              {printPreset === 'range' ? (
                <>
                  <label>
                    من
                    <input
                      type="date"
                      value={printFrom}
                      onChange={(e) => setPrintFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    إلى
                    <input
                      type="date"
                      value={printTo}
                      onChange={(e) => setPrintTo(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </div>
            <button
              type="button"
              className="btn"
              disabled={printBusy}
              onClick={() => printPageSlips()}
            >
              طباعة البوليصات
            </button>
          </div>

          <OverviewTab dashboard={dashboard} />
        </div>
      ) : null}

      {tab === 'employees' ? (
        <div className="stack">
          <div className="panel stack">
            <div className="toolbar">
              <strong>إضافة موظفة</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn sm ${addMode === 'existing' ? '' : 'secondary'}`}
                  onClick={() => setAddMode('existing')}
                >
                  موجودة
                </button>
                <button
                  type="button"
                  className={`btn sm ${addMode === 'new' ? '' : 'secondary'}`}
                  onClick={() => setAddMode('new')}
                >
                  جديدة
                </button>
              </div>
            </div>

            {addMode === 'existing' ? (
              usersForbidden ? (
                <p className="muted">
                  لا صلاحية لعرض المستخدمين — استخدمي وضع «جديدة» لإنشاء موظفة مباشرة.
                </p>
              ) : (
                <form className="form-grid two" onSubmit={assignExisting}>
                  <label>
                    بحث
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="اسم / هاتف..."
                    />
                  </label>
                  <label>
                    الموظفة
                    <select
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                      required
                    >
                      <option value="">— اختاري —</option>
                      {filteredUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    الدور في الصفحة
                    <select
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value)}
                    >
                      {Object.entries(PAGE_ROLE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="toolbar" style={{ alignItems: 'end' }}>
                    <button className="btn" type="submit" disabled={busy}>
                      تعيين على الصفحة
                    </button>
                  </div>
                </form>
              )
            ) : (
              <form className="form-grid two" onSubmit={createStaff}>
                <label>
                  الاسم *
                  <input
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  الهاتف
                  <input
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                  />
                </label>
                <label>
                  كلمة المرور *
                  <input
                    type="password"
                    value={newStaff.password}
                    onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </label>
                <label>
                  الدور في الصفحة
                  <select
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  >
                    {Object.entries(PAGE_ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نوع التوظيف
                  <select
                    value={newStaff.employmentType}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, employmentType: e.target.value })
                    }
                  >
                    {Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {newStaff.employmentType === 'SALARY' ? (
                  <label>
                    المرتب الشهري (د.ل)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newStaff.monthlySalary}
                      onChange={(e) =>
                        setNewStaff({ ...newStaff, monthlySalary: e.target.value })
                      }
                    />
                  </label>
                ) : null}
                {newStaff.employmentType === 'COMMISSION' ? (
                  <label>
                    عمولة القطعة (د.ل)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newStaff.commissionPerPiece}
                      onChange={(e) =>
                        setNewStaff({ ...newStaff, commissionPerPiece: e.target.value })
                      }
                    />
                  </label>
                ) : null}
                <div className="toolbar" style={{ gridColumn: '1 / -1' }}>
                  <button className="btn" type="submit" disabled={busy}>
                    إنشاء وتعيين
                  </button>
                </div>
              </form>
            )}
          </div>

          {!employees.length ? (
            <div className="panel muted">لا موظفات على هذه الصفحة بعد.</div>
          ) : (
            <div className="table-wrap panel">
              <table>
                <thead>
                  <tr>
                    <th>الموظفة</th>
                    <th>الهاتف</th>
                    <th>الدور</th>
                    <th>التوظيف</th>
                    <th>المرتب / العمولة</th>
                    <th>طلبات</th>
                    <th>مُسلّم</th>
                    <th>عمولة</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((row) => (
                    <tr key={row.userId}>
                      <td>
                        <Link to={`/facebook-page-employees/${row.userId}`}>
                          <strong>{row.user.name}</strong>
                        </Link>
                      </td>
                      <td>{row.user.phone || '—'}</td>
                      <td>{PAGE_ROLE_LABEL[row.role] || row.role}</td>
                      <td>
                        {EMPLOYMENT_LABEL[row.user.employmentType || ''] ||
                          row.user.employmentType ||
                          '—'}
                      </td>
                      <td>
                        {row.user.employmentType === 'SALARY'
                          ? money(row.user.monthlySalary || 0)
                          : row.user.employmentType === 'COMMISSION'
                            ? money(row.commissionTotal)
                            : '—'}
                      </td>
                      <td>{row.orders}</td>
                      <td>{row.delivered}</td>
                      <td>{money(row.commissionTotal)}</td>
                      <td>
                        <span className={statusBadgeClass(row.user.status)}>
                          {row.user.status === 'ACTIVE'
                            ? 'نشطة'
                            : row.user.status === 'INACTIVE'
                              ? 'موقوفة'
                              : row.user.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Link
                            className="btn sm secondary"
                            to={`/facebook-page-employees/${row.userId}`}
                          >
                            عرض
                          </Link>
                          <button
                            type="button"
                            className="btn sm secondary"
                            onClick={() => startEdit(row)}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="btn sm ghost"
                            disabled={busy}
                            onClick={() => removeMember(row.userId, row.user.name)}
                          >
                            إزالة من الصفحة
                          </button>
                          {row.user.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              className="btn sm ghost"
                              disabled={busy}
                              onClick={() => disableUser(row.userId, row.user.name)}
                            >
                              تعطيل
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingId ? (
            <form className="panel stack" onSubmit={saveEdit}>
              <strong>تعديل التوظيف والدور</strong>
              <div className="form-grid two">
                <label>
                  الدور
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    {Object.entries(PAGE_ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نوع التوظيف
                  <select
                    value={editForm.employmentType}
                    onChange={(e) =>
                      setEditForm({ ...editForm, employmentType: e.target.value })
                    }
                  >
                    {Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {editForm.employmentType === 'SALARY' ? (
                  <label>
                    المرتب الشهري (د.ل)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editForm.monthlySalary}
                      onChange={(e) =>
                        setEditForm({ ...editForm, monthlySalary: e.target.value })
                      }
                    />
                  </label>
                ) : null}
                {editForm.employmentType === 'COMMISSION' ? (
                  <label>
                    عمولة القطعة (د.ل) — اختياري للتحديث
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editForm.commissionPerPiece}
                      onChange={(e) =>
                        setEditForm({ ...editForm, commissionPerPiece: e.target.value })
                      }
                    />
                  </label>
                ) : null}
              </div>
              <div className="toolbar">
                <button className="btn" type="submit" disabled={busy}>
                  حفظ
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditingId(null)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === 'orders' ? (
        <div className="stack">
          <div className="panel toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
            <select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
            >
              <option value="">كل الحالات</option>
              <option value="NEW">جديد</option>
              <option value="CONFIRMED">مؤكد</option>
              <option value="PREPARING">تجهيز</option>
              <option value="OUT_FOR_DELIVERY">توصيل</option>
              <option value="DELIVERED">مُسلّم</option>
              <option value="CANCELLED">ملغي</option>
              <option value="RETURNED">مرتجع</option>
            </select>
            <input
              value={orderQ}
              onChange={(e) => setOrderQ(e.target.value)}
              placeholder="بحث برقم الطلب / العميل / الهاتف..."
              style={{ minWidth: 220 }}
            />
            <button type="button" className="btn sm secondary" onClick={() => loadOrders()}>
              تحديث
            </button>
          </div>

          {!filteredOrders.length ? (
            <div className="panel muted">لا طلبات مطابقة.</div>
          ) : (
            <div className="table-wrap panel">
              <table>
                <thead>
                  <tr>
                    <th>رقم الطلب</th>
                    <th>التاريخ</th>
                    <th>العميل</th>
                    <th>الهاتف</th>
                    <th>الموظفة</th>
                    <th>القطع</th>
                    <th>الإجمالي</th>
                    <th>حالة الطلب</th>
                    <th>التوصيل</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/orders?focus=${o.id}`}>
                          <strong>{o.orderNumber}</strong>
                        </Link>
                      </td>
                      <td>{new Date(o.createdAt).toLocaleDateString('ar-LY')}</td>
                      <td>{o.shippingName || '—'}</td>
                      <td>{o.shippingPhone || '—'}</td>
                      <td>{o.salesAgent?.name || '—'}</td>
                      <td>{piecesOf(o)}</td>
                      <td>{money(o.totalAmount)}</td>
                      <td>
                        <span className={statusBadgeClass(o.status)}>
                          {statusLabel[o.status] || o.status}
                        </span>
                      </td>
                      <td>{deliveryLabel(o)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Link className="btn sm secondary" to={`/orders?focus=${o.id}`}>
                            عرض
                          </Link>
                          {o.deliveries?.length ? (
                            <Link
                              className="btn sm secondary"
                              to={`/delivery/print?orderIds=${o.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              طباعة
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'performance' ? (
        <div className="stack">
          <div className="panel toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn sm ${preset === 'today' ? '' : 'secondary'}`}
              onClick={() => applyPreset('today')}
            >
              اليوم
            </button>
            <button
              type="button"
              className={`btn sm ${preset === 'week' ? '' : 'secondary'}`}
              onClick={() => applyPreset('week')}
            >
              هذا الأسبوع
            </button>
            <button
              type="button"
              className={`btn sm ${preset === 'month' ? '' : 'secondary'}`}
              onClick={() => applyPreset('month')}
            >
              هذا الشهر
            </button>
            <button
              type="button"
              className={`btn sm ${preset === 'custom' ? '' : 'secondary'}`}
              onClick={() => setPreset('custom')}
            >
              مخصص
            </button>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              من
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset('custom');
                  setFrom(e.target.value);
                }}
              />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              إلى
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset('custom');
                  setTo(e.target.value);
                }}
              />
            </label>
            <button type="button" className="btn sm" onClick={() => loadPerformance()}>
              تطبيق
            </button>
          </div>

          {report ? (
            <div className="stats">
              <div className="stat">
                <div className="stat-label">إجمالي الطلبات</div>
                <div className="stat-value">{report.totals.orders}</div>
              </div>
              <div className="stat">
                <div className="stat-label">مُسلّم</div>
                <div className="stat-value">{report.totals.delivered}</div>
              </div>
              <div className="stat">
                <div className="stat-label">ملغي</div>
                <div className="stat-value">{report.totals.cancelled}</div>
              </div>
              <div className="stat">
                <div className="stat-label">مرتجع</div>
                <div className="stat-value">{report.totals.returned}</div>
              </div>
              <div className="stat">
                <div className="stat-label">قطع مُسلّمة</div>
                <div className="stat-value">{report.totals.piecesDelivered}</div>
              </div>
              <div className="stat">
                <div className="stat-label">قيمة المبيعات (مُسلّم)</div>
                <div className="stat-value">{money(report.totals.salesValue)}</div>
              </div>
            </div>
          ) : null}

          <div className="panel stack">
            <strong>أداء الموظفات</strong>
            {!perfRows.length ? (
              <p className="muted">لا بيانات في الفترة المحددة.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الموظفة</th>
                      <th>التوظيف</th>
                      <th>طلبات</th>
                      <th>قطع</th>
                      <th>مُسلّم</th>
                      <th>ملغي</th>
                      <th>مرتجع</th>
                      <th>نسبة التسليم</th>
                      <th>عمولة الفترة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfRows.map((r) => (
                      <tr key={r.userId}>
                        <td>
                          <Link to={`/facebook-page-employees/${r.userId}`}>
                            {r.name}
                          </Link>
                        </td>
                        <td>
                          {EMPLOYMENT_LABEL[r.employmentType || ''] ||
                            r.employmentType ||
                            '—'}
                        </td>
                        <td>{r.orders}</td>
                        <td>{r.pieces}</td>
                        <td>{r.delivered}</td>
                        <td>{r.cancelled}</td>
                        <td>{r.returned}</td>
                        <td>{r.deliveryRate}%</td>
                        <td>{money(r.commissionEarned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {report?.employees?.length ? (
            <div className="panel stack">
              <strong>المُسلّم حسب الموظفة (التقرير)</strong>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الموظفة</th>
                      <th>طلبات</th>
                      <th>مُسلّم</th>
                      <th>قطع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.employees.map((e) => (
                      <tr key={e.userId}>
                        <td>{e.name}</td>
                        <td>{e.orders}</td>
                        <td>{e.delivered}</td>
                        <td>{e.pieces}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="stack">
          <form className="panel stack" onSubmit={saveSettings}>
            <strong>إعدادات الصفحة</strong>
            <div className="form-grid two">
              <label>
                اسم الصفحة *
                <input
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  required
                />
              </label>
              <label>
                الحالة
                <select
                  value={settings.status}
                  onChange={(e) => setSettings({ ...settings, status: e.target.value })}
                >
                  <option value="ACTIVE">ACTIVE — مفعّلة</option>
                  <option value="INACTIVE">INACTIVE — متوقفة</option>
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                ملاحظات
                <textarea
                  rows={3}
                  value={settings.notes}
                  onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="toolbar">
              <button className="btn" type="submit" disabled={busy}>
                حفظ
              </button>
              <Link className="btn secondary" to={`/facebook-pages/${id}/edit`}>
                صفحة التعديل الكاملة
              </Link>
            </div>
          </form>

          <div className="panel stack">
            <strong>رابط متجر الصفحة</strong>
            <code style={{ wordBreak: 'break-all' }}>{storefrontUrl || '—'}</code>
            <div className="toolbar" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn sm"
                disabled={!storefrontUrl}
                onClick={() => storefrontUrl && copyText('settings-store', storefrontUrl)}
              >
                {copied === 'settings-store' ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
              <a
                className="btn sm secondary"
                href={storefrontUrl || '#'}
                target="_blank"
                rel="noreferrer"
              >
                فتح المتجر
              </a>
            </div>
            {page?.publicCode != null ? (
              <p className="muted" style={{ margin: 0 }}>
                المعرّف العام: #{page.publicCode}
              </p>
            ) : null}
          </div>

          <div className="panel stack">
            <strong>حساب الشحن – المعيار</strong>
            <p className="muted" style={{ margin: 0 }}>
              عند شحن طلبات هذه الصفحة خارجياً يُستخدم هذا الحساب تلقائياً. لا تُعرض المفاتيح السرية كاملة.
            </p>
            <label>
              الحساب المرتبط
              <select
                value={shipSelect}
                onChange={(e) => setShipSelect(e.target.value)}
              >
                <option value="">بدون حساب محدد</option>
                {shipAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                    {a.facebookPageId === id ? ' (هذه الصفحة)' : ` — ${a.pageName}`}
                  </option>
                ))}
                <option value="__new__">إدخال مفتاح جديد…</option>
              </select>
            </label>
            {shipSelect === '__new__' ? (
              <div className="form-grid two">
                <label>
                  اسم الحساب (للعرض)
                  <input
                    value={shipLabel}
                    onChange={(e) => setShipLabel(e.target.value)}
                    placeholder={settings.name}
                  />
                </label>
                <label>
                  مفتاح API
                  <input
                    type="password"
                    value={shipToken}
                    onChange={(e) => setShipToken(e.target.value)}
                    placeholder="الصق مفتاح المعيار"
                    autoComplete="off"
                  />
                </label>
              </div>
            ) : null}
            {page?.shippingAccount?.hasToken ? (
              <p className="muted" style={{ margin: 0 }}>
                الحالي: {page.shippingAccount.label || 'حساب مربوط'} ✓
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>غير مربوط</p>
            )}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => saveShippingLink()}
            >
              حفظ حساب الشحن
            </button>
          </div>

          <div className="panel stack">
            <strong>الموظفات</strong>
            {!page?.employees?.length ? (
              <p className="muted">لا موظفات — أديري التعيين من تبويب الموظفات.</p>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {page.employees.map((e) => (
                  <li key={e.userId}>
                    <Link to={`/facebook-page-employees/${e.userId}`}>{e.user.name}</Link>
                    {' · '}
                    {PAGE_ROLE_LABEL[e.role] || e.role}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn secondary sm" onClick={() => setTab('employees')}>
              إدارة الموظفات
            </button>
          </div>

          <div className="panel stack">
            <strong>حذف الصفحة</strong>
            <p className="muted" style={{ margin: 0 }}>
              الحذف النهائي متاح فقط إن لم توجد طلبات. إن وُجدت طلبات استخدمي إيقاف الصفحة.
            </p>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => deletePage()}>
              حذف الصفحة
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverviewTab({ dashboard }: { dashboard: Dashboard | null }) {
  if (!dashboard) {
    return <div className="panel muted">جارٍ تحميل النظرة العامة...</div>;
  }
  const { kpis, recentOrders, topEmployees } = dashboard;

  return (
    <div className="stack">
      <div className="stats">
        <div className="stat">
          <div className="stat-label">طلبات اليوم</div>
          <div className="stat-value">{kpis.ordersToday}</div>
        </div>
        <div className="stat">
          <div className="stat-label">طلبات هذا الشهر</div>
          <div className="stat-value">{kpis.ordersMonth}</div>
        </div>
        <div className="stat">
          <div className="stat-label">تم تسليمها</div>
          <div className="stat-value">{kpis.delivered}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ملغاة</div>
          <div className="stat-value">{kpis.cancelled}</div>
        </div>
        <div className="stat">
          <div className="stat-label">مبيعات الصفحة (مُسلّم)</div>
          <div className="stat-value">{money(kpis.salesDelivered)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">موظفات نشطات</div>
          <div className="stat-value">{kpis.activeEmployees}</div>
        </div>
        <div className="stat">
          <div className="stat-label">نسبة التسليم</div>
          <div className="stat-value">{kpis.deliveryRate}%</div>
          <div className="stat-hint">ضمن الفترة المعروضة في الواجهة الخلفية</div>
        </div>
      </div>

      <div className="panel stack">
        <strong>أحدث الطلبات</strong>
        {!recentOrders.length ? (
          <p className="muted">لا طلبات بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>العميل</th>
                  <th>الموظفة</th>
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
                    <td>{o.shippingName || '—'}</td>
                    <td>{o.salesAgent?.name || '—'}</td>
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

      <div className="panel stack">
        <strong>أفضل الموظفات (حسب المُسلّم)</strong>
        {!topEmployees.length ? (
          <p className="muted">لا بيانات كافية بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الموظفة</th>
                  <th>طلبات</th>
                  <th>مُسلّم</th>
                  <th>قطع</th>
                </tr>
              </thead>
              <tbody>
                {topEmployees.map((e) => (
                  <tr key={e.agentId}>
                    <td>
                      <Link to={`/facebook-page-employees/${e.agentId}`}>{e.name}</Link>
                    </td>
                    <td>{e.orders}</td>
                    <td>{e.delivered}</td>
                    <td>{e.pieces}</td>
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
