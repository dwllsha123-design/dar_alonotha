import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '@/api/client';
import { EMPLOYMENT_LABEL } from '@/features/facebook-pages/pageStaffShared';

type Home = {
  profile: {
    name: string;
    employmentType: string;
    monthlySalary?: string | number | null;
  } | null;
  pages: Array<{ id: string; name: string; status: string }>;
  kpis: {
    ordersToday: number;
    deliveredMonth: number;
    inProgress: number;
    cancelledMonth: number;
    commissionMonth: number;
    monthlySalary: number | null;
    employmentType: string;
  };
};

export function EmployeeHomePage() {
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Home>('/users/staff-home')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="login-page">جارٍ التحميل...</div>;

  const emp = data.kpis.employmentType;

  return (
    <div className="stack">
      <div className="page-title">
        <h1>مرحباً {data.profile?.name}</h1>
        <p>
          لوحة موظفة الصفحة — {EMPLOYMENT_LABEL[emp] || emp}
          {data.pages.length
            ? ` · ${data.pages.map((p) => p.name).join('، ')}`
            : ' · لم تُعيَّني على صفحة بعد'}
        </p>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">طلبات اليوم</div>
          <div className="stat-value">{data.kpis.ordersToday}</div>
        </div>
        <div className="stat">
          <div className="stat-label">قيد التنفيذ</div>
          <div className="stat-value">{data.kpis.inProgress}</div>
        </div>
        <div className="stat">
          <div className="stat-label">مُسلّم هذا الشهر</div>
          <div className="stat-value">{data.kpis.deliveredMonth}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ملغي/مرتجع الشهر</div>
          <div className="stat-value">{data.kpis.cancelledMonth}</div>
        </div>
        <div className="stat">
          <div className="stat-label">
            {emp === 'SALARY' ? 'راتبي الشهري' : 'عمولتي هذا الشهر'}
          </div>
          <div className="stat-value">
            {emp === 'SALARY'
              ? money(data.kpis.monthlySalary || 0)
              : money(data.kpis.commissionMonth)}
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link className="btn" to="/orders/new">
          إضافة طلب
        </Link>
        <Link className="btn secondary" to="/orders">
          الطلبات
        </Link>
        <Link className="btn secondary" to="/orders?mine=1">
          طلباتي
        </Link>
        <Link className="btn secondary" to="/my-payroll">
          راتبي / عمولتي
        </Link>
        <Link className="btn ghost" to="/account">
          حسابي
        </Link>
      </div>
    </div>
  );
}
