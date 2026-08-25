export type StoreCategory = {
  id: string;
  parentId?: string | null;
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

export function categoryImage(slug: string) {
  return CATEGORY_IMAGES[slug] || '/home/category.jpg';
}
