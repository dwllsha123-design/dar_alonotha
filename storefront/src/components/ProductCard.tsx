import { useState } from 'react';
import { Link } from 'react-router-dom';
import { money, type StoreProduct } from '../api/client';
import { useCart, useFavorites } from '../cart/CartContext';
import { storeColorHex } from '../lib/colors';

const SIZE_LIMIT = 4;
const COLOR_LIMIT = 5;

export function ProductCard({ product }: { product: StoreProduct }) {
  const fav = useFavorites();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [previewColor, setPreviewColor] = useState<string | null>(null);

  const previewImg =
    (previewColor &&
      (product.images.find((i) => i.color === previewColor)?.url ||
        product.variants.find((v) => v.color === previewColor)?.imageUrl)) ||
    '';
  const img =
    previewImg ||
    product.images.find((i) => i.isPrimary)?.url ||
    product.images[0]?.url ||
    '';

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
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className={`product-card${soldOut ? ' is-out' : ''}`}>
      <div className="thumb">
        <Link to={`/product/${product.id}`} className="thumb-link" aria-label={product.nameAr}>
          {img ? (
            <img
              key={img}
              src={img}
              alt={product.nameAr}
              width={1200}
              height={1500}
              loading="lazy"
            />
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
          className={`fav-btn${fav.has(product.id) ? ' on' : ''}`}
          type="button"
          aria-label={fav.has(product.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
          onClick={() => fav.toggle(product.id)}
        >
          <span className={`material-symbols-outlined${fav.has(product.id) ? ' filled' : ''}`}>
            favorite
          </span>
        </button>
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

        {!soldOut && stockVariant?.inStock ? (
          <button className="card-add" type="button" onClick={quickAdd}>
            {added ? 'تمت الإضافة' : 'إضافة إلى السلة'}
          </button>
        ) : (
          <button className="card-add soldout" type="button" disabled>
            غير متوفر
          </button>
        )}
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
