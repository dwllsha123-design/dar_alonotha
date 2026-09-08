/**
 * PATCH semantics helpers: omitted / empty image fields must not wipe existing URLs.
 */

/** Keep current DB value unless a non-empty string is provided. Never write "" as clear. */
export function patchOptionalImageUrl(
  incoming: string | null | undefined,
): string | null | undefined {
  if (incoming === undefined) return undefined; // omit → preserve
  if (incoming === null) return undefined; // treat null as omit on generic PATCH (use clear endpoint)
  const trimmed = incoming.trim();
  if (!trimmed) return undefined; // "" → preserve (do not clear)
  return trimmed;
}

/** Explicit clear only when caller passes clearImage: true via dedicated API. */
export function patchExplicitClearImageUrl(
  incoming: string | null | undefined,
  opts?: { allowClear?: boolean },
): string | null | undefined {
  if (opts?.allowClear && (incoming === null || incoming === '')) return null;
  return patchOptionalImageUrl(incoming);
}

export function assertPriceUpdateDoesNotTouchImages(updateData: Record<string, unknown>) {
  const forbidden = ['images', 'colorMedia', 'imageUrl', 'imageUrls'];
  for (const key of forbidden) {
    if (key in updateData && updateData[key] !== undefined) {
      throw new Error(`Price/stock update must not include ${key}`);
    }
  }
}
