import { useState } from 'react';
import { Link } from 'react-router-dom';
import { money, type StoreProduct } from '../api/client';
import { useCart, useFavorites } from '../cart/CartContext';
import { storeColorHex } from '../lib/colors';
import { useToast } from './ui/Toast';

const SIZE_LIMIT = 4;
const COLOR_LIMIT = 5;

export function ProductCard({ product }: { product: StoreProduct }) {
  const fav = useFavorites();
  const { add } = useCart();
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  const primaryImg =
    product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url || '';
  const secondaryImg =
    product.images.find((i) => i.url && i.url !== primaryImg)?.url ||
    product.variants.find((v) => v.imageUrl && v.imageUrl !== primaryImg)?.imageUrl ||
    '';

  const previewImg =
    (previewColor &&
      (product.images.find((i) => i.color === previewColor)?.url ||
        product.variants.find((v) => v.color === previewColor)?.imageUrl)) ||
    '';
  const img = previewImg || primaryImg;

  const isNew =
    Boolean(product.createdAt) &&
    Date.now() - new Date(product.createdAt as string).getTime() < 1000 * 60 * 60 * 24 * 30;

  const stockVariant =
    (previewColor
      ? product.variants.find((v) => v.color === previewColor && v.inStock) ||
        product.variants.find((v) => v.color === previewColor)
      : null) || product.variants.find((v) => v.inStock);
  const soldOut =
    !product.inStock ||
    (previewColor
      ? !product.variants.some((v) => v.color === previewColor && v.inStock)
      : !stockVariant?.inStock);
  const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[];
  const colors = [...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[];
  const isFav = fav.has(product.id);

  function quickAdd() {
    if (!stockVariant?.inStock) return;
    const ok = add({
      variantId: stockVariant.id,
      productId: product.id,
      nameAr: product.nameAr,
      image: img || undefined,
      color: stockVariant.color,
      size: stockVariant.size,
      quantity: 1,
      unitPrice: stockVariant.retailPrice || product.retailPrice,
      available: stockVariant.available,
      inStock: true,
    });
    if (!ok) return;
    setAdded(true);
    toast.push('تمت إضافة المنتج إلى السلة');
    window.setTimeout(() => setAdded(false), 1200);
  }

  function toggleFav() {
    fav.toggle(product.id);
    toast.push(isFav ? 'تمت إزالة المنتج من المفضلة' : 'تمت الإضافة إلى المفضلة');
  }

  return (
    <article
      className={`product-card${soldOut ? ' is-out' : ''}${pressed ? ' is-pressed' : ''}`}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      <div className="thumb">
        <Link to={`/product/${product.id}`} className="thumb-link" aria-label={product.nameAr}>
          {img ? (
            <>
              <img
                className="thumb-img primary"
                src={img}
                alt={product.nameAr}
                width={1200}
                height={1500}
                loading="lazy"
              />
              {!previewColor && secondaryImg ? (
                <img
                  className="thumb-img secondary"
                  src={secondaryImg}
                  alt=""
                  width={1200}
                  height={1500}
                  loading="lazy"
                  aria-hidden
                />
              ) : null}
            </>
          ) : (
            <div className="thumb-ph" aria-hidden>
              <span className="material-symbols-outlined">checkroom</span>
            </div>
          )}
        </Link>
        <div className="card-badges">
          {product.discountPercent > 0 ? (
            <span className="badge-sale">خصم {product.discountPercent}%</span>
          ) : null}
          {isNew && product.discountPercent <= 0 ? <span className="badge-new">جديد</span> : null}
        </div>
        {soldOut ? (
          <div className="unavailable-mark" aria-label="غير متوفر">
            <span>غير متوفر</span>
          </div>
        ) : null}
        <button
          className={`fav-btn${isFav ? ' on' : ''}`}
          type="button"
          aria-label={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
          onClick={toggleFav}
        >
          <span className={`material-symbols-outlined${isFav ? ' filled' : ''}`}>favorite</span>
        </button>
        <div className="card-hover-actions">
          {!soldOut && stockVariant?.inStock ? (
            <button className="card-add" type="button" onClick={quickAdd}>
              {added ? 'تمت الإضافة ✓' : 'أضيفي إلى السلة'}
            </button>
          ) : (
            <button className="card-add soldout" type="button" disabled>
              غير متوفر
            </button>
          )}
        </div>
      </div>

      <div className="body">
        <Link to={`/product/${product.id}`} className="name">
          {product.nameAr}
        </Link>

        {sizes.length ? (
          <div className="card-meta" aria-label="المقاسات">
            {sizes.slice(0, SIZE_LIMIT).map((s) => (
              <span key={s} className="card-chip">
                {s}
              </span>
            ))}
            {sizes.length > SIZE_LIMIT ? (
              <span className="card-chip more">+{sizes.length - SIZE_LIMIT}</span>
            ) : null}
          </div>
        ) : null}

        {colors.length ? (
          <div className="card-meta colors" aria-label="الألوان">
            {colors.slice(0, COLOR_LIMIT).map((c) => (
              <button
                key={c}
                type="button"
                className={`card-swatch${previewColor === c ? ' on' : ''}`}
                title={c}
                aria-label={c}
                style={{ background: storeColorHex(c) || '#ccc' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreviewColor(c);
                }}
              />
            ))}
            {colors.length > COLOR_LIMIT ? (
              <span className="card-chip more">+{colors.length - COLOR_LIMIT}</span>
            ) : null}
          </div>
        ) : null}

        <div className="price-row">
          <span className="price">
            {Number(product.retailPrice).toFixed(0)}
            <span className="cur">د.ل</span>
          </span>
          {product.compareAtPrice ? (
            <span className="compare">{money(product.compareAtPrice)}</span>
          ) : null}
        </div>

        <div className="card-mobile-add">
          {!soldOut && stockVariant?.inStock ? (
            <button className="card-add" type="button" onClick={quickAdd}>
              {added ? 'تمت الإضافة ✓' : 'أضيفي إلى السلة'}
            </button>
          ) : (
            <button className="card-add soldout" type="button" disabled>
              غير متوفر
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: StoreProduct[] }) {
  if (!products.length) return <div className="empty">لا توجد منتجات حالياً</div>;
  return (
    <div className="grid-products">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-products" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="product-skeleton">
          <div className="product-skeleton-thumb" />
          <div className="product-skeleton-line" />
          <div className="product-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
