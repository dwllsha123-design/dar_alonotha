import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { money, type StoreProduct } from '../api/client';
import { useFavorites } from '../cart/CartContext';
import { useToast } from './ui/Toast';

export function ProductCard({ product }: { product: StoreProduct }) {
  const fav = useFavorites();
  const toast = useToast();
  const [pressed, setPressed] = useState(false);

  const img =
    product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url || '';
  const soldOut = !product.inStock;
  const isFav = fav.has(product.id);
  const code = product.sku || product.variants[0]?.sku || '';
  const title = code ? `${product.nameAr} - CODE : ${code}` : product.nameAr;
  const onSale = product.discountPercent > 0 && Boolean(product.compareAtPrice);

  function toggleFav(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    fav.toggle(product.id);
    toast.push(isFav ? 'تمت إزالة المنتج من المفضلة' : 'تمت الإضافة إلى المفضلة');
  }

  return (
    <article
      className={`product-card pb-card${soldOut ? ' is-out' : ''}${pressed ? ' is-pressed' : ''}`}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      <div className="thumb">
        <Link to={`/product/${product.id}`} className="thumb-link" aria-label={product.nameAr}>
          {img ? (
            <img
              className="thumb-img primary"
              src={img}
              alt={product.nameAr}
              width={800}
              height={1200}
              loading="lazy"
            />
          ) : (
            <div className="thumb-ph" aria-hidden>
              <span className="material-symbols-outlined">checkroom</span>
            </div>
          )}
        </Link>

        {onSale ? (
          <span className="badge-sale-circle" aria-label={`خصم ${product.discountPercent}%`}>
            خصم!
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

export function ProductGridSkeleton({ count = 5 }: { count?: number }) {
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
