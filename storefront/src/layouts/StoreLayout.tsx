import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { useAuth } from '../auth/AuthContext';
import { NewsletterForm } from '../components/NewsletterForm';
import {
  SITE_COPY,
  STORE_LOCATION,
  STORE_PHONE_LINKS,
  STORE_PHONES,
} from '../data/siteContent';
import { useTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useStoreCategories } from '../hooks/useStoreCategories';

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

function bottomActive(pathname: string, key: string) {
  if (key === 'home') return pathname === '/';
  if (key === 'store') {
    return (
      pathname.startsWith('/products') ||
      pathname.startsWith('/product') ||
      pathname.startsWith('/category') ||
      pathname.startsWith('/offers') ||
      pathname.startsWith('/new') ||
      pathname.startsWith('/bestseller')
    );
  }
  if (key === 'categories') return pathname.startsWith('/categories');
  if (key === 'about') return pathname.startsWith('/about');
  if (key === 'cart') return pathname.startsWith('/cart') || pathname.startsWith('/checkout');
  if (key === 'account') {
    return (
      pathname.startsWith('/account') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/wishlist') ||
      pathname.startsWith('/track')
    );
  }
  return false;
}

export function StoreLayout() {
  const { count } = useCart();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const categories = useStoreCategories();
  const drawerLinks = useMemo(
    () => [
      { to: '/new', label: 'وصلنا حديثاً', icon: 'new_releases' },
      ...categories
        .filter((c) => !c.parentId)
        .map((c) => ({
          to: `/category/${c.slug}`,
          label: c.nameAr,
          icon: CATEGORY_ICONS[c.slug] || 'category',
        })),
      { to: '/offers', label: 'العروض', icon: 'sell' },
      { to: '/bestseller', label: 'الأكثر مبيعاً', icon: 'trending_up' },
      { to: '/wishlist', label: 'المفضلة', icon: 'favorite' },
      { to: '/track', label: 'تتبع الطلب', icon: 'local_shipping' },
      { to: '/contact', label: 'تواصل معنا', icon: 'contact_support' },
    ],
    [categories],
  );

  useEffect(() => {
    setDrawerOpen(false);
    setHeaderHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      if (drawerOpen) {
        setHeaderHidden(false);
        lastY = window.scrollY;
        return;
      }
      const y = window.scrollY;
      if (y < 16) {
        setHeaderHidden(false);
      } else if (y > lastY + 4) {
        setHeaderHidden(true);
      } else if (y < lastY - 4) {
        setHeaderHidden(false);
      }
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [drawerOpen]);

  return (
    <div className="page-shell">
      <div className="top-bar">
        <div className="container top-bar-inner">
          <span className="top-bar-welcome">{SITE_COPY.welcome}</span>
          <div className="top-bar-links">
            {STORE_PHONE_LINKS.map((p) => (
              <a key={p.href} href={p.href}>
                {p.label}
              </a>
            ))}
            <Link to="/track">تتبع طلبك</Link>
          </div>
        </div>
      </div>
      <header className={`site-header${headerHidden ? ' is-hidden' : ''}`}>
        <div className="container">
          <div className="header-bar">
            <div className="header-side">
              <button
                type="button"
                className="icon-btn menu-toggle"
                aria-label="القائمة"
                onClick={() => setDrawerOpen(true)}
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
            </div>

            <Link to="/" className="brand-center" aria-label="دار الأنوثة — Dar Al Onoutha">
              <span className="brand-mark">
                <img className="brand-logo" src="/brand-logo.png" alt="دار الأنوثة" />
              </span>
            </Link>

            <div className="header-side header-actions">
              <Link className="icon-btn desktop-only" to="/search-box" aria-label="بحث">
                <span className="material-symbols-outlined">search</span>
              </Link>
              <Link className="icon-btn desktop-only" to={user ? '/account' : '/login'} aria-label="حسابي">
                <span className="material-symbols-outlined">person</span>
              </Link>
              <ThemeToggle />
              <Link className="icon-btn" to="/cart" aria-label="السلة">
                <span className="material-symbols-outlined">shopping_cart</span>
                {count > 0 ? <span className="cart-badge">{count > 9 ? '9+' : count}</span> : null}
              </Link>
            </div>
          </div>

          <nav className="desktop-nav">
            <NavLink to="/" end>
              الرئيسية
            </NavLink>
            <NavLink to="/products">المتجر</NavLink>
            <NavLink to="/categories">التصنيفات</NavLink>
            <NavLink to="/about">من نحن</NavLink>
          </nav>
        </div>
      </header>

      <div className={`drawer-root${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
        <aside className="drawer-panel" role="dialog" aria-label="القائمة">
          <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="إغلاق">
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
                <Link to="/account">حسابي</Link>
              ) : (
                <>
                  <Link to="/login">تسجيل الدخول</Link>
                  {' / '}
                  <Link to="/register">عضوية جديدة</Link>
                </>
              )}
            </p>
            <p className="label-sm muted" style={{ margin: 0 }}>
              {STORE_LOCATION} — {STORE_PHONES}
            </p>
          </div>
          <nav className="drawer-nav">
            {drawerLinks.map((l) => (
              <NavLink key={l.to} to={l.to}>
                <span>{l.label}</span>
                <span className="material-symbols-outlined">{l.icon}</span>
              </NavLink>
            ))}
            <button type="button" className="theme-drawer-btn" onClick={toggleTheme}>
              <span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
              <span className="material-symbols-outlined">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            {user ? (
              <button type="button" onClick={logout}>
                <span>خروج</span>
                <span className="material-symbols-outlined">logout</span>
              </button>
            ) : null}
          </nav>
        </aside>
      </div>

      <Outlet />

      <footer className="site-footer">
        <div className="container footer-grid footer-grid-ly">
          <div className="footer-brand">
            <img className="footer-logo" src="/brand-logo.png" alt="دار الأنوثة" />
            <h3>حول الشركة</h3>
            <p>{SITE_COPY.footerAbout}</p>
            <p>{SITE_COPY.footerDelivery}</p>
            <ul className="footer-contact">
              <li>{STORE_LOCATION}</li>
              <li>
                {STORE_PHONE_LINKS.map((p, i) => (
                  <span key={p.href}>
                    {i > 0 ? ' / ' : null}
                    <a href={p.href}>{p.label}</a>
                  </span>
                ))}
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <strong>روابط سريعة</strong>
            <div className="footer-links">
              <Link to="/">الصفحة الرئيسية</Link>
              <Link to="/about">من نحن</Link>
              <Link to="/products">تسوق الآن</Link>
              <Link to="/reviews">آراء العملاء</Link>
              <Link to="/policies/shipping">سياسة الشحن</Link>
            </div>
          </div>
          <div className="footer-col">
            <strong>دعم العملاء</strong>
            <div className="footer-links">
              <Link to="/track">تتبع طلبك</Link>
              <Link to="/cart">سلة المشتريات</Link>
              <Link to="/policies/returns">سياسة الاسترجاع</Link>
              <Link to="/policies/shipping">طرق الشحن</Link>
              <Link to="/contact">خدمة العملاء</Link>
            </div>
          </div>
          <div className="footer-col">
            <strong>النشرة الإخبارية</strong>
            <p className="footer-newsletter-hint">للحصول على آخر الأخبار وآخر التحديثات منا.</p>
            <NewsletterForm />
          </div>
        </div>
        <div className="container footer-bottom">
          <p>{SITE_COPY.copyright}</p>
        </div>
      </footer>

      <nav className="bottom-nav" aria-label="التنقل السفلي">
        <div className="bottom-nav-inner">
          <Link to="/" className={bottomActive(location.pathname, 'home') ? 'active' : ''}>
            <span className={`material-symbols-outlined${bottomActive(location.pathname, 'home') ? ' filled' : ''}`}>
              home
            </span>
            <span>الرئيسية</span>
          </Link>
          <Link to="/products" className={bottomActive(location.pathname, 'store') ? 'active' : ''}>
            <span className={`material-symbols-outlined${bottomActive(location.pathname, 'store') ? ' filled' : ''}`}>
              storefront
            </span>
            <span>المتجر</span>
          </Link>
          <Link to="/categories" className={bottomActive(location.pathname, 'categories') ? 'active' : ''}>
            <span className={`material-symbols-outlined${bottomActive(location.pathname, 'categories') ? ' filled' : ''}`}>
              checkroom
            </span>
            <span>التصنيفات</span>
          </Link>
          <Link to="/cart" className={bottomActive(location.pathname, 'cart') ? 'active' : ''}>
            {count > 0 ? <span className="cart-dot" /> : null}
            <span className={`material-symbols-outlined${bottomActive(location.pathname, 'cart') ? ' filled' : ''}`}>
              shopping_cart
            </span>
            <span>السلة</span>
          </Link>
          <Link to={user ? '/account' : '/login'} className={bottomActive(location.pathname, 'account') ? 'active' : ''}>
            <span className={`material-symbols-outlined${bottomActive(location.pathname, 'account') ? ' filled' : ''}`}>
              person
            </span>
            <span>حسابي</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
