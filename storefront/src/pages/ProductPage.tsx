import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, type StoreProduct } from '../api/client';
import { useCart, useFavorites } from '../cart/CartContext';
import { ProductGrid } from '../components/ProductCard';
import { storeColorHex } from '../lib/colors';

const FALLBACK_IMG = '/home/product-kaftan.jpg';
const MAX_QTY = 10;

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const fav = useFavorites();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [imageIdx, setImageIdx] = useState(0);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id) return;
    setAdded(false);
    setError('');
    api<StoreProduct>(`/store/products/${id}`)
      .then((p) => {
        setProduct(p);
        setVariantId(p.variants.find((v) => v.inStock)?.id || p.variants[0]?.id || '');
        setImageIdx(0);
        setQty(1);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const variant = useMemo(
    () => product?.variants.find((v) => v.id === variantId),
    [product, variantId],
  );

  const galleryImages = useMemo(() => {
    if (!product) return [{ url: FALLBACK_IMG, alt: '', isPrimary: true as const }];
    const all = product.images || [];
    const color = variant?.color || null;
    const colorImgs = color ? all.filter((i) => i.color === color) : [];
    if (colorImgs.length) return colorImgs;
    if (variant?.imageUrl) {
      return [{ url: variant.imageUrl, alt: color, isPrimary: true, color }];
    }
    const generic = all.filter((i) => !i.color);
    if (generic.length) return generic;
    if (all.length) return all;
    return [{ url: FALLBACK_IMG, alt: product.nameAr, isPrimary: true }];
  }, [product, variant]);

  useEffect(() => {
    setImageIdx(0);
  }, [variant?.id, variant?.color]);

  const images = galleryImages.length
    ? galleryImages
    : [{ url: FALLBACK_IMG, alt: product?.nameAr, isPrimary: true }];

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
    const ok = add({
      variantId: variant.id,
      productId: product.id,
      nameAr: product.nameAr,
      image: images[imageIdx]?.url || images[0]?.url,
      color: variant.color,
      size: variant.size,
      quantity: qty,
      unitPrice: variant.retailPrice,
      available: variant.available,
      inStock: true,
    });
    if (!ok) {
      setError('غير متوفر حالياً');
      return false;
    }
    setError('');
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
    return true;
  }

  if (error && !product) return <div className="container section error">{error}</div>;
  if (!product) return <div className="container section">جارٍ التحميل...</div>;

  const unavailable = !variant?.inStock;
  const maxQty = Math.max(1, Math.min(MAX_QTY, variant?.available || MAX_QTY));

  return (
    <section className="container section">
      <div className="product-layout">
        <div className="gallery">
          <div className={`gallery-main${unavailable ? ' is-unavailable' : ''}`}>
            <img
              src={images[imageIdx]?.url || FALLBACK_IMG}
              alt={product.nameAr}
              width={1200}
              height={1500}
              decoding="async"
            />
            {unavailable ? (
              <div className="unavailable-mark" aria-label="غير متوفر">
                <span>غير متوفر</span>
              </div>
            ) : null}
          </div>
          {images.length > 1 ? (
            <div className="gallery-thumbs">
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
        <div className="panel stack" style={{ display: 'grid', gap: 14 }}>
          <div className="brand-en">Dar Al Onoutha</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 40 }}>{product.nameAr}</h1>
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
          <p style={{ lineHeight: 1.8 }}>{product.description || 'تفاصيل المنتج متوفرة عند الطلب.'}</p>

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
                      className={`chip ${variant?.color === c ? 'active' : ''}${!ok ? ' unavailable' : ''}`}
                      onClick={() => {
                        const match =
                          product.variants.find(
                            (v) =>
                              v.color === c &&
                              v.inStock &&
                              (!variant?.size || v.size === variant.size),
                          ) ||
                          product.variants.find((v) => v.color === c && v.inStock) ||
                          product.variants.find((v) => v.color === c);
                        if (match) {
                          setVariantId(match.id);
                          setQty(1);
                          setError('');
                          setAdded(false);
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
                      className={`chip ${variant?.size === s ? 'active' : ''}${!ok ? ' unavailable' : ''}`}
                      onClick={() => {
                        const match =
                          product.variants.find(
                            (v) =>
                              v.size === s &&
                              v.inStock &&
                              (!variant?.color || v.color === variant.color),
                          ) ||
                          product.variants.find(
                            (v) => v.size === s && (!variant?.color || v.color === variant.color),
                          ) ||
                          product.variants.find((v) => v.size === s);
                        if (match) {
                          setVariantId(match.id);
                          setQty(1);
                          setError('');
                          setAdded(false);
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
              <span>لا يمكن الشراء أو الإضافة إلى السلة حتى يتوفر المخزون</span>
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
          {added ? <div className="success">تمت الإضافة إلى السلة</div> : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {unavailable ? null : (
              <>
                <button className="btn" type="button" onClick={addToCart}>
                  إضافة إلى السلة
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    if (addToCart()) navigate('/checkout');
                  }}
                >
                  شراء الآن
                </button>
              </>
            )}
            <button className="btn ghost" type="button" onClick={() => fav.toggle(product.id)}>
              {fav.has(product.id) ? 'في المفضلة' : 'المفضلة'}
            </button>
          </div>
        </div>
      </div>

      {product.related?.length ? (
        <div className="section" style={{ marginTop: 40 }}>
          <div className="section-head">
            <h2>منتجات مشابهة</h2>
          </div>
          <ProductGrid products={product.related} />
        </div>
      ) : null}
      {product.suggested?.length ? (
        <div className="section">
          <div className="section-head">
            <h2>قد تعجبكِ أيضاً</h2>
          </div>
          <ProductGrid products={product.suggested} />
        </div>
      ) : null}
      <Link to="/products">متابعة التسوق</Link>
    </section>
  );
}
