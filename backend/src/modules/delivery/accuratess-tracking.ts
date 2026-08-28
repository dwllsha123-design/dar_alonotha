export type AccuratessShipmentResult = {
  id?: string | number;
  code?: string | number;
  trackingUrl?: string | null;
  trackingCode?: string | number;
  trackingNumber?: string | number;
  shipmentCode?: string | number;
  barcode?: string | number;
  refNumber?: string | null;
};

/** Reject GraphQL validation tokens mistaken for shipment codes (e.g. NO_PRICE_LIST_ENTRY). */
export function isLikelyAccuratessShipmentCode(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = value.trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(s) && s.includes('_')) return false;
  if (/^\d{4,}$/.test(s)) return true;
  if (/^[A-Za-z0-9-]{5,}$/.test(s) && !s.includes('_')) return true;
  return false;
}

/** Pull tracking code from Accuratess shipment / raw GraphQL payload. */
export function extractAccuratessTracking(
  shipment?: AccuratessShipmentResult | null,
  raw?: unknown,
): { code: string | null; trackingUrl: string | null; id: string | null } {
  const asText = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'object') return null;
    const s = String(v).trim();
    if (!s || s === 'null' || s === 'undefined') return null;
    return s;
  };

  const pickCode = (...candidates: unknown[]): string | null => {
    for (const c of candidates) {
      const text = asText(c);
      if (text && isLikelyAccuratessShipmentCode(text)) return text;
    }
    return null;
  };

  const fromObject = (
    obj: Record<string, unknown> | null | undefined,
  ): { code: string | null; trackingUrl: string | null; id: string | null } => {
    if (!obj) return { code: null, trackingUrl: null, id: null };
    const code = pickCode(
      obj.code,
      obj.trackingCode,
      obj.trackingNumber,
      obj.shipmentCode,
      obj.barcode,
    );
    return {
      code,
      trackingUrl: asText(obj.trackingUrl),
      id: asText(obj.id),
    };
  };

  let best = fromObject(shipment as Record<string, unknown> | null);
  if (best.code) {
    return { code: best.code, trackingUrl: best.trackingUrl, id: best.id };
  }

  const dig = (node: unknown, depth = 0): void => {
    if (!node || depth > 5 || best.code) return;
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) dig(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    // Never scrape GraphQL error objects for shipment codes
    if (obj.message && obj.extensions) return;

    const hit = fromObject(obj);
    if (hit.code && !best.code) best = hit;
    else if (!best.trackingUrl && hit.trackingUrl) {
      best = { ...best, trackingUrl: hit.trackingUrl, id: best.id || hit.id };
    } else if (!best.id && hit.id) {
      best = { ...best, id: hit.id };
    }
    for (const key of ['data', 'saveShipment', 'shipment', 'result']) {
      if (obj[key]) dig(obj[key], depth + 1);
    }
  };
  dig(shipment);
  if (!best.code && raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const root = raw as Record<string, unknown>;
    if (root.data) dig(root.data);
  }

  return { code: best.code, trackingUrl: best.trackingUrl, id: best.id };
}
