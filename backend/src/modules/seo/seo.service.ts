import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreService } from '../store/store.service';
import { STORE_SITE } from './seo.constants';

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
};

@Injectable()
export class SeoService {
  constructor(
    private readonly config: ConfigService,
    private readonly store: StoreService,
  ) {}

  siteUrl(): string {
    const raw =
      this.config.get<string>('SITE_URL') ||
      this.config.get<string>('STORE_URL') ||
      this.config.get<string>('APP_URL') ||
      STORE_SITE.canonicalOrigin;
    return (
      raw.replace(/\/$/, '').replace(/\/api\/v1$/i, '') ||
      STORE_SITE.canonicalOrigin
    );
  }

  absoluteUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return this.siteUrl();
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const base = this.siteUrl();
    return pathOrUrl.startsWith('/') ? `${base}${pathOrUrl}` : `${base}/${pathOrUrl}`;
  }

  robotsTxt(): string {
    const site = this.siteUrl();
    return [
      'User-agent: *',
      'Allow: /',
      '',
      'Disallow: /admin',
      'Disallow: /admin/',
      'Disallow: /api/',
      'Disallow: /login',
      'Disallow: /register',
      'Disallow: /forgot-password',
      'Disallow: /account',
      'Disallow: /cart',
      'Disallow: /checkout',
      'Disallow: /wishlist',
      'Disallow: /order-success',
      'Disallow: /search',
      'Disallow: /search-box',
      '',
      `Sitemap: ${site}/sitemap.xml`,
      '',
    ].join('\n');
  }

  private xmlEscape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private toLastmod(date?: Date | string | null): string | undefined {
    if (!date) return undefined;
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString().slice(0, 10);
  }

  async buildSitemapEntries(): Promise<SitemapEntry[]> {
    const site = this.siteUrl();
    const today = new Date().toISOString().slice(0, 10);
    const staticPages: SitemapEntry[] = [
      { loc: `${site}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
      { loc: `${site}/products`, lastmod: today, changefreq: 'daily', priority: '0.9' },
      { loc: `${site}/categories`, lastmod: today, changefreq: 'weekly', priority: '0.8' },
      { loc: `${site}/offers`, lastmod: today, changefreq: 'daily', priority: '0.8' },
      { loc: `${site}/about`, lastmod: today, changefreq: 'monthly', priority: '0.5' },
      { loc: `${site}/contact`, lastmod: today, changefreq: 'monthly', priority: '0.5' },
      { loc: `${site}/reviews`, lastmod: today, changefreq: 'monthly', priority: '0.4' },
      { loc: `${site}/track`, lastmod: today, changefreq: 'monthly', priority: '0.3' },
      {
        loc: `${site}/policies/shipping`,
        lastmod: today,
        changefreq: 'yearly',
        priority: '0.3',
      },
      {
        loc: `${site}/policies/returns`,
        lastmod: today,
        changefreq: 'yearly',
        priority: '0.3',
      },
      {
        loc: `${site}/policies/privacy`,
        lastmod: today,
        changefreq: 'yearly',
        priority: '0.2',
      },
      {
        loc: `${site}/policies/terms`,
        lastmod: today,
        changefreq: 'yearly',
        priority: '0.2',
      },
    ];

    const categories = await this.store.categories();
    const categoryEntries: SitemapEntry[] = categories.map((c) => ({
      loc: `${site}/category/${encodeURIComponent(c.slug)}`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7',
    }));

    const products = await this.store.listProductsForSitemap();
    const productEntries: SitemapEntry[] = products.map((p) => ({
      loc: `${site}/product/${encodeURIComponent(p.id)}`,
      lastmod: this.toLastmod(p.updatedAt) || today,
      changefreq: 'weekly',
      priority: '0.8',
    }));

    return [...staticPages, ...categoryEntries, ...productEntries];
  }

  async sitemapXml(): Promise<string> {
    const entries = await this.buildSitemapEntries();
    const body = entries
      .map((e) => {
        const parts = [`    <loc>${this.xmlEscape(e.loc)}</loc>`];
        if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
        if (e.changefreq) {
          parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
        }
        if (e.priority) parts.push(`    <priority>${e.priority}</priority>`);
        return `  <url>\n${parts.join('\n')}\n  </url>`;
      })
      .join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      body,
      '</urlset>',
      '',
    ].join('\n');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private truncate(text: string, max = 160): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1).trim()}…`;
  }

  organizationJsonLd() {
    const site = this.siteUrl();
    return {
      '@context': 'https://schema.org',
      '@type': 'OnlineStore',
      name: STORE_SITE.nameAr,
      alternateName: STORE_SITE.nameEn,
      url: site,
      logo: this.absoluteUrl('/brand-logo.png'),
      image: this.absoluteUrl('/brand-logo.png'),
      telephone: STORE_SITE.phones,
      email: STORE_SITE.email,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'طرابلس',
        addressCountry: 'LY',
      },
      areaServed: {
        '@type': 'Country',
        name: 'Libya',
      },
    };
  }

  async renderProductHtml(id: string): Promise<string> {
    let product;
    try {
      product = await this.store.productById(id);
    } catch {
      throw new NotFoundException('المنتج غير موجود');
    }

    const site = this.siteUrl();
    const url = `${site}/product/${encodeURIComponent(product.id)}`;
    const title = `${product.nameAr} | ${STORE_SITE.nameAr}`;
    const description = this.truncate(
      product.description ||
        `${product.nameAr} من ${STORE_SITE.nameAr} — تسوق أونلاين في ليبيا.`,
    );
    const images = (product.images || [])
      .map((i) => this.absoluteUrl(i.url))
      .filter(Boolean)
      .slice(0, 5);
    const primaryImage = images[0] || this.absoluteUrl('/brand-logo.png');
    const price = Number(product.retailPrice || 0);
    const availability = product.inStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock';

    const productLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.nameAr,
      description: product.description || product.nameAr,
      image: images.length ? images : [primaryImage],
      sku: product.sku || undefined,
      brand: product.brand
        ? { '@type': 'Brand', name: product.brand }
        : { '@type': 'Brand', name: STORE_SITE.nameAr },
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: product.currency || 'LYD',
        price: String(price),
        availability,
        itemCondition: 'https://schema.org/NewCondition',
      },
    };

    const crumbs: Array<{ name: string; item: string }> = [
      { name: 'الرئيسية', item: `${site}/` },
      { name: 'المتجر', item: `${site}/products` },
    ];
    if (product.category?.slug) {
      crumbs.push({
        name: product.category.nameAr,
        item: `${site}/category/${encodeURIComponent(product.category.slug)}`,
      });
    }
    crumbs.push({ name: product.nameAr, item: url });

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    };

    const imgTags = images
      .slice(0, 3)
      .map(
        (src, idx) =>
          `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(product.nameAr)}${idx ? ` — ${idx + 1}` : ''}" width="800" height="1000" loading="${idx ? 'lazy' : 'eager'}" />`,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${this.escapeHtml(title)}</title>
  <meta name="description" content="${this.escapeHtml(description)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${this.escapeHtml(url)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="${this.escapeHtml(STORE_SITE.nameAr)}" />
  <meta property="og:locale" content="ar_LY" />
  <meta property="og:title" content="${this.escapeHtml(title)}" />
  <meta property="og:description" content="${this.escapeHtml(description)}" />
  <meta property="og:url" content="${this.escapeHtml(url)}" />
  <meta property="og:image" content="${this.escapeHtml(primaryImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${this.escapeHtml(title)}" />
  <meta name="twitter:description" content="${this.escapeHtml(description)}" />
  <meta name="twitter:image" content="${this.escapeHtml(primaryImage)}" />
  <meta name="theme-color" content="#121110" />
  <link rel="icon" type="image/png" href="/favicon-32.png?v=2" sizes="32x32" />
  <script type="application/ld+json">${JSON.stringify(productLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(this.organizationJsonLd())}</script>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#121110;color:#f3ebe0;line-height:1.6}
    a{color:#c9a227} img{max-width:100%;height:auto;border-radius:4px}
    .price{font-size:1.25rem;color:#e0c36a}
  </style>
</head>
<body>
  <main>
    <nav aria-label="مسار التنقل">
      ${crumbs
        .map(
          (c, i) =>
            `${i ? ' › ' : ''}<a href="${this.escapeHtml(c.item)}">${this.escapeHtml(c.name)}</a>`,
        )
        .join('')}
    </nav>
    <article>
      <h1>${this.escapeHtml(product.nameAr)}</h1>
      ${
        product.category
          ? `<p>القسم: <a href="${site}/category/${this.escapeHtml(product.category.slug)}">${this.escapeHtml(product.category.nameAr)}</a></p>`
          : ''
      }
      <p class="price">${price.toLocaleString('ar-LY')} د.ل</p>
      <p>${product.inStock ? 'متوفر' : 'غير متوفر'}</p>
      ${product.description ? `<p>${this.escapeHtml(product.description)}</p>` : ''}
      <div>${imgTags}</div>
      <p><a href="${this.escapeHtml(url)}">عرض المنتج في المتجر</a></p>
    </article>
  </main>
</body>
</html>`;
  }

  renderNotFoundHtml(message = 'الصفحة غير موجودة'): string {
    const site = this.siteUrl();
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>غير موجود | ${this.escapeHtml(STORE_SITE.nameAr)}</title>
  <meta name="robots" content="noindex,follow" />
  <link rel="canonical" href="${this.escapeHtml(site)}/" />
</head>
<body>
  <h1>${this.escapeHtml(message)}</h1>
  <p><a href="${this.escapeHtml(site)}/products">العودة إلى المتجر</a></p>
</body>
</html>`;
  }
}
