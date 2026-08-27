import { useEffect, useState } from 'react';
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

export function MyPayrollPage() {
  const [data, setData] = useState<Payroll | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Payroll>('/users/payroll/me')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="login-page">جارٍ التحميل...</div>;

  return (
    <div className="stack">
      <div className="page-title">
        <h1>راتبي وعمولاتي</h1>
        <p>
          {data.profile.name} — {employmentLabel[data.profile.employmentType] || data.profile.employmentType}
          {data.profile.employmentType === 'SALARY' && data.profile.monthlySalary
            ? ` · ${money(data.profile.monthlySalary)} / شهر`
            : null}
        </p>
      </div>

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
          <h2 className="headline-md">العمولات (5 د.ل لكل قطعة مُسلّمة)</h2>
          {!data.commissions.length ? (
            <p className="muted">لا توجد عمولات مسجّلة بعد — تُحسب عند تسليم الطلب.</p>
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
                  {data.commissions.map((c) => (
                    <tr key={c.id}>
                      <td>{c.order.orderNumber}</td>
                      <td>{c.itemCount}</td>
                      <td>{money(c.amount)}</td>
                      <td>
                        <span className={c.status === 'PAID' ? 'badge ok' : 'badge warn'}>
                          {c.status === 'PAID' ? 'مُصرفة' : c.status === 'APPROVED' ? 'معتمدة' : 'معلّقة'}
                        </span>
                      </td>
                      <td>{new Date(c.order.createdAt).toLocaleDateString('ar-LY')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {data.profile.employmentType === 'NONE' && !data.commissions.length && !data.salaries.length ? (
        <div className="panel muted">نوع التوظيف غير مُحدّد — تواصلي مع الإدارة.</div>
      ) : null}
    </div>
  );
}
