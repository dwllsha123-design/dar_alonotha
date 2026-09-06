import { useEffect } from 'react';

export const SITE_ORIGIN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_URL
    ? String(import.meta.env.VITE_SITE_URL).replace(/\/$/, '')
    : '') || 'https://daralonotha.com';

export const DEFAULT_TITLE = 'دار الأنوثة | أزياء ومنتجات نسائية في ليبيا';
export const DEFAULT_DESC =
  'دار الأنوثة — ملابس نسائية، لانجري، أرواب وباروكات مع توصيل داخل ليبيا.';

export function absoluteUrl(pathOrUrl = '/'): string {
  if (!pathOrUrl) return SITE_ORIGIN;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return pathOrUrl.startsWith('/')
    ? `${SITE_ORIGIN}${pathOrUrl}`
    : `${SITE_ORIGIN}/${pathOrUrl}`;
}

function upsertMeta(
  attr: 'name' | 'property',
  key: string,
  content: string,
) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(id: string, data: unknown | null) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.text = JSON.stringify(data);
  document.head.appendChild(script);
}

export type PageMetaOptions = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: 'website' | 'product' | 'article';
  robots?: string;
  noSuffix?: boolean;
};

export function applyPageMeta(opts: PageMetaOptions = {}) {
  const title = opts.title
    ? opts.noSuffix
      ? opts.title
      : `${opts.title} | دار الأنوثة`
    : DEFAULT_TITLE;
  const description = opts.description || DEFAULT_DESC;
  const url = absoluteUrl(opts.path || (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const image = absoluteUrl(opts.image || '/brand-logo.png');
  const robots = opts.robots || 'index,follow';

  document.title = title;
  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', robots);
  upsertLink('canonical', url);

  upsertMeta('property', 'og:type', opts.type || 'website');
  upsertMeta('property', 'og:site_name', 'دار الأنوثة');
  upsertMeta('property', 'og:locale', 'ar_LY');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', image);

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', image);
}

export function usePageMeta(
  titleOrOpts?: string | PageMetaOptions,
  description?: string,
) {
  const opts: PageMetaOptions =
    typeof titleOrOpts === 'string' || titleOrOpts === undefined
      ? { title: titleOrOpts, description }
      : titleOrOpts;

  useEffect(() => {
    applyPageMeta({
      ...opts,
      path: opts.path || window.location.pathname,
    });
  }, [
    opts.title,
    opts.description,
    opts.path,
    opts.image,
    opts.type,
    opts.robots,
    opts.noSuffix,
  ]);
}

const PRIVATE_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/account',
  '/cart',
  '/checkout',
  '/wishlist',
  '/order-success',
  '/search',
  '/search-box',
  '/admin',
];

export function isPrivateSeoPath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function useRobotsForPath(pathname: string) {
  useEffect(() => {
    if (isPrivateSeoPath(pathname)) {
      upsertMeta('name', 'robots', 'noindex,nofollow');
    }
  }, [pathname]);
}

export function useOrganizationJsonLd() {
  useEffect(() => {
    upsertJsonLd('dao-org-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'OnlineStore',
      name: 'دار الأنوثة',
      alternateName: 'Dar Al Onoutha',
      url: SITE_ORIGIN,
      logo: absoluteUrl('/brand-logo.png'),
      image: absoluteUrl('/brand-logo.png'),
      telephone: ['0921820999', '0924443839'],
      email: 'info@daralonotha.com',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'طرابلس',
        addressCountry: 'LY',
      },
      areaServed: { '@type': 'Country', name: 'Libya' },
    });
    return () => {
      document.getElementById('dao-org-jsonld')?.remove();
    };
  }, []);
}

export function useProductJsonLd(
  product: {
    id: string;
    nameAr: string;
    description?: string | null;
    retailPrice: number;
    currency?: string;
    sku?: string | null;
    brand?: string | null;
    images?: Array<{ url: string }>;
    inStock?: boolean;
    category?: { nameAr: string; slug: string } | null;
  } | null,
) {
  useEffect(() => {
    if (!product) {
      upsertJsonLd('dao-product-jsonld', null);
      upsertJsonLd('dao-breadcrumb-jsonld', null);
      return;
    }

    const url = absoluteUrl(`/product/${product.id}`);
    const images = (product.images || [])
      .map((i) => absoluteUrl(i.url))
      .filter(Boolean)
      .slice(0, 5);

    upsertJsonLd('dao-product-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.nameAr,
      description: product.description || product.nameAr,
      image: images.length ? images : [absoluteUrl('/brand-logo.png')],
      sku: product.sku || undefined,
      brand: {
        '@type': 'Brand',
        name: product.brand || 'دار الأنوثة',
      },
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: product.currency || 'LYD',
        price: String(Number(product.retailPrice) || 0),
        availability: product.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    });

    const crumbs: Array<{ name: string; item: string }> = [
      { name: 'الرئيسية', item: absoluteUrl('/') },
      { name: 'المتجر', item: absoluteUrl('/products') },
    ];
    if (product.category?.slug) {
      crumbs.push({
        name: product.category.nameAr,
        item: absoluteUrl(`/category/${product.category.slug}`),
      });
    }
    crumbs.push({ name: product.nameAr, item: url });

    upsertJsonLd('dao-breadcrumb-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    });

    return () => {
      document.getElementById('dao-product-jsonld')?.remove();
      document.getElementById('dao-breadcrumb-jsonld')?.remove();
    };
  }, [product]);
}
