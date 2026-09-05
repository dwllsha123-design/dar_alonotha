import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard';
import { StoreLink } from '../components/StoreLink';
import { TrustBar } from '../components/TrustBar';
import { Reveal } from '../components/ui/Reveal';
import { HERO_SLIDES, HOME_IMAGES } from '../data/homeImages';
import { SITE_COPY } from '../data/siteContent';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { usePageMeta } from '../hooks/usePageMeta';

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
  usePageMeta();
  const [newItems, setNewItems] = useState<StoreProduct[]>([]);
  const [bestsellers, setBestsellers] = useState<StoreProduct[]>([]);
  const [offers, setOffers] = useState<StoreProduct[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
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
          title: b.title,
          subtitle: b.subtitle,
          link: b.linkUrl || '/new',
        }))
      : HERO_SLIDES.map((src) => ({
          id: src,
          src,
          alt: '',
          fit: 'cover' as const,
          zoom: 100,
          x: 50,
          y: 50,
          title: SITE_COPY.heroTitle,
          subtitle: null as string | null,
          link: '/new',
        }));

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<StoreProduct[]>('/store/products?collection=new').catch(() => [] as StoreProduct[]),
      api<StoreProduct[]>('/store/products?collection=bestseller').catch(() => [] as StoreProduct[]),
      api<StoreProduct[]>('/store/products?collection=offers').catch(() => [] as StoreProduct[]),
      api<Banner[]>('/store/banners').catch(() => [] as Banner[]),
    ]).then(([n, b, o, bannersList]) => {
      if (!alive) return;
      setNewItems(n);
      setBestsellers(b);
      setOffers(o);
      setBanners(bannersList);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
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

  const featured = categories.filter((c) => !c.parentId).slice(0, 6);
  const activeHero = heroSlides[heroIndex];

  return (
    <>
      <section className="hero-editorial">
        <div className="hero-editorial-media">
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
        </div>
        <div className="container hero-editorial-copy">
          <p className="hero-brand-label">{SITE_COPY.heroBrand}</p>
          <h1 className="headline-xl hero-title">{activeHero?.title || SITE_COPY.heroTitle}</h1>
          {activeHero?.subtitle ? <p className="body-lg hero-sub">{activeHero.subtitle}</p> : null}
          <div className="hero-cta-row">
            <Link className="btn" to={activeHero?.link || '/new'}>
              {SITE_COPY.heroCta}
            </Link>
            <Link className="btn secondary" to="/products">
              {SITE_COPY.heroCtaSecondary}
            </Link>
          </div>
          {heroSlides.length > 1 ? (
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
          ) : null}
        </div>
      </section>

      {featured.length ? (
        <Reveal className="container section">
          <h2 className="headline-lg section-title">{SITE_COPY.shopByCategory}</h2>
          <div className="cat-discover">
            {featured.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`} className="cat-discover-card">
                <div className="cat-discover-media">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.nameAr} loading="lazy" decoding="async" />
                  ) : (
                    <span className="cat-discover-fallback" aria-hidden>
                      <span className="material-symbols-outlined">checkroom</span>
                    </span>
                  )}
                </div>
                <h3>{c.nameAr}</h3>
              </Link>
            ))}
          </div>
        </Reveal>
      ) : null}

      <Reveal className="container section">
        <div className="section-head">
          <h2 className="headline-lg">{SITE_COPY.newArrivals}</h2>
          <Link className="section-link" to="/new">
            {SITE_COPY.viewAll}
          </Link>
        </div>
        {loading ? (
          <ProductGridSkeleton count={4} />
        ) : newItems.length ? (
          <ProductGrid products={newItems.slice(0, 8)} />
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
      </Reveal>

      <Reveal className="story-lux">
        <div className="container story-lux-grid">
          <div className="story-lux-photo">
            <img src={HOME_IMAGES.comingSoon} alt="أزياء دار الأنوثة" />
          </div>
          <div className="story-lux-copy">
            <span className="kicker">{SITE_COPY.storyKicker}</span>
            <h2 className="headline-lg">{SITE_COPY.storyTitle}</h2>
            <p className="body-lg">{SITE_COPY.storyBody}</p>
            <Link className="btn secondary" to="/products">
              {SITE_COPY.storyCta}
            </Link>
          </div>
        </div>
      </Reveal>

      {promoBanners.length ? (
        <Reveal className="container section">
          <div className="banner-row">
            {promoBanners.map((b) => (
              <StoreLink key={b.id} className="banner-card" to={b.linkUrl || '/offers'}>
                {b.imageUrl ? (
                  <img src={b.imageUrl} alt="" loading="lazy" decoding="async" />
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
        </Reveal>
      ) : null}

      {!loading && bestsellers.length ? (
        <Reveal className="container section">
          <div className="section-head">
            <h2 className="headline-lg">{SITE_COPY.bestsellers}</h2>
            <Link className="section-link" to="/bestseller">
              {SITE_COPY.viewAll}
            </Link>
          </div>
          <ProductGrid products={bestsellers.slice(0, 8)} />
        </Reveal>
      ) : null}

      {!loading && offers.length ? (
        <Reveal className="container section">
          <div className="section-head">
            <h2 className="headline-lg">{SITE_COPY.offers}</h2>
            <Link className="section-link" to="/offers">
              {SITE_COPY.viewAll}
            </Link>
          </div>
          <ProductGrid products={offers.slice(0, 8)} />
        </Reveal>
      ) : null}

      <TrustBar />
    </>
  );
}
