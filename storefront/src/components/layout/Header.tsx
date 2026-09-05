import { Link, NavLink } from 'react-router-dom';
import { useCart } from '../../cart/CartContext';
import { useAuth } from '../../auth/AuthContext';
import { useFavorites } from '../../cart/CartContext';

const NAV = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/products', label: 'المتجر' },
  { to: '/categories', label: 'التصنيفات' },
  { to: '/offers', label: 'العروض' },
  { to: '/about', label: 'من نحن' },
] as const;

type Props = {
  compact: boolean;
  onOpenMenu: () => void;
  cartPulse?: boolean;
};

export function Header({ compact, onOpenMenu, cartPulse }: Props) {
  const { count } = useCart();
  const { ids: favIds } = useFavorites();
  const { user } = useAuth();
  const favCount = favIds.length;

  return (
    <header className={`site-header${compact ? ' is-compact' : ''}`}>
      <div className="container">
        <div className="header-bar">
          <div className="header-side">
            <button type="button" className="icon-btn menu-toggle" aria-label="القائمة" onClick={onOpenMenu}>
              <span className="material-symbols-outlined">menu</span>
            </button>
            <Link className="icon-btn mobile-only" to="/search-box" aria-label="بحث">
              <span className="material-symbols-outlined">search</span>
            </Link>
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
            <Link className="icon-btn desktop-only" to="/wishlist" aria-label="المفضلة">
              <span className={`material-symbols-outlined${favCount ? ' filled' : ''}`}>favorite</span>
              {favCount > 0 ? <span className="cart-badge">{favCount > 9 ? '9+' : favCount}</span> : null}
            </Link>
            <Link className={`icon-btn${cartPulse ? ' cart-pulse' : ''}`} to="/cart" aria-label="السلة">
              <span className="material-symbols-outlined">shopping_cart</span>
              {count > 0 ? <span className="cart-badge">{count > 9 ? '9+' : count}</span> : null}
            </Link>
          </div>
        </div>

        <nav className="desktop-nav" aria-label="التنقل الرئيسي">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : undefined}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
