import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { money, type StoreProduct } from '../api/client';
import { useFavorites } from '../cart/CartContext';
import { storeColorHex } from '../lib/colors';
import { useToast } from './ui/Toast';

export function ProductCard({ product }: { product: StoreProduct }) {
  const fav = useFavorites();
  const toast = useToast();
  const [pressed, setPressed] = useState(false);

  const gallery = product.images || [];
  const primary =
    gallery.find((i) => i.isPrimary && !i.color)?.url ||
    gallery.find((i) => !i.color)?.url ||
    gallery.find((i) => i.isPrimary)?.url ||
    gallery[0]?.url ||
    '';
  const altImg =
    gallery.find((i) => i.url && i.url !== primary && !i.color)?.url ||
    gallery.find((i) => i.url && i.url !== primary)?.url ||
    '';
  const soldOut = !product.inStock;
  const isFav = fav.has(product.id);
  const code = product.sku || product.variants[0]?.sku || '';
  const title = code ? `${product.nameAr} - CODE : ${code}` : product.nameAr;
  const onSale = product.discountPercent > 0 && Boolean(product.compareAtPrice);
  const colors = [
    ...new Set(
      (product.variants || [])
        .map((v) => v.color)
        .filter((c): c is string => Boolean(c)),
    ),
  ].slice(0, 6);

  function toggleFav(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    fav.toggle(product.id);
    toast.push(isFav ? 'تمت إزالة المنتج من المفضلة' : 'تمت الإضافة إلى المفضلة');
  }

  return (
    <article
      className={`product-card pb-card${soldOut ? ' is-out' : ''}${pressed ? ' is-pressed' : ''}${altImg ? ' has-alt' : ''}`}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      <div className="thumb">
        <Link to={`/product/${product.id}`} className="thumb-link" aria-label={product.nameAr}>
          {primary ? (
            <>
              <img
                className="thumb-img primary"
                src={primary}
                alt={product.nameAr}
                width={520}
                height={990}
                loading="lazy"
                decoding="async"
              />
              {altImg ? (
                <img
                  className="thumb-img thumb-img-alt"
                  src={altImg}
                  alt=""
                  width={520}
                  height={990}
                  loading="lazy"
                  decoding="async"
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

        {onSale ? (
          <span className="badge-sale-circle" aria-label={`خصم ${product.discountPercent}%`}>
            خصم {product.discountPercent}%
          </span>
        ) : null}

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
      </div>

      <div className="body">
        <Link to={`/product/${product.id}`} className="name">
          {title}
        </Link>
        {colors.length ? (
          <div className="card-colors" aria-label="الألوان المتاحة">
            {colors.map((c) => (
              <span
                key={c}
                className="card-color-dot"
                title={c}
                style={{ background: storeColorHex(c) || '#888' }}
              />
            ))}
          </div>
        ) : null}
        <div className="price-row">
          {product.compareAtPrice ? (
            <span className="compare">{money(product.compareAtPrice)}</span>
          ) : null}
          <span className="price">
            {Number(product.retailPrice).toLocaleString('ar-LY')}
            <span className="cur"> د.ل</span>
          </span>
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
