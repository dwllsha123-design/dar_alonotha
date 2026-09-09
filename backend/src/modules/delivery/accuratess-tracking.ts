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
  // Never treat our internal refs / slips as Accuratess tracking codes
  if (/^PAGE:/i.test(s) || /^ORD-/i.test(s) || /^SLIP-/i.test(s)) return false;
  if (s.includes('|ORD:')) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(s) && s.includes('_')) return false;
  if (/^\d{4,}$/.test(s)) return true;
  if (/^[A-Za-z0-9-]{5,}$/.test(s) && !s.includes('_')) return true;
  return false;
}

/** Persist Accuratess GraphQL shipment.id → Delivery.accuratessShipmentId */
export function asAccuratessShipmentId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object') return null;
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  // Never store ORD/SLIP/refNumber as the Accuratess internal id
  if (/^PAGE:/i.test(s) || /^ORD-/i.test(s) || /^SLIP-/i.test(s) || s.includes('|ORD:')) {
    return null;
  }
  return s;
}

/**
 * Persist Accuratess GraphQL shipment.code → trackingNumber / externalTrackingNumber.
 * Never invent values; never use refNumber / ORD / SLIP.
 */
export function asAccuratessTrackingCode(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object') return null;
  const s = String(value).trim();
  if (!isLikelyAccuratessShipmentCode(s)) return null;
  return s;
}

/**
 * Customer / print-facing Accuratess number.
 * Prefer Delivery.trackingNumber, then Order.externalTrackingNumber.
 * Never use accuratessShipmentId (internal id) or refNumber.
 */
export function resolvePrintAccuratessCode(input: {
  trackingNumber?: string | null;
  externalTrackingNumber?: string | null;
  accuratessShipmentId?: string | null;
  externalRef?: string | null;
  refNumber?: string | null;
}): string | null {
  const candidates = [input.trackingNumber, input.externalTrackingNumber];
  for (const c of candidates) {
    const code = asAccuratessTrackingCode(c);
    if (code) return code;
  }
  // Legacy rows may have put the tracking code in externalRef (not the numeric id).
  // Only accept externalRef when it is a plausible code AND not equal to accuratessShipmentId.
  if (input.externalRef) {
    const ref = String(input.externalRef).trim();
    if (
      asAccuratessTrackingCode(ref) &&
      ref !== String(input.accuratessShipmentId || '').trim()
    ) {
      return ref;
    }
  }
  return null;
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
      const code = asAccuratessTrackingCode(c);
      if (code) return code;
    }
    return null;
  };

  const fromObject = (
    obj: Record<string, unknown> | null | undefined,
  ): { code: string | null; trackingUrl: string | null; id: string | null } => {
    if (!obj) return { code: null, trackingUrl: null, id: null };
    // Prefer GraphQL `code` over alternate keys; never use refNumber as tracking.
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
      id: asAccuratessShipmentId(obj.id),
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
