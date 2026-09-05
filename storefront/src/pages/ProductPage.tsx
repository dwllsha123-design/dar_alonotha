import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, type StoreProduct } from '../api/client';
import { useCart, useFavorites } from '../cart/CartContext';
import { ProductGrid } from '../components/ProductCard';
import { useToast } from '../components/ui/Toast';
import { SITE_COPY } from '../data/siteContent';
import { storeColorHex } from '../lib/colors';
import { usePageMeta, useProductJsonLd } from '../hooks/usePageMeta';

const MAX_QTY = 10;
const RECENT_KEY = 'dar_store_recent';

function pushRecent(product: StoreProduct) {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
    const next = [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function readRecentIds(exclude?: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
    return prev.filter((id) => id !== exclude).slice(0, 4);
  } catch {
    return [];
  }
}

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const fav = useFavorites();
  const toast = useToast();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [recent, setRecent] = useState<StoreProduct[]>([]);
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [imageIdx, setImageIdx] = useState(0);
  const [error, setError] = useState('');
  const [atcState, setAtcState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [openAcc, setOpenAcc] = useState<string | null>('details');

  usePageMeta(product?.nameAr, product?.description || undefined);
  useProductJsonLd(product);

  useEffect(() => {
    if (!id) return;
    setAtcState('idle');
    setError('');
    api<StoreProduct>(`/store/products/${id}`)
      .then((p) => {
        setProduct(p);
        setVariantId(p.variants.find((v) => v.inStock)?.id || p.variants[0]?.id || '');
        setImageIdx(0);
        setQty(1);
        pushRecent(p);
        const recentIds = readRecentIds(p.id);
        if (recentIds.length) {
          api<StoreProduct[]>('/store/products')
            .then((all) => setRecent(all.filter((x) => recentIds.includes(x.id)).slice(0, 4)))
            .catch(() => undefined);
        } else {
          setRecent([]);
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const variant = useMemo(
    () => product?.variants.find((v) => v.id === variantId),
    [product, variantId],
  );

  const galleryImages = useMemo(() => {
    if (!product) return [] as Array<{ url: string; alt?: string | null; isPrimary?: boolean; color?: string | null }>;
    const all = product.images || [];
    const color = variant?.color || null;
    const colorImgs = color ? all.filter((i) => i.color === color) : [];
    if (colorImgs.length) return colorImgs;
    if (variant?.imageUrl) {
      return [{ url: variant.imageUrl, alt: color, isPrimary: true, color }];
    }
    const generic = all.filter((i) => !i.color);
    if (generic.length) return generic;
    return all;
  }, [product, variant]);

  useEffect(() => {
    setImageIdx(0);
  }, [variant?.id, variant?.color]);

  const images = galleryImages;
  const mainImage = images[imageIdx]?.url || images[0]?.url || '';
  const colors = [...new Set((product?.variants || []).map((v) => v.color).filter(Boolean))];
  const sizes = [...new Set((product?.variants || []).map((v) => v.size).filter(Boolean))];

  function colorAvailable(color: string | null | undefined) {
    if (!product) return false;
    return product.variants.some((v) => v.color === color && v.inStock);
  }

  function sizeAvailable(size: string | null | undefined) {
    if (!product) return false;
    return product.variants.some(
      (v) => v.size === size && (!variant?.color || v.color === variant.color) && v.inStock,
    );
  }

  function addToCart() {
    if (!product || !variant || !variant.inStock) {
      setError('غير متوفر حالياً');
      return false;
    }
    setAtcState('loading');
    const ok = add({
      variantId: variant.id,
      productId: product.id,
      nameAr: product.nameAr,
      image: mainImage || undefined,
      color: variant.color,
      size: variant.size,
      quantity: qty,
      unitPrice: variant.retailPrice,
      available: variant.available,
      inStock: true,
    });
    if (!ok) {
      setError('غير متوفر حالياً');
      setAtcState('idle');
      return false;
    }
    setError('');
    setAtcState('success');
    toast.push('تمت إضافة المنتج إلى السلة');
    window.setTimeout(() => setAtcState('idle'), 1100);
    return true;
  }

  if (error && !product) return <div className="container section error">{error}</div>;
  if (!product) return <div className="container section muted">جارٍ التحميل...</div>;

  const unavailable = !variant?.inStock;
  const maxQty = Math.max(1, Math.min(MAX_QTY, variant?.available || MAX_QTY));
  const isFav = fav.has(product.id);

  const actions = (
    <div className="pdp-actions">
      {unavailable ? null : (
        <>
          <button
            className={`btn${atcState === 'loading' ? ' is-loading' : ''}${atcState === 'success' ? ' is-success' : ''}`}
            type="button"
            onClick={() => addToCart()}
            disabled={atcState === 'loading'}
          >
            {atcState === 'loading' ? 'جارٍ الإضافة...' : atcState === 'success' ? 'تمت الإضافة ✓' : 'أضيفي إلى السلة'}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              if (addToCart()) navigate('/checkout');
            }}
          >
            اشتري الآن
          </button>
        </>
      )}
      <button
        className={`btn ghost fav-anim${isFav ? ' on' : ''}`}
        type="button"
        onClick={() => {
          fav.toggle(product.id);
          toast.push(isFav ? 'تمت إزالة المنتج من المفضلة' : 'تمت الإضافة إلى المفضلة');
        }}
      >
        <span className={`material-symbols-outlined${isFav ? ' filled' : ''}`}>favorite</span>
        {isFav ? 'في المفضلة' : 'المفضلة'}
      </button>
    </div>
  );

  return (
    <section className="container section pdp">
      <div className="product-layout">
        <div className="gallery">
          <div className={`gallery-main${unavailable ? ' is-unavailable' : ''}`}>
            {mainImage ? (
              <img
                key={mainImage}
                className="gallery-main-img"
                src={mainImage}
                alt={product.nameAr}
                width={1200}
                height={1500}
                decoding="async"
              />
            ) : (
              <div className="thumb-ph" aria-hidden style={{ width: '100%', minHeight: 360 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48 }}>
                  checkroom
                </span>
              </div>
            )}
            {unavailable ? (
              <div className="unavailable-mark" aria-label="غير متوفر">
                <span>غير متوفر</span>
              </div>
            ) : null}
          </div>
          {images.length > 1 ? (
            <div className="gallery-thumbs gallery-thumbs-scroll">
              {images.map((img, idx) => (
                <button
                  key={`${img.url}-${idx}`}
                  type="button"
                  className={idx === imageIdx ? 'active' : ''}
                  onClick={() => setImageIdx(idx)}
                  aria-label={`صورة ${idx + 1}`}
                >
                  <img src={img.url} alt="" width={1200} height={1500} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pdp-info panel stack">
          <div className="brand-en">Dar Al Onoutha</div>
          <h1 className="pdp-title">{product.nameAr}</h1>
          <div className="price-row">
            <span className="price" style={{ fontSize: 24 }}>
              {money(variant?.retailPrice ?? product.retailPrice)}
            </span>
            {product.compareAtPrice ? <span className="compare">{money(product.compareAtPrice)}</span> : null}
            {product.discountPercent > 0 ? (
              <span className="badge-sale" style={{ position: 'static' }}>
                خصم {product.discountPercent}%
              </span>
            ) : null}
          </div>
          {product.sku ? <div className="muted">SKU: {product.sku}</div> : null}
          <p className="pdp-desc">{product.description || 'تفاصيل المنتج متوفرة عند الطلب.'}</p>

          {colors.length ? (
            <div>
              <div className="muted" style={{ marginBottom: 8 }}>
                اللون
              </div>
              <div className="swatches">
                {colors.map((c) => {
                  const ok = colorAvailable(c);
                  return (
                    <button
                      key={String(c)}
                      type="button"
                      disabled={!ok}
                      className={`chip ${variant?.color === c ? 'active' : ''}${!ok ? ' unavailable' : ''}`}
                      onClick={() => {
                        const match =
                          product.variants.find(
                            (v) => v.color === c && v.inStock && (!variant?.size || v.size === variant.size),
                          ) ||
                          product.variants.find((v) => v.color === c && v.inStock) ||
                          product.variants.find((v) => v.color === c);
                        if (match) {
                          setVariantId(match.id);
                          setQty(1);
                          setError('');
                          setAtcState('idle');
                        }
                      }}
                    >
                      {storeColorHex(String(c)) ? (
                        <span className="chip-dot" style={{ background: storeColorHex(String(c)) }} />
                      ) : null}
                      {c}
                      {!ok ? <span className="chip-out">غير متوفر</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {sizes.length ? (
            <div>
              <div className="muted" style={{ marginBottom: 8 }}>
                المقاس
              </div>
              <div className="sizes">
                {sizes.map((s) => {
                  const ok = sizeAvailable(s);
                  return (
                    <button
                      key={String(s)}
                      type="button"
                      disabled={!ok}
                      className={`chip ${variant?.size === s ? 'active' : ''}${!ok ? ' unavailable' : ''}`}
                      onClick={() => {
                        const match =
                          product.variants.find(
                            (v) => v.size === s && v.inStock && (!variant?.color || v.color === variant.color),
                          ) ||
                          product.variants.find(
                            (v) => v.size === s && (!variant?.color || v.color === variant.color),
                          ) ||
                          product.variants.find((v) => v.size === s);
                        if (match) {
                          setVariantId(match.id);
                          setQty(1);
                          setError('');
                          setAtcState('idle');
                        }
                      }}
                    >
                      {s}
                      {!ok ? <span className="chip-out">غير متوفر</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {unavailable ? (
            <div className="stock-out-banner" role="status">
              غير متوفر
              <span>لا يمكن الشراء حتى يتوفر المخزون</span>
            </div>
          ) : (
            <div>
              <div className="muted" style={{ marginBottom: 8 }}>
                الكمية
              </div>
              <div className="qty">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                  -
                </button>
                <strong>{qty}</strong>
                <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
                  +
                </button>
              </div>
            </div>
          )}

          {error ? <div className="error">{error}</div> : null}
          <div className="pdp-actions-desktop">{actions}</div>
        </div>
      </div>

      <div className="pdp-accordion">
        {[
          { id: 'details', title: 'التفاصيل', body: product.description || 'تفاصيل المنتج متوفرة عند الطلب.' },
          { id: 'shipping', title: 'الشحن', body: SITE_COPY.shipping.join(' ') },
          { id: 'returns', title: 'الاستبدال', body: SITE_COPY.returns.join(' ') },
        ].map((item) => (
          <div key={item.id} className={`acc-item${openAcc === item.id ? ' open' : ''}`}>
            <button
              type="button"
              className="acc-trigger"
              onClick={() => setOpenAcc((cur) => (cur === item.id ? null : item.id))}
              aria-expanded={openAcc === item.id}
            >
              {item.title}
              <span className="material-symbols-outlined">{openAcc === item.id ? 'expand_less' : 'expand_more'}</span>
            </button>
            {openAcc === item.id ? <div className="acc-panel">{item.body}</div> : null}
          </div>
        ))}
      </div>

      {product.suggested?.length || product.related?.length ? (
        <div className="section" style={{ marginTop: 40 }}>
          <div className="section-head">
            <h2 className="headline-lg">قد يعجبكِ أيضًا</h2>
          </div>
          <ProductGrid products={(product.suggested?.length ? product.suggested : product.related) || []} />
        </div>
      ) : null}

      {recent.length ? (
        <div className="section">
          <div className="section-head">
            <h2 className="headline-lg">شاهدتِ مؤخرًا</h2>
          </div>
          <ProductGrid products={recent} />
        </div>
      ) : null}

      <Link className="section-link" to="/products">
        متابعة التسوق
      </Link>

      {!unavailable ? <div className="pdp-sticky-cta">{actions}</div> : null}
    </section>
  );
}
