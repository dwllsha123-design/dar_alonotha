import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { STORE_LOCATION, STORE_PHONES } from '../../data/siteContent';
import type { StoreCategory } from '../../data/catalog';

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

type Props = {
  open: boolean;
  onClose: () => void;
  categories: StoreCategory[];
};

export function MobileMenu({ open, onClose, categories }: Props) {
  const { user, logout } = useAuth();

  const links = [
    { to: '/', label: 'الرئيسية', icon: 'home' },
    { to: '/products', label: 'المتجر', icon: 'storefront' },
    { to: '/categories', label: 'التصنيفات', icon: 'category' },
    ...categories
      .filter((c) => !c.parentId)
      .map((c) => ({
        to: `/category/${c.slug}`,
        label: c.nameAr,
        icon: CATEGORY_ICONS[c.slug] || 'checkroom',
      })),
    { to: '/offers', label: 'العروض', icon: 'sell' },
    { to: '/wishlist', label: 'المفضلة', icon: 'favorite' },
    { to: '/track', label: 'تتبع الطلب', icon: 'local_shipping' },
    { to: '/about', label: 'من نحن', icon: 'info' },
    { to: '/contact', label: 'تواصل معنا', icon: 'contact_support' },
  ];

  return (
    <div className={`drawer-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label="القائمة">
        <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق">
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="drawer-head">
          <div className="drawer-avatar">
            <img src="/brand-logo.png" alt="" />
          </div>
          <h2 className="headline-md" style={{ margin: 0, color: 'var(--primary)' }}>
            {user ? `مرحباً ${user.name}` : 'مرحباً بكِ'}
          </h2>
          <p className="body-md" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
            {user ? (
              <Link to="/account" onClick={onClose}>
                حسابي
              </Link>
            ) : (
              <>
                <Link to="/login" onClick={onClose}>
                  تسجيل الدخول
                </Link>
                {' / '}
                <Link to="/register" onClick={onClose}>
                  عضوية جديدة
                </Link>
              </>
            )}
          </p>
          <p className="label-sm muted" style={{ margin: 0 }}>
            {STORE_LOCATION} — {STORE_PHONES}
          </p>
        </div>
        <nav className="drawer-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} onClick={onClose}>
              <span>{l.label}</span>
              <span className="material-symbols-outlined">{l.icon}</span>
            </NavLink>
          ))}
          {user ? (
            <button
              type="button"
              onClick={() => {
                logout();
                onClose();
              }}
            >
              <span>خروج</span>
              <span className="material-symbols-outlined">logout</span>
            </button>
          ) : null}
        </nav>
      </aside>
    </div>
  );
}
