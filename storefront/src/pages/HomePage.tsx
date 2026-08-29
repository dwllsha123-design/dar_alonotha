import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid } from '../components/ProductCard';
import { StoreLink } from '../components/StoreLink';
import { categoryImage } from '../data/catalog';
import { HERO_SLIDES, HOME_IMAGES } from '../data/homeImages';
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

export function HomePage() {
  const [newItems, setNewItems] = useState<StoreProduct[]>([]);
  const [bestsellers, setBestsellers] = useState<StoreProduct[]>([]);
  const [offers, setOffers] = useState<StoreProduct[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const categories = useStoreCategories();

  const heroBanners = banners.filter((b) => b.placement === 'HERO' && b.imageUrl);
  const promoBanners = banners.filter((b) => b.placement !== 'HERO');
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
        }))
      : HERO_SLIDES.map((src) => ({
          id: src,
          src,
          alt: '',
          fit: 'cover' as const,
          zoom: 100,
          x: 50,
          y: 50,
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

  const featured = categories.slice(0, 4);

  return (
    <>
      <section className="hero-ly">
        <div className="hero-ly-media">
          {heroSlides.map((slide, i) => (
            <img
              key={slide.id}
              className={`hero-ly-slide${i === heroIndex ? ' is-active' : ''}`}
              src={slide.src}
              alt={slide.alt}
              decoding="async"
              loading={i === 0 ? 'eager' : 'lazy'}
              style={{
                objectFit: slide.fit,
                objectPosition: `${slide.x}% ${slide.y}%`,
                transform: `scale(${slide.zoom / 100})`,
                transformOrigin: `${slide.x}% ${slide.y}%`,
              }}
            />
          ))}
          <div className="hero-ly-overlay" />
          <div className="hero-dots" aria-hidden>
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
        </div>
        <div className="hero-ly-cta">
          <Link className="btn hero-ly-btn" to="/products">
            {SITE_COPY.heroCta}
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_back
            </span>
          </Link>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <div>
            <h2 className="headline-lg">{SITE_COPY.newArrivals}</h2>
          </div>
          <Link className="label-md" to="/new" style={{ color: 'var(--primary)' }}>
            عرض المزيد
          </Link>
        </div>
        {newItems.length ? (
          <ProductGrid products={newItems.slice(0, 4)} />
        ) : (
          <div className="coming-soon-banner panel">
            <img src={HOME_IMAGES.comingSoon} alt="" loading="lazy" decoding="async" />
            <div>
              <span className="chip-new">{SITE_COPY.comingSoon}</span>
              <p className="body-lg" style={{ margin: '8px 0 0' }}>
                {SITE_COPY.newArrivalsEmpty}
              </p>
              <Link className="btn secondary" to="/products" style={{ marginTop: 16 }}>
                تصفّحي المتجر
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="story-lux">
        <div className="container story-lux-grid">
          <div className="story-lux-photo">
            <img src={HOME_IMAGES.comingSoon} alt="أزياء دار الأنوثة" />
          </div>
          <div className="story-lux-copy">
            <span className="kicker">{SITE_COPY.storyKicker}</span>
            <h2 className="headline-lg">{SITE_COPY.storyTitle}</h2>
            <p className="body-lg">{SITE_COPY.storyBody}</p>
            <Link className="btn secondary" to="/about">
              {SITE_COPY.storyCta}
            </Link>
          </div>
        </div>
      </section>

      {promoBanners.length ? (
        <section className="container section">
          <div className="banner-row">
            {promoBanners.map((b) => (
              <StoreLink key={b.id} className="banner-card" to={b.linkUrl || '/offers'}>
                {b.imageUrl ? (
                  <img
                    src={b.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{
                      objectFit: b.imageFit === 'contain' ? 'contain' : 'cover',
                      objectPosition: `${b.imagePosX ?? 50}% ${b.imagePosY ?? 50}%`,
                    }}
                  />
                ) : (
                  <div className="banner-fallback" />
                )}
                <div className="label">
                  <h3 className="headline-md" style={{ margin: 0 }}>
                    {b.title}
                  </h3>
                  {b.subtitle ? <p className="body-md">{b.subtitle}</p> : null}
                </div>
              </StoreLink>
            ))}
          </div>
        </section>
      ) : null}

      {featured.length ? (
        <section className="container section">
          <h2 className="headline-lg section-title">تسوقي حسب الفئة</h2>
          <div className="bento">
            {featured.map((c, idx) => (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                className={idx === 0 ? 'bento-card span-2' : 'bento-card'}
              >
                <img src={categoryImage(c.slug)} alt={c.nameAr} loading="lazy" decoding="async" />
                <div className="label">
                  <h3 className="headline-md" style={{ margin: 0 }}>
                    {c.nameAr}
                  </h3>
                </div>
              </Link>
            ))}
            <Link to="/offers" className="bento-card offer">
              <div className="label">
                <span className="material-symbols-outlined" style={{ fontSize: 36, marginBottom: 8 }}>
                  local_offer
                </span>
                <h3 className="headline-md" style={{ margin: 0 }}>
                  عروض
                </h3>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {offers.length ? (
        <section className="container section">
          <div className="section-head">
            <div>
              <h2 className="headline-lg">العروض الحالية</h2>
            </div>
            <Link className="label-md" to="/offers" style={{ color: 'var(--primary)' }}>
              كل العروض
            </Link>
          </div>
          <ProductGrid products={offers.slice(0, 4)} />
        </section>
      ) : null}

      {bestsellers.length ? (
        <section className="container section">
          <div className="section-head">
            <div>
              <h2 className="headline-lg">الأكثر مبيعاً</h2>
            </div>
            <Link className="label-md" to="/bestseller" style={{ color: 'var(--primary)' }}>
              عرض الكل
            </Link>
          </div>
          <ProductGrid products={bestsellers.slice(0, 4)} />
        </section>
      ) : null}
    </>
  );
}
