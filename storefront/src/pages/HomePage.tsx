import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard';
import { CategoryStrip, SectionHeading } from '../components/CategoryStrip';
import { StoreLink } from '../components/StoreLink';
import { TrustBar } from '../components/TrustBar';
import { Reveal } from '../components/ui/Reveal';
import { SITE_COPY } from '../data/siteContent';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESC } from '../hooks/usePageMeta';

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
  usePageMeta({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    path: '/',
    noSuffix: true,
  });
  const [newItems, setNewItems] = useState<StoreProduct[]>([]);
  const [bestsellers, setBestsellers] = useState<StoreProduct[]>([]);
  const [offers, setOffers] = useState<StoreProduct[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const categories = useStoreCategories();

  const heroBanners = banners.filter((b) => b.placement === 'HERO' && b.imageUrl);
  const promoBanners = banners.filter((b) => b.placement !== 'HERO');
  const heroSlides = heroBanners.map((b) => ({
    id: b.id,
    src: b.imageUrl as string,
    alt: b.title,
    title: b.title,
    subtitle: b.subtitle,
    link: b.linkUrl || '/products',
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

  const featured = categories.filter((c) => !c.parentId);
  const activeHero = heroSlides[heroIndex];

  return (
    <>
      <section className="hero-editorial" aria-label="واجهة الموقع">
        <div className="hero-editorial-media">
          {heroSlides.map((slide, i) => (
            <img
              key={slide.id}
              className={`hero-ly-slide${i === heroIndex ? ' is-active' : ''}`}
              src={slide.src}
              alt={slide.alt || 'دار الأنوثة'}
              width={1920}
              height={1080}
              decoding="async"
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
            />
          ))}
          <div className="hero-ly-overlay" aria-hidden />
        </div>
        <div className="container hero-editorial-copy">
          {activeHero?.title || !heroSlides.length ? (
            <h1 className="headline-xl hero-title">
              {activeHero?.title || SITE_COPY.heroTitle}
            </h1>
          ) : null}
          {activeHero?.subtitle ? <p className="body-lg hero-sub">{activeHero.subtitle}</p> : null}
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
        <Reveal className="section section-pb">
          <div className="container">
            <CategoryStrip categories={featured} limit={6} />
          </div>
        </Reveal>
      ) : null}

      <Reveal className="section section-pb">
        <div className="container">
          <SectionHeading
            kicker="شاهد مجموعتنا الجديدة"
            title={SITE_COPY.newArrivals}
            linkTo="/new"
            linkLabel={SITE_COPY.viewAll}
          />
          {loading ? (
            <ProductGridSkeleton count={4} />
          ) : newItems.length ? (
            <ProductGrid products={newItems.slice(0, 10)} />
          ) : (
            <div className="coming-soon-banner panel">
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
        <Reveal className="section section-pb">
          <div className="container">
            <SectionHeading
              kicker="الأكثر طلباً"
              title={SITE_COPY.bestsellers}
              linkTo="/bestseller"
              linkLabel={SITE_COPY.viewAll}
            />
            <ProductGrid products={bestsellers.slice(0, 10)} />
          </div>
        </Reveal>
      ) : null}

      {!loading && offers.length ? (
        <Reveal className="section section-pb">
          <div className="container">
            <SectionHeading
              kicker="عروض خاصة"
              title={SITE_COPY.offers}
              linkTo="/offers"
              linkLabel={SITE_COPY.viewAll}
            />
            <ProductGrid products={offers.slice(0, 10)} />
          </div>
        </Reveal>
      ) : null}

      <TrustBar />
    </>
  );
}
