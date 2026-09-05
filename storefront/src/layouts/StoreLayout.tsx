import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { useAuth } from '../auth/AuthContext';
import { NewsletterForm } from '../components/NewsletterForm';
import { CartDrawer } from '../components/CartDrawer';
import { SearchOverlay } from '../components/SearchOverlay';
import { SizeGuideModal } from '../components/SizeGuide';
import { FloatingActions } from '../components/FloatingActions';
import {
  SITE_COPY,
  STORE_LOCATION,
  STORE_PHONE_LINKS,
  STORE_PHONES,
  STORE_WHATSAPP_LINK,
} from '../data/siteContent';
import { useTheme } from '../theme/ThemeContext';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { useLocale } from '../i18n/LocaleContext';

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

export function StoreLayout() {
  const { count } = useCart();
  const { user, logout } = useAuth();
  const { setTheme } = useTheme();
  const { t, locale, setLocale } = useLocale();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    setTheme('dark');
  }, [setTheme]);

  useEffect(() => {
    setDrawerOpen(false);
    setCartOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <div className="page-shell pb-skin">
      {/* Row 1: phones + language — Play Baby style */}
      <div className="pb-topbar">
        <div className="container pb-topbar-inner">
          <button
            type="button"
            className="pb-lang"
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
          >
            {locale === 'ar' ? 'En' : 'ع'}
          </button>
          <div className="pb-phones">
            <span>اتصال:</span>
            {STORE_PHONE_LINKS.map((p, i) => (
              <span key={p.href}>
                {i > 0 ? ' / ' : null}
                <a href={p.href}>{p.label}</a>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: cart / search / account */}
      <div className="pb-utilbar">
        <div className="container pb-utilbar-inner">
          <div className="pb-util-start">
            <button type="button" className="pb-icon" aria-label={t('cart')} onClick={() => setCartOpen(true)}>
              <span className="material-symbols-outlined">shopping_bag</span>
              <span className={`pb-cart-count${count > 0 ? ' on' : ''}`}>{count}</span>
            </button>
            <button type="button" className="pb-icon" aria-label={t('search')} onClick={() => setSearchOpen(true)}>
              <span className="material-symbols-outlined">search</span>
            </button>
          </div>
          <div className="pb-util-end">
            <Link to={user ? '/account' : '/login'} className="pb-account-link">
              <span>{user ? t('account') : t('login')}</span>
              <span className="material-symbols-outlined">person</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Row 3: menu + logo */}
      <header className="pb-header">
        <div className="container pb-header-inner">
          <button
            type="button"
            className="pb-icon menu-toggle"
            aria-label={t('menu')}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <Link to="/" className="pb-logo" aria-label={`${t('brand')} — ${t('brandEn')}`}>
            <img src="/brand-logo.png" alt={t('brand')} />
            <span className="pb-logo-text">
              <strong>{t('brand')}</strong>
              <em>{t('brandEn')}</em>
            </span>
          </Link>
        </div>
        <nav className="container pb-desktop-nav" aria-label="القائمة الرئيسية">
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
            <a href={STORE_WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
              <span>واتساب</span>
              <span className="material-symbols-outlined">chat</span>
            </a>
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

      <footer className="site-footer pb-footer">
        <div className="container footer-grid footer-grid-ly">
          <div className="footer-brand">
            <img className="footer-logo" src="/brand-logo.png" alt={t('brand')} />
            <h3>حول المتجر</h3>
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
              <li>
                <a href={STORE_WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
                  واتساب: 0924443839
                </a>
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
              <Link to="/contact">{t('contact')}</Link>
            </div>
          </div>
          <div className="footer-col">
            <strong>دعم العملاء</strong>
            <div className="footer-links">
              <Link to="/track">{t('trackOrder')}</Link>
              <Link to="/cart">{t('cart')}</Link>
              <Link to="/wishlist">{t('wishlist')}</Link>
              <Link to="/policies/returns">سياسة الاسترجاع</Link>
              <Link to="/policies/shipping">سياسة الشحن</Link>
            </div>
          </div>
          <div className="footer-col">
            <strong>النشرة الإخبارية</strong>
            <p className="footer-newsletter-hint">للحصول على آخر الأخبار والعروض.</p>
            <NewsletterForm />
          </div>
        </div>
        <div className="container footer-bottom">
          <p>{SITE_COPY.copyright}</p>
        </div>
      </footer>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <SizeGuideModal open={sizeOpen} onClose={() => setSizeOpen(false)} />
      <FloatingActions />
    </div>
  );
}
