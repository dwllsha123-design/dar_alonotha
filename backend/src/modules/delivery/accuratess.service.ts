import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus } from '@prisma/client';

export type AccuratessAccountCreds = {
  apiToken: string;
  endpoint?: string | null;
  senderZoneId?: string | null;
  senderSubzoneId?: string | null;
};

export type AccuratessShipmentPayload = {
  orderNumber: string;
  senderName?: string;
  recipientName: string;
  recipientPhone: string;
  recipientMobile?: string;
  recipientAddress: string;
  city?: string | null;
  area?: string | null;
  notes?: string | null;
  /** مبلغ التحصيل عند الدفع عند الاستلام (COLC) */
  price: number;
  deliveryFees?: number;
  piecesCount?: number;
  weight?: number;
  /** COD → COLC (افتراضي)، أو PAID/CASH… */
  paymentTypeCode?: 'COLC' | 'PAID' | 'CASH' | 'CRDT' | 'VISA';
  sourcePage: string;
  sourcePageCode?: number | null;
  description?: string;
  /** حساب الصفحة الفرعية — إن وُجد يتجاوز التوكن العام */
  account?: AccuratessAccountCreds | null;
};

type AccuratessZone = { id: number; name: string };

export type AccuratessGqlResult<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

type CachedToken = {
  token: string;
  expiresAt: number | null;
};

const LOGIN_MUTATION = `
  mutation AccuratessLogin($input: LoginInput!) {
    login(input: $input) {
      token
      expiresAt
      user {
        id
        username
        active
      }
    }
  }
`;

@Injectable()
export class AccuratessService {
  private readonly logger = new Logger(AccuratessService.name);
  private cachedToken: CachedToken | null = null;
  private loginInFlight: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled() {
    return this.config.get<string>('ACCURATESS_ENABLED') === 'true';
  }

  hasStaticToken(account?: AccuratessAccountCreds | null) {
    return Boolean(account?.apiToken || this.config.get<string>('ACCURATESS_TOKEN'));
  }

  hasLoginCredentials() {
    return Boolean(this.username() && this.password());
  }

  isConfigured(account?: AccuratessAccountCreds | null) {
    if (account?.apiToken) return true;
    if (!this.isEnabled()) return false;
    return this.hasStaticToken() || this.hasLoginCredentials();
  }

  endpoint(account?: AccuratessAccountCreds | null) {
    return (
      account?.endpoint ||
      this.config.get<string>('ACCURATESS_ENDPOINT') ||
      'https://mayar.lg.accuratess.com:8443/graphql'
    );
  }

  private username() {
    return (this.config.get<string>('ACCURATESS_USERNAME') || '').trim();
  }

  private password() {
    return this.config.get<string>('ACCURATESS_PASSWORD') || '';
  }

  private staticToken() {
    return (this.config.get<string>('ACCURATESS_TOKEN') || '').trim();
  }

  private isTokenFresh(cached: CachedToken | null): cached is CachedToken {
    if (!cached?.token) return false;
    if (!cached.expiresAt) return true;
    // Refresh 60s before expiry
    return Date.now() < cached.expiresAt - 60_000;
  }

  /**
   * Authenticates via Accuratess `login` mutation and caches the token.
   * Username for Mayar tenant is typically the short login name (e.g. اسلام),
   * not the full display name.
   */
  async login(force = false): Promise<{
    ok: boolean;
    token?: string;
    expiresAt?: string | null;
    user?: { id?: number; username?: string; active?: boolean };
    error?: string;
  }> {
    const username = this.username();
    const password = this.password();
    if (!username || !password) {
      return {
        ok: false,
        error:
          'عيّن ACCURATESS_USERNAME و ACCURATESS_PASSWORD لتسجيل الدخول عبر GraphQL',
      };
    }

    if (!force && this.isTokenFresh(this.cachedToken)) {
      return { ok: true, token: this.cachedToken.token };
    }

    if (this.loginInFlight && !force) {
      try {
        const token = await this.loginInFlight;
        return { ok: true, token };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Accuratess login failed';
        return { ok: false, error: message };
      }
    }

    this.loginInFlight = this.performLogin(username, password);
    try {
      const token = await this.loginInFlight;
      return {
        ok: true,
        token,
        expiresAt: this.cachedToken?.expiresAt
          ? new Date(this.cachedToken.expiresAt).toISOString()
          : null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Accuratess login failed';
      this.logger.error(message);
      return { ok: false, error: message };
    } finally {
      this.loginInFlight = null;
    }
  }

  private async performLogin(username: string, password: string): Promise<string> {
    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: LOGIN_MUTATION,
        variables: {
          input: {
            username,
            password,
            rememberMe: true,
          },
        },
      }),
    });

    const json = (await res.json()) as AccuratessGqlResult<{
      login?: {
        token: string;
        expiresAt?: string | null;
        user?: { id?: number; username?: string; active?: boolean };
      };
    }>;

    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }

    const token = json.data?.login?.token;
    if (!token) {
      throw new Error('Accuratess login returned no token');
    }

    const expiresRaw = json.data?.login?.expiresAt;
    this.cachedToken = {
      token,
      expiresAt: expiresRaw ? new Date(expiresRaw).getTime() : null,
    };

    this.logger.log(
      `Accuratess login ok (user=${json.data?.login?.user?.username ?? username})`,
    );
    // Opt-in: ACCURATESS_PRINT_TOKEN=true prints the full token for UI paste
    if (this.config.get<string>('ACCURATESS_PRINT_TOKEN') === 'true') {
      this.logger.warn(
        `ACCURATESS_TOKEN (copy into UI settings):\n${token}`,
      );
    }
    return token;
  }

  /**
   * Resolves a Bearer token: per-account token → static env token → login cache.
   */
  async resolveToken(account?: AccuratessAccountCreds | null): Promise<string> {
    if (account?.apiToken) return account.apiToken;

    const staticTok = this.staticToken();
    if (staticTok) return staticTok;

    if (this.isTokenFresh(this.cachedToken)) {
      return this.cachedToken.token;
    }

    const result = await this.login();
    if (!result.ok || !result.token) {
      throw new Error(result.error || 'تعذر الحصول على توكن Accuratess');
    }
    return result.token;
  }

  private looksLikeAuthError(errors?: AccuratessGqlResult<unknown>['errors']) {
    if (!errors?.length) return false;
    return errors.some((e) => {
      const code = (e.extensions?.code || '').toUpperCase();
      const msg = (e.message || '').toLowerCase();
      return (
        code.includes('UNAUTHENTICAT') ||
        code.includes('UNAUTHORIZED') ||
        code.includes('FORBIDDEN') ||
        msg.includes('unauthenticated') ||
        msg.includes('unauthorized') ||
        msg.includes('token') ||
        msg.includes('غير مصرح') ||
        msg.includes('تسجيل الدخول')
      );
    });
  }

  /**
   * Reusable GraphQL request helper for subsequent Accuratess API calls.
   * Attaches Authorization and retries once after re-login on auth failure
   * (only when using username/password, not a static/account token).
   */
  async request<T>(
    query: string,
    variables?: Record<string, unknown>,
    account?: AccuratessAccountCreds | null,
  ): Promise<AccuratessGqlResult<T>> {
    if (!this.isConfigured(account)) {
      return {
        errors: [
          {
            message:
              'ACCURATESS غير مفعّل — عيّن ACCURATESS_TOKEN أو ACCURATESS_USERNAME/PASSWORD مع ACCURATESS_ENABLED=true',
          },
        ],
      };
    }

    const canRelogin =
      !account?.apiToken && !this.staticToken() && this.hasLoginCredentials();

    const run = async (forceRelogin: boolean) => {
      if (forceRelogin && canRelogin) {
        this.cachedToken = null;
        await this.login(true);
      }
      const token = await this.resolveToken(account);
      const res = await fetch(this.endpoint(account), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
      });
      return (await res.json()) as AccuratessGqlResult<T>;
    };

    try {
      let json = await run(false);
      if (canRelogin && this.looksLikeAuthError(json.errors)) {
        this.logger.warn('Accuratess auth error — re-login and retry once');
        json = await run(true);
      }
      return json;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Accuratess network error';
      return { errors: [{ message }] };
    }
  }

  /** @deprecated Prefer request() — kept for internal callers */
  private async gql<T>(
    query: string,
    variables?: Record<string, unknown>,
    account?: AccuratessAccountCreds | null,
  ): Promise<AccuratessGqlResult<T>> {
    return this.request<T>(query, variables, account);
  }

  /** Lightweight connectivity check (me query). */
  async ping(account?: AccuratessAccountCreds | null) {
    if (!this.isConfigured(account)) {
      return { ok: false as const, error: 'ACCURATESS غير مفعّل أو بلا بيانات دخول' };
    }

    // Ensure we can obtain a token first when using password auth
    if (!account?.apiToken && !this.staticToken()) {
      const loggedIn = await this.login();
      if (!loggedIn.ok) return { ok: false as const, error: loggedIn.error };
    }

    const json = await this.request<{
      me?: { id: number; username: string; active: boolean };
    }>(
      `query AccuratessMe { me { id username active } }`,
      undefined,
      account,
    );

    if (json.errors?.length) {
      return { ok: false as const, error: json.errors.map((e) => e.message).join('; ') };
    }

    return { ok: true as const, me: json.data?.me };
  }

  private normalizeZoneName(value?: string | null) {
    return (value || '')
      .toString()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.\u060C,]+$/g, '')
      .trim()
      .toLowerCase();
  }

  private isPaymentVariantZone(name: string) {
    return /(بطاقة|الكترون|إلكترون|اونلاين|صباحا|نسائي|دفع)/i.test(name);
  }

  private pickBestZone(
    zones: AccuratessZone[],
    needle?: string | null,
  ): AccuratessZone | null {
    if (!zones.length) return null;
    const n = this.normalizeZoneName(needle);
    const scored = zones
      .map((z) => {
        const zn = this.normalizeZoneName(z.name);
        let score = 0;
        if (n && zn === n) score += 100;
        else if (n && (zn.startsWith(n) || n.startsWith(zn))) score += 70;
        else if (n && zn.includes(n)) score += 40;
        if (this.isPaymentVariantZone(z.name)) score -= 50;
        // Prefer lower IDs (main city rows tend to be early)
        score += Math.max(0, 20 - Math.min(z.id, 20));
        return { z, score };
      })
      .sort((a, b) => b.score - a.score || a.z.id - b.z.id);
    return scored[0]?.z || null;
  }

  private async listZonesDropdown(
    input: Record<string, unknown>,
    account?: AccuratessAccountCreds | null,
  ): Promise<AccuratessZone[]> {
    const json = await this.request<{
      listZonesDropdown?: AccuratessZone[];
    }>(
      `query Zones($input: ListZonesFilterInput) {
        listZonesDropdown(input: $input) { id name }
      }`,
      { input },
      account,
    );
    return json.data?.listZonesDropdown || [];
  }

  async resolveServiceId(account?: AccuratessAccountCreds | null): Promise<number> {
    const fromEnv = Number(this.config.get<string>('ACCURATESS_SERVICE_ID') || '');
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

    const json = await this.request<{
      shippingSettings?: { defaultShippingService?: { id?: number } | null };
      listShippingServicesDropdown?: Array<{ id: number; name: string }>;
    }>(
      `query {
        shippingSettings { defaultShippingService { id name } }
        listShippingServicesDropdown { id name }
      }`,
      undefined,
      account,
    );
    const def = json.data?.shippingSettings?.defaultShippingService?.id;
    if (def) return def;
    const first = json.data?.listShippingServicesDropdown?.[0]?.id;
    return first || 1;
  }

  async resolveSenderZones(account?: AccuratessAccountCreds | null): Promise<{
    senderZoneId: number;
    senderSubzoneId: number;
  }> {
    const envZone = Number(
      account?.senderZoneId ||
        this.config.get<string>('ACCURATESS_SENDER_ZONE_ID') ||
        '1',
    );
    const envSub = Number(
      account?.senderSubzoneId ||
        this.config.get<string>('ACCURATESS_SENDER_SUBZONE_ID') ||
        '',
    );
    const senderZoneId = Number.isFinite(envZone) && envZone > 0 ? envZone : 1;
    if (Number.isFinite(envSub) && envSub > 0) {
      return { senderZoneId, senderSubzoneId: envSub };
    }
    const children = await this.listZonesDropdown(
      { parentId: senderZoneId, active: true },
      account,
    );
    const preferred =
      this.pickBestZone(children, 'طرابلس') ||
      children.find((c) => !this.isPaymentVariantZone(c.name)) ||
      children[0];
    return {
      senderZoneId,
      senderSubzoneId: preferred?.id || senderZoneId,
    };
  }

  async resolveRecipientZones(
    city?: string | null,
    area?: string | null,
    account?: AccuratessAccountCreds | null,
  ): Promise<{ recipientZoneId: number; recipientSubzoneId: number } | null> {
    const envZone = Number(
      this.config.get<string>('ACCURATESS_DEFAULT_RECIPIENT_ZONE_ID') || '',
    );
    const envSub = Number(
      this.config.get<string>('ACCURATESS_DEFAULT_RECIPIENT_SUBZONE_ID') || '',
    );
    if (Number.isFinite(envZone) && envZone > 0 && Number.isFinite(envSub) && envSub > 0) {
      return { recipientZoneId: envZone, recipientSubzoneId: envSub };
    }

    const cityName = (city || '').trim();
    if (!cityName) return null;

    const matches = await this.listZonesDropdown(
      { name: cityName, active: true },
      account,
    );
    const zone = this.pickBestZone(matches, cityName);
    if (!zone) {
      this.logger.warn(`Accuratess: no zone match for city="${cityName}"`);
      return null;
    }

    const children = await this.listZonesDropdown(
      { parentId: zone.id, active: true },
      account,
    );
    const sub =
      this.pickBestZone(children, area) ||
      this.pickBestZone(children, cityName) ||
      children.find((c) => !this.isPaymentVariantZone(c.name)) ||
      children[0] ||
      zone;

    return { recipientZoneId: zone.id, recipientSubzoneId: sub.id };
  }

  /**
   * يرسل الشحنة إلى Accuratess GraphQL (saveShipment)
   * يدعم مفتاح حساب لكل صفحة فرعية عبر payload.account
   */
  async saveShipment(payload: AccuratessShipmentPayload) {
    if (!this.isConfigured(payload.account)) {
      return {
        skipped: true,
        reason:
          'ACCURATESS غير مفعّل أو لا يوجد مفتاح للحساب — عيّن توكن الصفحة أو ACCURATESS_TOKEN أو اسم المستخدم/كلمة المرور',
      };
    }

    const sourceLabel = payload.sourcePageCode
      ? `${payload.sourcePage} (#${payload.sourcePageCode})`
      : payload.sourcePage;

    const phone = (payload.recipientPhone || payload.recipientMobile || '').trim();
    if (!phone) {
      return { ok: false, error: 'رقم هاتف المستلم مطلوب لإرسال Accuratess' };
    }

    try {
      const serviceId = await this.resolveServiceId(payload.account);
      const sender = await this.resolveSenderZones(payload.account);
      const recipient = await this.resolveRecipientZones(
        payload.city,
        payload.area,
        payload.account,
      );
      if (!recipient) {
        return {
          ok: false,
          error: `تعذر مطابقة مدينة المستلم مع مناطق Accuratess (city=${payload.city || ''})`,
        };
      }

      const paymentTypeCode = payload.paymentTypeCode || 'COLC';
      const collectAmount = Number(payload.price || 0);
      // Accuratess: CASH/PAID يتطلب price=0؛ COLC يستخدم مبلغ التحصيل
      const price =
        paymentTypeCode === 'COLC' || paymentTypeCode === 'CRDT'
          ? collectAmount
          : 0;

      const input: Record<string, unknown> = {
        serviceId,
        senderName: payload.senderName || payload.sourcePage,
        senderZoneId: sender.senderZoneId,
        senderSubzoneId: sender.senderSubzoneId,
        recipientName: payload.recipientName,
        recipientPhone: phone,
        recipientMobile: (payload.recipientMobile || phone).trim(),
        recipientAddress: [payload.recipientAddress, payload.area, payload.city]
          .filter(Boolean)
          .join(' - '),
        recipientZoneId: recipient.recipientZoneId,
        recipientSubzoneId: recipient.recipientSubzoneId,
        price,
        weight: payload.weight != null ? Number(payload.weight) : 1,
        piecesCount:
          payload.piecesCount != null && payload.piecesCount > 0
            ? Math.floor(payload.piecesCount)
            : 1,
        typeCode: this.config.get<string>('ACCURATESS_TYPE_CODE') || 'FDP',
        priceTypeCode:
          this.config.get<string>('ACCURATESS_PRICE_TYPE_CODE') || 'EXCLD',
        paymentTypeCode,
        openableCode: this.config.get<string>('ACCURATESS_OPENABLE_CODE') || 'Y',
        notes: [
          payload.notes,
          `الراسل=${sourceLabel}`,
          `reference=${payload.orderNumber}`,
          payload.deliveryFees != null
            ? `delivery_fee=${payload.deliveryFees}`
            : '',
        ]
          .filter(Boolean)
          .join(' | '),
        description:
          payload.description ||
          `طلب ${payload.orderNumber} — الراسل: ${sourceLabel}`,
        refNumber: `PAGE:${sourceLabel}|ORD:${payload.orderNumber}`,
      };

      if (payload.deliveryFees != null) {
        input.deliveryFees = Number(payload.deliveryFees);
      }

      const query = `
        mutation SaveShipment($input: ShipmentInput!) {
          saveShipment(input: $input) {
            id
            code
            trackingUrl
            refNumber
            notes
            description
            status { code name }
          }
        }
      `;

      const json = await this.gql<{
        saveShipment?: {
          id?: number | string;
          code?: string;
          trackingUrl?: string;
          refNumber?: string;
          status?: { code?: string; name?: string };
        };
      }>(query, { input }, payload.account);

      if (json.errors?.length) {
        const msg = json.errors
          .map((e) => {
            const validation = (e as { extensions?: { validation?: Record<string, string[]> } })
              .extensions?.validation;
            if (validation) {
              const details = Object.entries(validation)
                .map(([k, v]) => `${k}: ${(v || []).join(', ')}`)
                .join('; ');
              return details ? `${e.message} (${details})` : e.message;
            }
            return e.message;
          })
          .join('; ');
        this.logger.error(`Accuratess saveShipment failed: ${msg}`);
        return { ok: false, error: msg, raw: json, input };
      }

      const shipment = json.data?.saveShipment;
      if (!shipment?.code && !shipment?.id) {
        return {
          ok: false,
          error: 'Accuratess لم يُرجع رقم شحنة',
          raw: json,
          input,
        };
      }

      this.logger.log(
        `Accuratess shipment created code=${shipment.code || shipment.id} order=${payload.orderNumber}`,
      );
      return { ok: true, shipment, raw: json, input };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Accuratess network error';
      this.logger.error(message);
      return { ok: false, error: message };
    }
  }

  async getShipment(code: string, account?: AccuratessAccountCreds | null) {
    if (!this.isConfigured(account)) {
      return {
        skipped: true,
        reason: 'ACCURATESS غير مفعّل',
      };
    }

    const query = `
      query Shipment($code: String!) {
        shipment(code: $code) {
          id
          code
          status { code name }
          trackingUrl
          refNumber
          notes
        }
      }
    `;

    try {
      const json = await this.gql<{
        shipment?: {
          id?: string;
          code?: string;
          status?: string | { code?: string; name?: string };
          trackingUrl?: string;
          refNumber?: string;
          notes?: string;
        };
      }>(query, { code }, account);

      if (json.errors?.length) {
        const alt = `
          query Find($code: String!) {
            listShipments(first: 1, input: { code: $code }) {
              data {
                id
                code
                status { code name }
                trackingUrl
                refNumber
                notes
              }
            }
          }
        `;
        const altJson = await this.gql<{
          listShipments?: {
            data?: Array<{
              id?: string;
              code?: string;
              status?: string | { code?: string; name?: string };
              trackingUrl?: string;
            }>;
          };
        }>(alt, { code }, account);
        if (altJson.errors?.length) {
          return {
            ok: false,
            error: json.errors.map((e) => e.message).join('; '),
          };
        }
        const shipment = altJson.data?.listShipments?.data?.[0];
        return {
          ok: true,
          shipment: shipment
            ? {
                ...shipment,
                status:
                  typeof shipment.status === 'object'
                    ? shipment.status?.code || shipment.status?.name
                    : shipment.status,
              }
            : undefined,
        };
      }

      const shipment = json.data?.shipment;
      return {
        ok: true,
        shipment: shipment
          ? {
              ...shipment,
              status:
                typeof shipment.status === 'object'
                  ? shipment.status?.code || shipment.status?.name
                  : shipment.status,
            }
          : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Accuratess network error';
      return { ok: false, error: message };
    }
  }

  mapRemoteStatus(remote?: string | null): DeliveryStatus | null {
    if (!remote) return null;
    const s = remote.toString().toLowerCase().replace(/\s+/g, '_');
    if (/(fail|تعذر|undeliver|unable|not_deliver|failed)/.test(s)) return 'FAILED';
    if (/(cancel|ملغي|cancelled|canceled)/.test(s)) return 'FAILED';
    if (/(deliver|تم_التسليم|delivered|completed)/.test(s)) return 'DELIVERED';
    if (/(return|مرتجع|returned)/.test(s)) return 'RETURNED';
    if (/(transit|out|قيد|in_transit|shipping|on_way)/.test(s)) return 'IN_TRANSIT';
    if (/(pick|استلام|picked)/.test(s)) return 'PICKED_UP';
    if (/(assign|assigned|created|new|pending)/.test(s)) return 'ASSIGNED';
    return null;
  }
}
