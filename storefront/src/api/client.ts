const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

export type StoreProduct = {
  id: string;
  nameAr: string;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  category?: { id: string; nameAr: string; slug: string; parentId?: string | null } | null;
  retailPrice: number;
  compareAtPrice: number | null;
  discountPercent: number;
  currency: string;
  images: Array<{ url: string; alt?: string | null; isPrimary: boolean; color?: string | null }>;
  variants: Array<{
    id: string;
    sku: string;
    color?: string | null;
    size?: string | null;
    nameAr?: string | null;
    imageUrl?: string | null;
    retailPrice: number;
    available?: number;
    inStock: boolean;
  }>;
  inStock: boolean;
  createdAt?: string;
  soldCount?: number;
  related?: StoreProduct[];
  suggested?: StoreProduct[];
};

type ApiResponse<T> = { success: boolean; data?: T; message?: string };

function token() {
  return localStorage.getItem('store_token');
}

export function setStoreToken(value: string | null) {
  if (value) localStorage.setItem('store_token', value);
  else localStorage.removeItem('store_token');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  const t = token();
  if (t) headers.set('Authorization', `Bearer ${t}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let json: ApiResponse<T> | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new Error('تعذر قراءة رد الخادم');
    }
  }
  if (!res.ok || !json) {
    throw new Error(
      json?.message ||
        (res.status >= 500
          ? 'تعذر الاتصال بالخادم. تأكدي أن النظام يعمل ثم أعيدي المحاولة.'
          : 'حدث خطأ'),
    );
  }
  if (json && typeof json === 'object' && 'data' in json) return json.data as T;
  return json as T;
}

export const money = (n: number | string) => {
  const value = Math.round(Number(n || 0));
  return `${value.toLocaleString('ar-LY')} د.ل`;
};

export function captureAttributionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  const page = params.get('page');
  const agent = params.get('agent');
  if (ref || page) {
    localStorage.setItem(
      'store_attribution',
      JSON.stringify({
        token: ref || undefined,
        page: page || undefined,
        agent: agent || undefined,
        at: Date.now(),
      }),
    );
  }
}

export function getAttributionToken(): string | undefined {
  try {
    const raw = localStorage.getItem('store_attribution');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { token?: string; at?: number };
    if (!parsed.token) return undefined;
    if (parsed.at && Date.now() - parsed.at > 1000 * 60 * 60 * 24 * 14) {
      localStorage.removeItem('store_attribution');
      return undefined;
    }
    return parsed.token;
  } catch {
    return undefined;
  }
}

export function getAttributionMeta(): {
  token?: string;
  pagePublicCode?: number;
  agentPublicCode?: number;
} {
  try {
    const raw = localStorage.getItem('store_attribution');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      token?: string;
      page?: string;
      agent?: string;
      at?: number;
    };
    if (parsed.at && Date.now() - parsed.at > 1000 * 60 * 60 * 24 * 14) {
      localStorage.removeItem('store_attribution');
      return {};
    }
    return {
      token: parsed.token,
      pagePublicCode: parsed.page ? Number(parsed.page) : undefined,
      agentPublicCode: parsed.agent ? Number(parsed.agent) : undefined,
    };
  } catch {
    return {};
  }
}

export const statusLabel: Record<string, string> = {
  NEW: 'تم إنشاء الطلب',
  CONFIRMED: 'تم تأكيد الطلب',
  PREPARING: 'جاري التجهيز',
  READY: 'جاهز للتوصيل',
  ASSIGNED: 'تم تعيين التوصيل',
  OUT_FOR_DELIVERY: 'خرج للتوصيل',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغي',
  RETURNED: 'مرتجع',
  PARTIALLY_RETURNED: 'مرتجع جزئي',
};
