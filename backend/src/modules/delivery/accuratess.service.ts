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
  price: number;
  deliveryFees?: number;
  sourcePage: string;
  sourcePageCode?: number | null;
  description?: string;
  /** حساب الصفحة الفرعية — إن وُجد يتجاوز التوكن العام */
  account?: AccuratessAccountCreds | null;
};

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

    const input: Record<string, unknown> = {
      senderName: payload.senderName || payload.sourcePage,
      recipientName: payload.recipientName,
      recipientPhone: payload.recipientPhone,
      recipientMobile: payload.recipientMobile || payload.recipientPhone,
      recipientAddress: [payload.recipientAddress, payload.area, payload.city]
        .filter(Boolean)
        .join(' - '),
      price: payload.price,
      notes: [
        payload.notes,
        `الراسل=${sourceLabel}`,
        `reference=${payload.orderNumber}`,
      ]
        .filter(Boolean)
        .join(' | '),
      description:
        payload.description ||
        `طلب ${payload.orderNumber} — الراسل: ${sourceLabel}`,
      refNumber: `PAGE:${sourceLabel}|ORD:${payload.orderNumber}`,
    };

    if (payload.deliveryFees != null) {
      input.notes = `${input.notes} | delivery_fee=${payload.deliveryFees}`;
    }

    const senderZoneId =
      payload.account?.senderZoneId ||
      this.config.get<string>('ACCURATESS_SENDER_ZONE_ID');
    const senderSubzoneId =
      payload.account?.senderSubzoneId ||
      this.config.get<string>('ACCURATESS_SENDER_SUBZONE_ID');
    const recipientZoneId = this.config.get<string>('ACCURATESS_DEFAULT_RECIPIENT_ZONE_ID');
    const recipientSubzoneId = this.config.get<string>(
      'ACCURATESS_DEFAULT_RECIPIENT_SUBZONE_ID',
    );
    if (senderZoneId) input.senderZoneId = Number(senderZoneId);
    if (senderSubzoneId) input.senderSubzoneId = Number(senderSubzoneId);
    if (recipientZoneId) input.recipientZoneId = Number(recipientZoneId);
    if (recipientSubzoneId) input.recipientSubzoneId = Number(recipientSubzoneId);

    const query = `
      mutation SaveShipment($input: ShipmentInput!) {
        saveShipment(input: $input) {
          id
          code
          trackingUrl
          refNumber
          notes
          description
          status
        }
      }
    `;

    try {
      const json = await this.gql<{ saveShipment?: Record<string, unknown> }>(
        query,
        { input },
        payload.account,
      );

      if (json.errors?.length) {
        const msg = json.errors.map((e) => e.message).join('; ');
        this.logger.error(`Accuratess saveShipment failed: ${msg}`);
        return { ok: false, error: msg, raw: json };
      }

      return { ok: true, shipment: json.data?.saveShipment, raw: json };
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
          status
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
          status?: string;
          trackingUrl?: string;
          refNumber?: string;
          notes?: string;
        };
      }>(query, { code }, account);

      if (json.errors?.length) {
        const alt = `
          query Find($code: String!) {
            findShipments(input: { code: $code }) {
              id
              code
              status
              trackingUrl
              refNumber
              notes
            }
          }
        `;
        const altJson = await this.gql<{
          findShipments?: Array<{
            id?: string;
            code?: string;
            status?: string;
            trackingUrl?: string;
          }>;
        }>(alt, { code }, account);
        if (altJson.errors?.length) {
          return {
            ok: false,
            error: json.errors.map((e) => e.message).join('; '),
          };
        }
        const shipment = altJson.data?.findShipments?.[0];
        return { ok: true, shipment };
      }

      return { ok: true, shipment: json.data?.shipment };
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
