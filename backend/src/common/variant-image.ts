type VariantWithImages = {
  imageUrl?: string | null;
  color?: string | null;
  product: {
    images: Array<{
      url: string;
      isPrimary: boolean;
      sortOrder: number;
      color?: string | null;
    }>;
  };
};

export function resolveVariantImageUrl(variant: VariantWithImages): string | null {
  if (variant.imageUrl?.trim()) return variant.imageUrl.trim();
  const color = variant.color?.trim();
  if (color) {
    const byColor = variant.product.images
      .filter((i) => i.color === color)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (byColor[0]?.url) return byColor[0].url;
  }
  const sorted = [...variant.product.images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );
  return sorted[0]?.url || null;
}
