import { useState } from 'react';
import { Link } from 'react-router-dom';
import { money, type StoreProduct } from '../api/client';
import { useCart, useFavorites } from '../cart/CartContext';
import { useToast } from './Toast';
import { useLocale } from '../i18n/LocaleContext';

export type CatalogViewMode = 'grid' | 'list';

export function ProductCard({
  product,
  viewMode = 'grid',
}: {
  product: StoreProduct;
  viewMode?: CatalogViewMode;
}) {
  const fav = useFavorites();
  const { add } = useCart();
  const toast = useToast();
  const { t } = useLocale();
  const [added, setAdded] = useState(false);

  const img =
    product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url || '';

  const stockVariant = product.variants.find((v) => v.inStock) || product.variants[0];
  const soldOut = !product.inStock || !stockVariant?.inStock;
  const isList = viewMode === 'list';

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
    if (!ok) {
      toast.push(t('errorRetry'), 'err');
      return;
    }
    setAdded(true);
    toast.push(t('addedToCart'));
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className={`product-card pb-card${soldOut ? ' is-out' : ''}${isList ? ' is-list' : ''}`}>
      <div className="thumb">
        <Link to={`/product/${product.id}`} className="thumb-link" aria-label={product.nameAr}>
          {img ? (
            <img key={img} src={img} alt={product.nameAr} width={900} height={1200} loading="lazy" />
          ) : (
            <div className="thumb-ph" aria-hidden>
              <span className="material-symbols-outlined">checkroom</span>
            </div>
          )}
        </Link>
        {product.discountPercent > 0 ? (
          <span className="pb-sale-badge" aria-label={`${t('sale')} ${product.discountPercent}%`}>
            خصم!
          </span>
        ) : null}
        {soldOut ? (
          <div className="unavailable-mark" aria-label={t('outOfStock')}>
            <span>{t('outOfStock')}</span>
          </div>
        ) : null}
        <button
          className={`fav-btn${fav.has(product.id) ? ' on' : ''}`}
          type="button"
          aria-label={fav.has(product.id) ? t('removeFromWishlist') : t('addToWishlist')}
          onClick={() => fav.toggle(product.id)}
        >
          <span className={`material-symbols-outlined${fav.has(product.id) ? ' filled' : ''}`}>
            favorite
          </span>
        </button>
      </div>

      <div className="body pb-card-body">
        <Link to={`/product/${product.id}`} className="name">
          {product.nameAr}
          {product.sku ? ` - CODE : ${product.sku}` : ''}
        </Link>
        <div className="price-row pb-price-row">
          <span className="price">{money(product.retailPrice)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.retailPrice ? (
            <span className="compare">{money(product.compareAtPrice)}</span>
          ) : null}
        </div>
        {!soldOut && stockVariant?.inStock ? (
          <button className="card-add" type="button" onClick={quickAdd}>
            {added ? t('addedToCart') : t('addToCart')}
          </button>
        ) : (
          <button className="card-add soldout" type="button" disabled>
            {t('outOfStock')}
          </button>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  viewMode = 'grid',
}: {
  products: StoreProduct[];
  viewMode?: CatalogViewMode;
}) {
  if (!products.length) return <div className="empty">لا توجد منتجات حالياً</div>;
  return (
    <div className={viewMode === 'list' ? 'list-products' : 'grid-products pb-grid'}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} viewMode={viewMode} />
      ))}
    </div>
  );
}
