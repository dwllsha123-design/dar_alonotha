import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, money, statusLabel } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFavorites } from '../cart/CartContext';
import { ProductGrid } from '../components/ProductCard';
import type { StoreProduct } from '../api/client';
import { useStoreCategories } from '../hooks/useStoreCategories';

export function AccountPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; orderNumber: string; status: string; totalAmount: number }>>([]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user) return;
    api<{ name: string; customer?: { city?: string; area?: string; address?: string } }>('/store/me')
      .then((me) => {
        setName(me.name);
        setCity(me.customer?.city || '');
        setArea(me.customer?.area || '');
        setAddress(me.customer?.address || '');
      })
      .catch(() => undefined);
    api<typeof orders>('/store/me/orders').then(setOrders).catch(() => undefined);
  }, [user]);

  if (loading) return <div className="container section">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;

  async function save(e: FormEvent) {
    e.preventDefault();
    await api('/store/me', {
      method: 'PATCH',
      body: JSON.stringify({ name, city, area, address }),
    });
    setMsg('تم حفظ الملف الشخصي');
  }

  return (
    <section className="container section" style={{ display: 'grid', gap: 18 }}>
      <div className="section-head"><h2>حسابي</h2></div>
      <form className="panel form-grid two" onSubmit={save}>
        <label>الاسم<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>الهاتف<input value={user.phone || ''} disabled /></label>
        <label>المدينة<input value={city} onChange={(e) => setCity(e.target.value)} /></label>
        <label>المنطقة<input value={area} onChange={(e) => setArea(e.target.value)} /></label>
        <label style={{ gridColumn: '1 / -1' }}>العنوان<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        {msg ? <div className="success">{msg}</div> : null}
        <button className="btn" type="submit">حفظ</button>
      </form>

      <div className="panel table-wrap">
        <h3>طلباتي</h3>
        <table>
          <thead>
            <tr><th>الرقم</th><th>الحالة</th><th>المبلغ</th><th></th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{statusLabel[o.status] || o.status}</td>
                <td>{money(o.totalAmount)}</td>
                <td><Link to={`/account/orders/${o.id}`}>التفاصيل</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length ? <div className="empty">لا توجد طلبات بعد</div> : null}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn ghost" to="/wishlist">المفضلة</Link>
        <Link className="btn ghost" to="/track">تتبع طلب</Link>
      </div>
    </section>
  );
}

export function AccountOrderPage() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    if (!id || !user) return;
    api(`/store/me/orders/${id}`).then(setOrder).catch(() => undefined);
  }, [id, user]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!order) return <div className="container section">جارٍ التحميل...</div>;

  return (
    <section className="container section">
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <h2>{order.orderNumber}</h2>
        <div>الحالة: {statusLabel[order.status] || order.status}</div>
        <div>الإجمالي: {money(order.totalAmount)}</div>
        <Link className="btn" to={`/track?order=${order.orderNumber}&phone=${user.phone || ''}`}>تتبع الطلب</Link>
      </div>
    </section>
  );
}

export function OrderSuccessPage() {
  const { orderNumber } = useParams();
  const location = useLocation();
  const state = (location.state || {}) as {
    totalAmount?: number;
    subtotal?: number;
    deliveryFee?: number;
    discountAmount?: number;
    status?: string;
  };

  return (
    <section className="container section">
      <div className="panel" style={{ textAlign: 'center', display: 'grid', gap: 12 }}>
        <h2>تم تأكيد طلبكِ</h2>
        <p>رقم الطلب</p>
        <strong style={{ fontSize: 28 }}>{orderNumber}</strong>
        {state.status ? (
          <div className="muted">الحالة: {statusLabel[state.status] || state.status}</div>
        ) : null}
        {state.totalAmount != null ? (
          <div className="order-success-totals">
            {state.subtotal != null ? <div>المجموع: {money(state.subtotal)}</div> : null}
            {state.discountAmount ? <div>الخصم: −{money(state.discountAmount)}</div> : null}
            {state.deliveryFee != null ? <div>التوصيل: {money(state.deliveryFee)}</div> : null}
            <strong>الإجمالي: {money(state.totalAmount)}</strong>
          </div>
        ) : null}
        <p className="muted">سنتواصل معكِ قريباً لتأكيد التوصيل.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" to={`/track?order=${orderNumber}`}>
            تتبع الطلب
          </Link>
          <Link className="btn secondary" to="/products">
            متابعة التسوق
          </Link>
        </div>
      </div>
    </section>
  );
}

export function TrackPage() {
  const [orderNumber, setOrderNumber] = useState(new URLSearchParams(location.search).get('order') || '');
  const [phone, setPhone] = useState(new URLSearchParams(location.search).get('phone') || '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api('/store/orders/track', {
        method: 'POST',
        body: JSON.stringify({ orderNumber, phone }),
      });
      setData(res);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'تعذر التتبع');
    }
  }

  return (
    <section className="container section" style={{ maxWidth: 640 }}>
      <form className="panel form-grid" onSubmit={onSubmit}>
        <h2 style={{ margin: 0 }}>تتبع الطلب</h2>
        <label>رقم الطلب<input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required /></label>
        <label>الهاتف<input value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn" type="submit">تتبع</button>
      </form>
      {data ? (
        <div className="panel" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <strong>{data.orderNumber}</strong>
          <div>الحالة: {statusLabel[data.status] || data.status}</div>
          <div>الإجمالي: {money(data.totalAmount)}</div>
          <div className="timeline">
            {(data.timeline || []).map((t: any) => (
              <div key={t.status} className={`timeline-item ${t.current ? 'current' : t.reached ? 'done' : ''}`}>
                {statusLabel[t.status] || t.status}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function WishlistPage() {
  const fav = useFavorites();
  const [products, setProducts] = useState<StoreProduct[]>([]);

  useEffect(() => {
    api<StoreProduct[]>('/store/products').then((all) => {
      setProducts(all.filter((p) => fav.ids.includes(p.id)));
    }).catch(() => undefined);
  }, [fav.ids.join(',')]);

  return (
    <section className="container section">
      <div className="section-head"><h2>المفضلة</h2></div>
      {products.length ? (
        <ProductGrid products={products} />
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined empty-icon" aria-hidden>
            favorite
          </span>
          <h3 className="headline-md">قائمة المفضلة فارغة</h3>
          <Link className="btn" to="/products">
            ابدئي التسوق
          </Link>
        </div>
      )}
    </section>
  );
}

const RECENT_KEY = 'store_recent_searches';

export function SearchPage() {
  const navigate = useNavigate();
  const categories = useStoreCategories();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  });

  function persist(next: string[]) {
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  function go(term: string) {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recent.filter((x) => x !== t)].slice(0, 8);
    persist(next);
    navigate(`/search?q=${encodeURIComponent(t)}`);
  }

  return (
    <section className="container section search-page">
      <form
        className="search-field"
        style={{ maxWidth: '100%', marginBottom: 28 }}
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <span className="material-symbols-outlined search-icon">search</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحثي عن منتج"
        />
      </form>

      <div className="section-head" style={{ marginBottom: 8 }}>
        <h3 className="label-md" style={{ margin: 0, color: 'var(--on-surface)' }}>
          عمليات البحث الأخيرة
        </h3>
        {recent.length ? (
          <button
            type="button"
            className="label-sm"
            style={{ border: 0, background: 'transparent', color: 'var(--rose-gold)', cursor: 'pointer' }}
            onClick={() => persist([])}
          >
            مسح الكل
          </button>
        ) : null}
      </div>
      <div className="recent-list">
        {recent.length ? (
          recent.map((term) => (
            <div key={term} className="recent-item">
              <button
                type="button"
                className="left"
                style={{ border: 0, background: 'transparent', cursor: 'pointer', flex: 1 }}
                onClick={() => go(term)}
              >
                <span className="material-symbols-outlined">history</span>
                <span>{term}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 32, height: 32 }}
                aria-label="حذف"
                onClick={() => persist(recent.filter((x) => x !== term))}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </div>
          ))
        ) : (
          <p className="muted label-md">لا توجد عمليات بحث سابقة</p>
        )}
      </div>

      <h3 className="label-md" style={{ margin: '8px 0 12px' }}>
        البحث الشائع
      </h3>
      <div className="tag-cloud">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => go(c.nameAr)}>
            {c.nameAr}
          </button>
        ))}
        <button type="button" onClick={() => go('عروض')}>
          عروض
        </button>
      </div>

      <h3 className="label-md" style={{ margin: '28px 0 12px' }}>
        اكتشفي المجموعات
      </h3>
      <div className="cat-grid">
        {categories.slice(0, 4).map((c) => (
          <Link
            key={c.id}
            to={`/category/${c.slug}`}
            className={c.imageUrl ? 'cat-tile' : 'cat-tile text-only'}
          >
            <div className="cat-tile-media">
              {c.imageUrl ? (
                <img src={c.imageUrl} alt={c.nameAr} loading="lazy" decoding="async" />
              ) : (
                <h3>{c.nameAr}</h3>
              )}
            </div>
            {c.imageUrl ? <h3>{c.nameAr}</h3> : null}
          </Link>
        ))}
        <Link to="/new" className="cat-tile text-only">
          <div className="cat-tile-media">
            <h3>وصلنا حديثاً</h3>
          </div>
        </Link>
        <Link to="/offers" className="cat-tile offer-tile">
          <div className="cat-tile-media">
            <h3>العروض</h3>
          </div>
        </Link>
      </div>
    </section>
  );
}

export function ContentPage({
  title,
  body,
}: {
  title: string;
  body: string[];
}) {
  return (
    <section className="container section">
      <div className="panel" style={{ display: 'grid', gap: 12, maxWidth: 800 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {body.map((p) => (
          <p key={p} style={{ lineHeight: 1.9, margin: 0 }}>{p}</p>
        ))}
      </div>
    </section>
  );
}
