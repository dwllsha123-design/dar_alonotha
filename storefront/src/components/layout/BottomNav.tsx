import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../cart/CartContext';
import { useAuth } from '../../auth/AuthContext';

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

export function BottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const location = useLocation();

  const items = [
    { key: 'home', to: '/', icon: 'home', label: 'الرئيسية' },
    { key: 'store', to: '/products', icon: 'storefront', label: 'المتجر' },
    { key: 'categories', to: '/categories', icon: 'checkroom', label: 'التصنيفات' },
    { key: 'cart', to: '/cart', icon: 'shopping_cart', label: 'السلة' },
    { key: 'account', to: user ? '/account' : '/login', icon: 'person', label: 'حسابي' },
  ] as const;

  return (
    <nav className="bottom-nav" aria-label="التنقل السفلي">
      <div className="bottom-nav-inner">
        {items.map((item) => {
          const active = bottomActive(location.pathname, item.key);
          return (
            <Link key={item.key} to={item.to} className={active ? 'active' : ''}>
              {item.key === 'cart' && count > 0 ? <span className="cart-dot" /> : null}
              <span className={`material-symbols-outlined${active ? ' filled' : ''}`}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
