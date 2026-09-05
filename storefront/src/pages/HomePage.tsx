import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid } from '../components/ProductCard';
import { HERO_SLIDES } from '../data/homeImages';
import { SITE_COPY } from '../data/siteContent';
import { useStoreCategories } from '../hooks/useStoreCategories';

type Banner = {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  placement?: 'HERO' | 'PROMO' | string;
  imageFit?: 'cover' | 'contain' | string;
  imageZoom?: number;
  imagePosX?: number;
  imagePosY?: number;
};

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

export function HomePage() {
  const [newItems, setNewItems] = useState<StoreProduct[]>([]);
  const [bestsellers, setBestsellers] = useState<StoreProduct[]>([]);
  const [offers, setOffers] = useState<StoreProduct[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const categories = useStoreCategories();

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const heroBanners = banners.filter((b) => b.placement === 'HERO' && b.imageUrl);
  const heroSlides =
    heroBanners.length > 0
      ? heroBanners.map((b) => ({
          id: b.id,
          src: b.imageUrl as string,
          alt: b.title,
          fit: (b.imageFit === 'contain' ? 'contain' : 'cover') as 'cover' | 'contain',
          zoom: b.imageZoom ?? 100,
          x: b.imagePosX ?? 50,
          y: b.imagePosY ?? 50,
          href: b.linkUrl || '/products',
        }))
      : HERO_SLIDES.map((src) => ({
          id: src,
          src,
          alt: '',
          fit: 'cover' as const,
          zoom: 100,
          x: 50,
          y: 50,
          href: '/products',
        }));

  useEffect(() => {
    api<StoreProduct[]>('/store/products?collection=new').then(setNewItems).catch(() => undefined);
    api<StoreProduct[]>('/store/products?collection=bestseller')
      .then(setBestsellers)
      .catch(() => undefined);
    api<StoreProduct[]>('/store/products?collection=offers').then(setOffers).catch(() => undefined);
    api<Banner[]>('/store/banners').then(setBanners).catch(() => undefined);
  }, []);

  useEffect(() => {
    setHeroIndex(0);
  }, [heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length < 2) return;
    const timer = window.setInterval(() => {
      setHeroIndex((i) => (i + 1) % heroSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  return (
    <div className="shop-home">
      {/* Compact promo banner only — no intro/about homepage */}
      <section className="shop-hero" aria-label="عرض ترويجي">
        <div className="shop-hero-media">
          {heroSlides.map((slide, i) => (
            <Link
              key={slide.id}
              to={slide.href}
              className={`shop-hero-slide${i === heroIndex ? ' is-active' : ''}`}
              tabIndex={i === heroIndex ? 0 : -1}
              aria-hidden={i !== heroIndex}
            >
              <img
                src={slide.src}
                alt={slide.alt || 'دار الأنوثة'}
                decoding="async"
                loading={i === 0 ? 'eager' : 'lazy'}
                style={{
                  objectFit: slide.fit,
                  objectPosition: `${slide.x}% ${slide.y}%`,
                  transform: `scale(${slide.zoom / 100})`,
                  transformOrigin: `${slide.x}% ${slide.y}%`,
                }}
              />
            </Link>
          ))}
        </div>
        {heroSlides.length > 1 ? (
          <div className="shop-hero-dots" aria-hidden>
            {heroSlides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                className={i === heroIndex ? 'is-active' : ''}
                onClick={() => setHeroIndex(i)}
                aria-label={`شريحة ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* Categories first — Play Baby style */}
      <section className="container shop-section">
        <div className="shop-section-head">
          <p className="shop-kicker">تسوقي حسب التصنيف</p>
          <h2>التصنيفات</h2>
        </div>
        <div className="category-mosaic">
          {parentCategories.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="category-tile">
              <span className="category-tile-media">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="material-symbols-outlined">
                    {CATEGORY_ICONS[c.slug] || 'category'}
                  </span>
                )}
              </span>
              <span className="category-tile-label">{c.nameAr}</span>
            </Link>
          ))}
          <Link to="/offers" className="category-tile offer">
            <span className="category-tile-media">
              <span className="material-symbols-outlined">sell</span>
            </span>
            <span className="category-tile-label">العروض</span>
          </Link>
          <Link to="/new" className="category-tile">
            <span className="category-tile-media">
              <span className="material-symbols-outlined">new_releases</span>
            </span>
            <span className="category-tile-label">وصل حديثاً</span>
          </Link>
          <Link to="/bestseller" className="category-tile">
            <span className="category-tile-media">
              <span className="material-symbols-outlined">trending_up</span>
            </span>
            <span className="category-tile-label">الأكثر مبيعاً</span>
          </Link>
        </div>
      </section>

      <section className="container shop-section">
        <div className="shop-section-head">
          <p className="shop-kicker">شاهدي مجموعتنا الجديدة</p>
          <h2>{SITE_COPY.newArrivals}</h2>
          <Link to="/new" className="shop-section-link">
            عرض الكل
          </Link>
        </div>
        {newItems.length ? (
          <ProductGrid products={newItems.slice(0, 8)} />
        ) : (
          <div className="shop-empty">
            <p>{SITE_COPY.newArrivalsEmpty}</p>
            <Link className="btn soft" to="/products">
              تصفّحي المتجر
            </Link>
          </div>
        )}
      </section>

      {bestsellers.length ? (
        <section className="container shop-section">
          <div className="shop-section-head">
            <p className="shop-kicker">شاهدي مجموعتنا</p>
            <h2>الأكثر مبيعاً</h2>
            <Link to="/bestseller" className="shop-section-link">
              عرض الكل
            </Link>
          </div>
          <ProductGrid products={bestsellers.slice(0, 8)} />
        </section>
      ) : null}

      {offers.length ? (
        <section className="container shop-section">
          <div className="shop-section-head">
            <p className="shop-kicker">خصومات دار الأنوثة</p>
            <h2>العروض</h2>
            <Link to="/offers" className="shop-section-link">
              كل العروض
            </Link>
          </div>
          <ProductGrid products={offers.slice(0, 8)} />
        </section>
      ) : null}
    </div>
  );
}
