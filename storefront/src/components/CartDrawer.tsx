import { Link } from 'react-router-dom';
import { money } from '../api/client';
import { useCart } from '../cart/CartContext';
import { useLocale } from '../i18n/LocaleContext';

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const { items, count, subtotal, setQty, remove } = useCart();

  if (!open) return null;

  return (
    <div className="drawer-root open cart-drawer-root" aria-hidden={false}>
      <button type="button" className="drawer-overlay" aria-label={t('close')} onClick={onClose} />
      <aside className="drawer-panel cart-drawer-panel" role="dialog" aria-label={t('cart')}>
        <div className="cart-drawer-head">
          <h2>
            {t('cart')} {count > 0 ? `(${count})` : ''}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {!items.length ? (
          <div className="cart-drawer-empty">
            <span className="material-symbols-outlined">shopping_bag</span>
            <p>{t('emptyCart')}</p>
            <Link className="btn" to="/products" onClick={onClose}>
              {t('continueShopping')}
            </Link>
          </div>
        ) : (
          <>
            <ul className="cart-drawer-list">
              {items.map((item) => (
                <li key={item.variantId} className="cart-drawer-item">
                  <Link to={`/product/${item.productId}`} onClick={onClose} className="cart-drawer-thumb">
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" />
                    ) : (
                      <span className="material-symbols-outlined">checkroom</span>
                    )}
                  </Link>
                  <div className="cart-drawer-meta">
                    <Link to={`/product/${item.productId}`} onClick={onClose}>
                      {item.nameAr}
                    </Link>
                    <p className="muted label-sm">
                      {[item.color, item.size].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="cart-drawer-row">
                      <div className="qty-mini">
                        <button
                          type="button"
                          onClick={() => setQty(item.variantId, item.quantity - 1)}
                          aria-label="-"
                        >
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.variantId, item.quantity + 1)}
                          aria-label="+"
                        >
                          +
                        </button>
                      </div>
                      <strong>{money(item.unitPrice * item.quantity)}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('remove')}
                    onClick={() => remove(item.variantId)}
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="cart-drawer-foot">
              <div className="cart-drawer-total">
                <span>{t('subtotal')}</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <p className="label-sm muted">{t('privacyNote')}</p>
              <Link className="btn" to="/checkout" onClick={onClose}>
                {t('checkout')}
              </Link>
              <Link className="btn soft" to="/cart" onClick={onClose}>
                {t('goToCart')}
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
