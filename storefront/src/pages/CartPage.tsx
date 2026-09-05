import { Link } from 'react-router-dom';
import { money } from '../api/client';
import { useCart, useCartStock } from '../cart/CartContext';

export function CartPage() {
  const { items, subtotal, setQty, remove } = useCart();
  const { stock, unavailable, canCheckout, loaded } = useCartStock();

  if (!items.length) {
    return (
      <section className="container section empty-state">
        <span className="material-symbols-outlined empty-icon" aria-hidden>
          shopping_bag
        </span>
        <h2 className="headline-md">سلتك ما زالت فارغة</h2>
        <p className="muted">اكتشفي تشكيلتنا وأضيفي ما يناسبكِ</p>
        <Link className="btn" to="/products">
          ابدئي التسوق
        </Link>
      </section>
    );
  }

  function lineOut(variantId: string) {
    return loaded && stock[variantId] && !stock[variantId].inStock;
  }

  function lineMax(variantId: string) {
    return stock[variantId]?.available ?? 99;
  }

  return (
    <section className="container section">
      <div className="section-head">
        <h2>سلة التسوق</h2>
      </div>

      {unavailable.length ? (
        <div className="stock-out-banner" role="status" style={{ marginBottom: 16 }}>
          غير متوفر
          <span>بعض المنتجات نفدت. احذفيها من السلة حتى تتمكّني من إتمام الطلب.</span>
        </div>
      ) : null}

      <div className="cart-desktop panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>المنتج</th>
              <th>المواصفات</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الإجمالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const out = lineOut(i.variantId);
              const max = lineMax(i.variantId);
              return (
                <tr key={i.variantId} className={out ? 'is-out' : undefined}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {i.image ? <img src={i.image} alt="" className="cart-thumb" /> : null}
                      <div>
                        <Link to={`/product/${i.productId}`}>{i.nameAr}</Link>
                        {out ? <div className="stock-out">غير متوفر</div> : null}
                      </div>
                    </div>
                  </td>
                  <td>{[i.color, i.size].filter(Boolean).join(' / ') || '—'}</td>
                  <td>
                    {out ? (
                      <span className="muted">—</span>
                    ) : (
                      <div className="qty">
                        <button type="button" onClick={() => setQty(i.variantId, i.quantity - 1)}>
                          -
                        </button>
                        <span>{i.quantity}</span>
                        <button
                          type="button"
                          disabled={i.quantity >= max}
                          onClick={() => setQty(i.variantId, Math.min(max, i.quantity + 1))}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </td>
                  <td>{money(i.unitPrice)}</td>
                  <td>{out ? '—' : money(i.unitPrice * i.quantity)}</td>
                  <td>
                    <button className="btn ghost" type="button" onClick={() => remove(i.variantId)}>
                      حذف
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cart-mobile">
        {items.map((i) => {
          const out = lineOut(i.variantId);
          const max = lineMax(i.variantId);
          return (
            <article key={i.variantId} className={`cart-line panel${out ? ' is-out' : ''}`}>
              {i.image ? <img src={i.image} alt="" /> : <div className="cart-line-ph" />}
              <div className="cart-line-body">
                <Link to={`/product/${i.productId}`} className="name">
                  {i.nameAr}
                </Link>
                <div className="muted">{[i.color, i.size].filter(Boolean).join(' / ') || '—'}</div>
                {out ? <div className="stock-out">غير متوفر</div> : <div className="price">{money(i.unitPrice * i.quantity)}</div>}
                <div className="cart-line-actions">
                  {out ? null : (
                    <div className="qty">
                      <button type="button" onClick={() => setQty(i.variantId, i.quantity - 1)}>
                        -
                      </button>
                      <span>{i.quantity}</span>
                      <button
                        type="button"
                        disabled={i.quantity >= max}
                        onClick={() => setQty(i.variantId, Math.min(max, i.quantity + 1))}
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button className="btn ghost" type="button" onClick={() => remove(i.variantId)}>
                    حذف
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="panel cart-summary">
        <div>
          <div className="muted">المجموع الفرعي</div>
          <strong style={{ fontSize: 22 }}>{money(subtotal)}</strong>
          <div className="muted">رسوم التوصيل تُحسب في الدفع حسب المدينة</div>
        </div>
        <div className="cart-summary-actions">
          <Link className="btn secondary" to="/products">
            متابعة التسوق
          </Link>
          {canCheckout ? (
            <Link className="btn" to="/checkout">
              إتمام الطلب
            </Link>
          ) : (
            <button className="btn soldout" type="button" disabled>
              {loaded ? 'تعذر إتمام الطلب — منتج غير متوفر' : 'جارٍ التحقق من المخزون...'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
