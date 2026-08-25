export type StoreCategory = {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  slug: string;
};

export const CATEGORY_IMAGES: Record<string, string> = {
  lingerie: '/home/category.jpg',
  underwear: '/home/product-faraa.jpg',
  robes: '/home/product-kaftan.jpg',
  wigs: '/home/product-kaftan-34-alt.jpg',
};

export const FALLBACK_CATEGORIES: StoreCategory[] = [
  { id: 'lingerie', nameAr: 'لانجري', slug: 'lingerie' },
  { id: 'underwear', nameAr: 'ملابس داخلية', slug: 'underwear' },
  { id: 'robes', nameAr: 'أرواب', slug: 'robes' },
  { id: 'wigs', nameAr: 'باروكات', slug: 'wigs' },
];

export function categoryImage(slug: string) {
  return CATEGORY_IMAGES[slug] || '/home/category.jpg';
}
