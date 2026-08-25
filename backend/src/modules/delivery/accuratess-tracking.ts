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

  const fromObject = (
    obj: Record<string, unknown> | null | undefined,
  ): { code: string | null; trackingUrl: string | null; id: string | null } => {
    if (!obj) return { code: null, trackingUrl: null, id: null };
    const code =
      asText(obj.code) ||
      asText(obj.trackingCode) ||
      asText(obj.trackingNumber) ||
      asText(obj.shipmentCode) ||
      asText(obj.barcode) ||
      null;
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
    const hit = fromObject(obj);
    if (hit.code && !best.code) best = hit;
    else if (!best.trackingUrl && hit.trackingUrl) {
      best = { ...best, trackingUrl: hit.trackingUrl, id: best.id || hit.id };
    } else if (!best.id && hit.id) {
      best = { ...best, id: hit.id };
    }
    for (const key of ['data', 'saveShipment', 'shipment', 'raw', 'result']) {
      if (obj[key]) dig(obj[key], depth + 1);
    }
  };
  dig(raw);
  dig(shipment);

  // Last resort: scrape JSON for "code":"..."
  if (!best.code) {
    try {
      const text = JSON.stringify(raw ?? shipment ?? {});
      const m =
        text.match(/"code"\s*:\s*"([^"]+)"/) ||
        text.match(/"trackingCode"\s*:\s*"([^"]+)"/) ||
        text.match(/"code"\s*:\s*(\d+)/);
      if (m?.[1]) best = { ...best, code: m[1] };
    } catch {
      /* ignore */
    }
  }

  const code = best.code || best.id || null;
  return { code, trackingUrl: best.trackingUrl, id: best.id };
}
