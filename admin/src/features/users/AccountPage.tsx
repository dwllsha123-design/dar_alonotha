import { useAuth, isFacebookPageEmployee } from '@/auth/AuthContext';
import { Link } from 'react-router-dom';

export function AccountPage() {
  const { user, logout } = useAuth();
  const pages = user?.facebookPages || [];
  const pageEmployee = isFacebookPageEmployee(user);

  return (
    <div className="stack">
      <div className="page-title">
        <h1>حسابي</h1>
        <p>بياناتك الشخصية والصفحات المُعيَّنة لك.</p>
      </div>

      <div className="panel stack">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            الاسم
          </div>
          <strong>{user?.name}</strong>
        </div>
        {user?.phone ? (
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              الهاتف
            </div>
            <strong>{user.phone}</strong>
          </div>
        ) : null}
        {user?.email ? (
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              البريد
            </div>
            <strong>{user.email}</strong>
          </div>
        ) : null}
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            الأدوار
          </div>
          <strong>{(user?.roles || []).join(' · ')}</strong>
        </div>
      </div>

      {pageEmployee ? (
        <div className="panel stack">
          <h2 className="headline-md">صفحات فيسبوك</h2>
          {pages.length ? (
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {pages.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">لم تُعيَّني على أي صفحة بعد — راجعي الإدارة.</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn" to="/orders/new">
              إضافة طلب
            </Link>
            <Link className="btn secondary" to="/my-payroll">
              راتبي / عمولتي
            </Link>
            <button className="btn ghost" type="button" onClick={logout}>
              تسجيل الخروج
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
