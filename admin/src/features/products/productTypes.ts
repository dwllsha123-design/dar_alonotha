export type ProductImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  color?: string | null;
};

export type Variant = {
  id: string;
  sku: string;
  barcode?: string | null;
  color?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  retailPrice: number;
  price?: number;
  available?: number;
};

export type Product = {
  id: string;
  nameAr: string;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  retailPrice?: string | number;
  basePrice: string | number;
  costPrice?: string | number;
  wholesalePrice?: string | number;
  status: string;
  createdAt?: string;
  category?: { id: string; nameAr: string; slug: string; parentId?: string | null } | null;
  images?: ProductImage[];
  variants: Variant[];
};

export type CategoryRow = {
  id: string;
  parentId: string | null;
  nameAr: string;
  isActive: boolean;
};

/** Local image before/after upload */
export type LocalImage = {
  key: string;
  file: File | null;
  preview: string;
  existingId?: string;
  existingUrl?: string;
};

export type ColorGroup = {
  key: string;
  color: string;
  images: LocalImage[];
  sizes: string[];
  qtyBySize: Record<string, string>;
};

export const MAX_GALLERY_IMAGES = 4;
export const MAX_COLOR_IMAGES = 4;

export const SIZE_OPTIONS = [
  { value: 'S', wide: false },
  { value: 'M', wide: false },
  { value: 'L', wide: false },
  { value: 'XL', wide: false },
  { value: '2XL', wide: false },
  { value: '3XL', wide: false },
  { value: '4XL', wide: false },
  { value: '5XL', wide: false },
  { value: 'Big size', wide: true },
  { value: 'Free size', wide: true },
] as const;

export const COLOR_OPTIONS = [
  { name: 'أسود', hex: '#1a1a1a', light: false },
  { name: 'أبيض', hex: '#f7f7f7', light: true },
  { name: 'رمادي', hex: '#8a8a8a', light: false },
  { name: 'بيج', hex: '#d8c3a5', light: true },
  { name: 'كريمي', hex: '#f4ead5', light: true },
  { name: 'نود', hex: '#e0b7a0', light: true },
  { name: 'بني', hex: '#6b3f2a', light: false },
  { name: 'ذهبي', hex: '#c9a227', light: true },
  { name: 'فضي', hex: '#c0c0c0', light: true },
  { name: 'أحمر', hex: '#c4392b', light: false },
  { name: 'عنابي', hex: '#7b1e3c', light: false },
  { name: 'وردي', hex: '#e89bb0', light: true },
  { name: 'كحلي', hex: '#1e3a5f', light: false },
  { name: 'أزرق', hex: '#3b6ea5', light: false },
  { name: 'أخضر', hex: '#3d7a5a', light: false },
  { name: 'زيتي', hex: '#6b6e3a', light: false },
  { name: 'بنفسجي', hex: '#6b4c8a', light: false },
  { name: 'برتقالي', hex: '#d96c2c', light: false },
  { name: 'أصفر', hex: '#e4c44a', light: true },
  {
    name: 'ملون',
    hex: 'conic-gradient(#c4392b, #e4c44a, #3d7a5a, #3b6ea5, #6b4c8a, #c4392b)',
    light: false,
  },
] as const;

export const SALE_PRESETS = [10, 20, 30, 40, 50];
