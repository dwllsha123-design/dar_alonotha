import { useEffect } from 'react';

const DEFAULT_TITLE = 'دار الأنوثة | Dar Al Onoutha';
const DEFAULT_DESC = 'دار الأنوثة — ملابس نسائية، لانجري، أرواب وباروكات في طرابلس ليبيا';

export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} | دار الأنوثة` : DEFAULT_TITLE;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description || DEFAULT_DESC);
  }, [title, description]);
}

export function useProductJsonLd(product: {
  nameAr: string;
  description?: string | null;
  retailPrice: number;
  images?: Array<{ url: string }>;
  inStock?: boolean;
} | null) {
  useEffect(() => {
    const id = 'dao-product-jsonld';
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    if (!product) return;

    const script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.nameAr,
      description: product.description || product.nameAr,
      image: product.images?.map((i) => i.url).filter(Boolean).slice(0, 5),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'LYD',
        price: Number(product.retailPrice),
        availability: product.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      },
    });
    document.head.appendChild(script);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [product]);
}
