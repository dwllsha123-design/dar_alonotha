import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { useAuth } from '../auth/AuthContext';
import { NewsletterForm } from '../components/NewsletterForm';
import { CartDrawer } from '../components/CartDrawer';
import { SearchOverlay } from '../components/SearchOverlay';
import { SizeGuideModal } from '../components/SizeGuide';
import {
  SITE_COPY,
  STORE_LOCATION,
  STORE_PHONE_LINKS,
  STORE_PHONES,
} from '../data/siteContent';
import { useTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { useLocale } from '../i18n/LocaleContext';

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

function bottomActive(pathname: string, key: string) {
  if (key === 'home') return pathname === '/';
  if (key === 'shop') {
    return (
      pathname.startsWith('/products') ||
      pathname.startsWith('/product') ||
      pathname.startsWith('/category') ||
      pathname.startsWith('/offers') ||
      pathname.startsWith('/new') ||
      pathname.startsWith('/bestseller') ||
      pathname.startsWith('/search')
    );
  }
  if (key === 'categories') return pathname.startsWith('/categories');
  if (key === 'wishlist') return pathname.startsWith('/wishlist');
  if (key === 'cart') return pathname.startsWith('/cart') || pathname.startsWith('/checkout');
  return false;
}

export function StoreLayout() {
  const { count } = useCart();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useLocale();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const categories = useStoreCategories();

  const parents = useMemo(() => categories.filter((c) => !c.parentId), [categories]);

  const drawerLinks = useMemo(
    () => [
      { to: '/', label: t('home'), icon: 'home' },
      { to: '/products', label: t('shop'), icon: 'storefront' },
      { to: '/categories', label: t('categories'), icon: 'grid_view' },
      { to: '/new', label: t('newArrivals'), icon: 'new_releases' },
      { to: '/bestseller', label: t('bestsellers'), icon: 'trending_up' },
      { to: '/offers', label: t('offers'), icon: 'sell' },
      ...parents.map((c) => ({
        to: `/category/${c.slug}`,
        label: c.nameAr,
        icon: CATEGORY_ICONS[c.slug] || 'category',
      })),
      { to: '/wishlist', label: t('wishlist'), icon: 'favorite' },
      { to: '/track', label: t('trackOrder'), icon: 'local_shipping' },
      { to: '/about', label: t('about'), icon: 'info' },
      { to: '/contact', label: t('contact'), icon: 'contact_support' },
    ],
    [parents, t],
  );

  useEffect(() => {
    setDrawerOpen(false);
    setHeaderHidden(false);
    setCartOpen(false);
    setSearchOpen(false);
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
      if (drawerOpen || searchOpen || cartOpen) {
        setHeaderHidden(false);
        lastY = window.scrollY;
        return;
      }
      const y = window.scrollY;
      if (y < 16) setHeaderHidden(false);
      else if (y > lastY + 4) setHeaderHidden(true);
      else if (y < lastY - 4) setHeaderHidden(false);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [drawerOpen, searchOpen, cartOpen]);

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
            <Link to="/track">{t('trackOrder')}</Link>
            <button
              type="button"
              className="lang-switch"
              onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            >
              {locale === 'ar' ? 'EN' : 'ع'}
            </button>
          </div>
        </div>
      </div>

      <header className={`site-header sticky-header${headerHidden ? ' is-hidden' : ''}`}>
        <div className="container">
          <div className="header-bar">
            <div className="header-side">
              <button
                type="button"
                className="icon-btn menu-toggle"
                aria-label={t('menu')}
                onClick={() => setDrawerOpen(true)}
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
            </div>

            <Link to="/" className="brand-center" aria-label={`${t('brand')} — ${t('brandEn')}`}>
              <span className="brand-mark">
                <img className="brand-logo" src="/brand-logo.png" alt={t('brand')} />
              </span>
            </Link>

            <div className="header-side header-actions">
              <button
                type="button"
                className="icon-btn"
                aria-label={t('search')}
                onClick={() => setSearchOpen(true)}
              >
                <span className="material-symbols-outlined">search</span>
              </button>
              <Link className="icon-btn desktop-only" to={user ? '/account' : '/login'} aria-label={t('account')}>
                <span className="material-symbols-outlined">person</span>
              </Link>
              <Link className="icon-btn desktop-only" to="/wishlist" aria-label={t('wishlist')}>
                <span className="material-symbols-outlined">favorite</span>
              </Link>
              <ThemeToggle />
              <button type="button" className="icon-btn" aria-label={t('cart')} onClick={() => setCartOpen(true)}>
                <span className="material-symbols-outlined">shopping_bag</span>
                {count > 0 ? <span className="cart-badge">{count > 9 ? '9+' : count}</span> : null}
              </button>
            </div>
          </div>

          <nav className="desktop-nav desktop-nav-rich" aria-label="القائمة الرئيسية">
            <NavLink to="/" end>
              {t('home')}
            </NavLink>
            <NavLink to="/products">{t('shop')}</NavLink>
            <NavLink to="/categories">{t('categories')}</NavLink>
            <NavLink to="/offers">{t('offers')}</NavLink>
            <NavLink to="/bestseller">{t('bestsellers')}</NavLink>
            <NavLink to="/new">{t('newArrivals')}</NavLink>
            <button type="button" className="nav-text-btn" onClick={() => setSizeOpen(true)}>
              {t('sizeGuide')}
            </button>
            <NavLink to="/about">{t('about')}</NavLink>
            <NavLink to="/contact">{t('contact')}</NavLink>
          </nav>
        </div>
      </header>

      <div className={`drawer-root${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
        <aside className="drawer-panel" role="dialog" aria-label={t('menu')}>
          <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t('close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="drawer-head">
            <div className="drawer-avatar">
              <img src="/brand-logo.png" alt="" />
            </div>
            <h2 className="headline-md" style={{ margin: 0, color: 'var(--primary)' }}>
              {user ? `مرحباً ${user.name}` : t('welcome')}
            </h2>
            <p className="body-md" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
              {user ? (
                <Link to="/account">{t('account')}</Link>
              ) : (
                <>
                  <Link to="/login">{t('login')}</Link>
                  {' / '}
                  <Link to="/register">{t('register')}</Link>
                </>
              )}
            </p>
            <p className="label-sm muted" style={{ margin: 0 }}>
              {STORE_LOCATION} — {STORE_PHONES}
            </p>
          </div>
          <nav className="drawer-nav">
            {drawerLinks.map((l) => (
              <NavLink key={`${l.to}-${l.label}`} to={l.to} onClick={() => setDrawerOpen(false)}>
                <span>{l.label}</span>
                <span className="material-symbols-outlined">{l.icon}</span>
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                setSizeOpen(true);
              }}
            >
              <span>{t('sizeGuide')}</span>
              <span className="material-symbols-outlined">straighten</span>
            </button>
            <button type="button" className="theme-drawer-btn" onClick={toggleTheme}>
              <span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
              <span className="material-symbols-outlined">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
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
            <img className="footer-logo" src="/brand-logo.png" alt={t('brand')} />
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
              <Link to="/">{t('home')}</Link>
              <Link to="/about">{t('about')}</Link>
              <Link to="/products">{t('shop')}</Link>
              <Link to="/offers">{t('offers')}</Link>
              <Link to="/reviews">آراء العملاء</Link>
            </div>
          </div>
          <div className="footer-col">
            <strong>دعم العملاء</strong>
            <div className="footer-links">
              <Link to="/track">{t('trackOrder')}</Link>
              <Link to="/cart">{t('cart')}</Link>
              <Link to="/wishlist">{t('wishlist')}</Link>
              <Link to="/policies/returns">سياسة الاسترجاع</Link>
              <Link to="/contact">{t('contact')}</Link>
            </div>
          </div>
          <div className="footer-col">
            <strong>النشرة الإخبارية</strong>
            <p className="footer-newsletter-hint">للحصول على آخر الأخبار والعروض.</p>
            <NewsletterForm />
            <p className="label-sm muted" style={{ marginTop: 12 }}>
              {t('privacyNote')}
            </p>
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
            <span>{t('home')}</span>
          </Link>
          <Link to="/categories" className={bottomActive(location.pathname, 'categories') ? 'active' : ''}>
            <span
              className={`material-symbols-outlined${bottomActive(location.pathname, 'categories') ? ' filled' : ''}`}
            >
              grid_view
            </span>
            <span>{t('categories')}</span>
          </Link>
          <button type="button" className={searchOpen ? 'active' : ''} onClick={() => setSearchOpen(true)}>
            <span className="material-symbols-outlined">search</span>
            <span>{t('search')}</span>
          </button>
          <Link to="/wishlist" className={bottomActive(location.pathname, 'wishlist') ? 'active' : ''}>
            <span
              className={`material-symbols-outlined${bottomActive(location.pathname, 'wishlist') ? ' filled' : ''}`}
            >
              favorite
            </span>
            <span>{t('wishlist')}</span>
          </Link>
          <button
            type="button"
            className={bottomActive(location.pathname, 'cart') || cartOpen ? 'active' : ''}
            onClick={() => setCartOpen(true)}
          >
            {count > 0 ? <span className="cart-dot" /> : null}
            <span className={`material-symbols-outlined${count > 0 ? ' filled' : ''}`}>shopping_bag</span>
            <span>{t('cart')}</span>
          </button>
        </div>
      </nav>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <SizeGuideModal open={sizeOpen} onClose={() => setSizeOpen(false)} />
    </div>
  );
}
