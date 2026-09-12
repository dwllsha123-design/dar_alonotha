import { useEffect, useMemo, useState } from 'react';
import { api, money } from '@/api/client';

type SalaryRow = {
  id: string;
  year: number;
  month: number;
  amount: string | number;
  status: string;
  paidAt?: string | null;
};

type CommissionRow = {
  id: string;
  amount: string | number;
  itemCount: number;
  status: string;
  order: { orderNumber: string; createdAt: string };
};

type Payroll = {
  profile: {
    name: string;
    employmentType: string;
    monthlySalary?: string | number | null;
  };
  salaries: SalaryRow[];
  commissions: CommissionRow[];
  summary?: {
    earnedAmount: number;
    earnedPieces: number;
    earnedOrders: number;
    voidedAmount: number;
    monthAmount: number;
    monthPieces: number;
    monthOrders: number;
  };
};

const monthNames = [
  '',
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const employmentLabel: Record<string, string> = {
  NONE: 'بدون نوع محدد',
  SALARY: 'راتب شهري',
  COMMISSION: 'عمولة بالقطعة',
};

function commissionStatusLabel(status: string) {
  if (status === 'PAID') return 'مُصرفة';
  if (status === 'APPROVED') return 'معتمدة';
  if (status === 'CANCELLED') return 'ملغاة / VOID';
  return 'معلّقة';
}

export function MyPayrollPage() {
  const [data, setData] = useState<Payroll | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Payroll>('/users/payroll/me')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const earnedRows = useMemo(
    () => (data?.commissions || []).filter((c) => c.status !== 'CANCELLED'),
    [data],
  );
  const voidRows = useMemo(
    () => (data?.commissions || []).filter((c) => c.status === 'CANCELLED'),
    [data],
  );

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="login-page">جارٍ التحميل...</div>;

  return (
    <div className="stack">
      <div className="page-title">
        <h1>راتبي وعمولاتي</h1>
        <p>
          {data.profile.name} —{' '}
          {employmentLabel[data.profile.employmentType] || data.profile.employmentType}
          {data.profile.employmentType === 'SALARY' && data.profile.monthlySalary
            ? ` · ${money(data.profile.monthlySalary)} / شهر`
            : null}
        </p>
      </div>

      {data.profile.employmentType === 'COMMISSION' && data.summary ? (
        <div className="stats">
          <div className="stat">
            <div className="stat-label">عمولة هذا الشهر</div>
            <div className="stat-value">{money(data.summary.monthAmount)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">قطع محتسبة (الشهر)</div>
            <div className="stat-value">{data.summary.monthPieces}</div>
          </div>
          <div className="stat">
            <div className="stat-label">طلبات مُسلّمة محتسبة</div>
            <div className="stat-value">{data.summary.monthOrders}</div>
          </div>
          <div className="stat">
            <div className="stat-label">إجمالي مكتسب (غير VOID)</div>
            <div className="stat-value">{money(data.summary.earnedAmount)}</div>
          </div>
        </div>
      ) : null}

      {data.profile.employmentType === 'SALARY' ? (
        <div className="panel">
          <h2 className="headline-md">الرواتب الشهرية</h2>
          {!data.salaries.length ? (
            <p className="muted">لا توجد سجلات راتب بعد.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الشهر</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.salaries.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {monthNames[s.month]} {s.year}
                      </td>
                      <td>{money(s.amount)}</td>
                      <td>
                        <span className={s.status === 'PAID' ? 'badge ok' : 'badge warn'}>
                          {s.status === 'PAID' ? 'تم الاستلام' : 'لم يُصرف بعد'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {data.profile.employmentType === 'COMMISSION' || data.commissions.length ? (
        <div className="panel">
          <h2 className="headline-md">العمولات المكتسبة (عند التسليم)</h2>
          <p className="muted">القيود الملغاة (VOID) لا تُحسب ضمن المكتسب.</p>
          {!earnedRows.length ? (
            <p className="muted">لا توجد عمولات مكتسبة بعد.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>القطع</th>
                    <th>العمولة</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {earnedRows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.order.orderNumber}</td>
                      <td>{c.itemCount}</td>
                      <td>{money(c.amount)}</td>
                      <td>
                        <span className={c.status === 'PAID' ? 'badge ok' : 'badge warn'}>
                          {commissionStatusLabel(c.status)}
                        </span>
                      </td>
                      <td>{new Date(c.order.createdAt).toLocaleDateString('ar-LY')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {voidRows.length ? (
            <>
              <h2 className="headline-md" style={{ marginTop: 20 }}>
                عمولات ملغاة (مرتجع/إلغاء بعد التسليم)
              </h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الطلب</th>
                      <th>القطع</th>
                      <th>المبلغ</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voidRows.map((c) => (
                      <tr key={c.id}>
                        <td>{c.order.orderNumber}</td>
                        <td>{c.itemCount}</td>
                        <td>{money(c.amount)}</td>
                        <td>
                          <span className="badge danger">{commissionStatusLabel(c.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {data.profile.employmentType === 'NONE' &&
      !data.commissions.length &&
      !data.salaries.length ? (
        <div className="panel muted">نوع التوظيف غير مُحدّد — تواصلي مع الإدارة.</div>
      ) : null}
    </div>
  );
}
