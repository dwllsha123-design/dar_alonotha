import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  parseDurationMs,
  SessionMeta,
} from '../../common/client-context';
import { ClientPlatform } from '@prisma/client';
import { BranchSession, PagePortalSession } from '../../common/decorators/current-user.decorator';

type UserWithRoles = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
  roles: string[];
  permissions: string[];
  branch: BranchSession | null;
  pagePortal: PagePortalSession | null;
};

function toPagePortalSession(page: {
  id: string;
  name: string;
  username: string | null;
  publicCode: number;
} | null | undefined): PagePortalSession | null {
  if (!page?.username) return null;
  return {
    id: page.id,
    name: page.name,
    username: page.username,
    publicCode: page.publicCode,
  };
}

function toBranchSession(branch: {
  id: string;
  name: string;
  username: string;
  type: 'WHOLESALE_RETAIL' | 'RETAIL';
  isMain: boolean;
  warehouseId: string;
} | null | undefined): BranchSession | null {
  if (!branch) return null;
  return {
    id: branch.id,
    name: branch.name,
    username: branch.username,
    type: branch.type,
    isMain: branch.isMain,
    warehouseId: branch.warehouseId,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, meta?: SessionMeta) {
    const identifier = (dto.identifier || dto.email || dto.phone || '').trim();
    const branchUserId = await this.tryBranchLogin(identifier, dto.password);
    const pageUserId = branchUserId
      ? null
      : await this.tryPageLogin(identifier, dto.password);
    const portalUserId = branchUserId ?? pageUserId;
    const user = portalUserId
      ? await this.prisma.user.findUnique({
          where: { id: portalUserId },
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        })
      : await this.findUserByLogin(dto);
    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    if (user.status === 'PENDING') {
      throw new UnauthorizedException('حسابك بانتظار موافقة الإدارة');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('الحساب غير مفعّل');
    }

    if (!branchUserId && !pageUserId) {
      const valid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('بيانات الدخول غير صحيحة');
      }
    }

    return this.issueForUser(user.id, meta);
  }

  private async tryBranchLogin(identifier: string, password: string) {
    if (!identifier) return null;
    const lowered = identifier.toLowerCase();
    try {
      const branch = await this.prisma.branch.findFirst({
        where: {
          isActive: true,
          OR: [{ username: identifier }, { username: lowered }],
        },
      });
      if (!branch) return null;
      const valid = await bcrypt.compare(password, branch.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('بيانات الدخول غير صحيحة');
      }
      return branch.userId;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      return null;
    }
  }

  private phoneVariants(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return [];
    const out = new Set<string>([digits, raw.trim()]);
    if (digits.startsWith('218') && digits.length >= 12) out.add(`0${digits.slice(3)}`);
    if (digits.startsWith('00') && digits.length > 4) out.add(digits.slice(2));
    if (digits.length === 9 && digits.startsWith('9')) out.add(`0${digits}`);
    if (digits.startsWith('0') && digits.length === 10) out.add(digits.slice(1));
    return [...out];
  }

  private looksLikePhone(raw: string) {
    const compact = raw.replace(/[\s-]/g, '');
    return /^(\+?218|0)?9\d{8}$/.test(compact) || /^\d{8,15}$/.test(compact.replace(/\D/g, ''));
  }

  private async findUserByLogin(dto: LoginDto) {
    const raw = (dto.identifier || dto.email || dto.phone || '').trim();
    if (!raw) {
      throw new BadRequestException('أدخل رقم الهاتف أو اسم المستخدم أو البريد');
    }

    const lowered = raw.toLowerCase();
    const asPhone = this.looksLikePhone(raw) || Boolean(dto.phone && !dto.identifier && !dto.email);
    const asEmail = raw.includes('@') || Boolean(dto.email && !dto.identifier);
    const phones = this.phoneVariants(raw);
    const or: Array<Record<string, unknown>> = [];

    if (asPhone && phones.length) {
      or.push({ phone: { in: phones } });
    } else if (asEmail) {
      or.push({ email: raw }, { email: lowered });
    } else {
      or.push({ email: raw }, { email: lowered }, { name: raw });
      or.push({ email: { startsWith: `${lowered}@` } });
    }

    const matches = await this.prisma.user.findMany({
      where: { OR: or as never },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
      take: 8,
    });

    if (!matches.length) return null;

    const ranked = matches
      .map((u) => {
        let score = 0;
        const storedDigits = (u.phone || '').replace(/\D/g, '');
        if (u.phone && (phones.includes(u.phone) || phones.includes(storedDigits))) score += 30;
        if (u.email && (u.email === raw || u.email.toLowerCase() === lowered)) score += 25;
        if (!asPhone && u.email && u.email.toLowerCase().startsWith(`${lowered}@`)) score += 15;
        if (!asPhone && !asEmail && u.name === raw) score += 8;
        return { u, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.u ?? null;
  }

  async issueForUser(userId: string, meta?: SessionMeta) {
    const profile = await this.loadProfile(userId);
    if (!profile) {
      throw new UnauthorizedException();
    }

    const accessTtlMs = parseDurationMs(
      this.config.get<string>('JWT_EXPIRES_IN'),
      7 * 86_400_000,
    );
    const refreshTtlMs = parseDurationMs(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      30 * 86_400_000,
    );

    const accessToken = await this.jwt.signAsync({ sub: profile.id });
    const refreshToken = await this.createRefreshSession(profile.id, meta, refreshTtlMs);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: Math.floor(accessTtlMs / 1000),
      refreshExpiresIn: Math.floor(refreshTtlMs / 1000),
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        locale: profile.locale,
        roles: profile.roles,
        permissions: profile.permissions,
        branch: profile.branch,
        pagePortal: profile.pagePortal,
      },
    };
  }

  async refresh(refreshToken: string, meta?: SessionMeta) {
    const session = await this.findActiveSession(refreshToken);
    if (!session) {
      throw new UnauthorizedException('جلسة غير صالحة أو منتهية');
    }

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueForUser(session.userId, {
      deviceId: meta?.deviceId || session.deviceId || undefined,
      platform: meta?.platform || session.platform,
      appVersion: meta?.appVersion || session.appVersion || undefined,
      userAgent: meta?.userAgent || session.userAgent || undefined,
      ip: meta?.ip || session.ip || undefined,
    });
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { revoked: false };
    }
    const hash = this.hashToken(refreshToken);
    const result = await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count > 0 };
  }

  async logoutAll(userId: string) {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
        facebookPages: { include: { page: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      roles: user.roles.map((r) => r.role.code),
      permissions: [
        ...new Set(
          user.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.code),
          ),
        ),
      ],
      facebookPages: user.facebookPages.map((fp) => ({
        id: fp.page.id,
        name: fp.page.name,
        pageId: fp.page.pageId,
        status: fp.page.status,
      })),
      courier: await this.safeCourier(user.id),
      branch: await this.branchForUser(user.id),
      pagePortal: await this.pagePortalForUser(user.id),
    };
  }

  private async safeCourier(userId: string) {
    try {
      return await this.prisma.courier.findUnique({
        where: { userId },
        select: { id: true, name: true, phone: true, city: true, isActive: true },
      });
    } catch {
      return null;
    }
  }

  async optionalUserId(authorization?: string): Promise<string | undefined> {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(
        authorization.slice(7),
      );
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  private async tryPageLogin(identifier: string, password: string) {
    if (!identifier) return null;
    const lowered = identifier.toLowerCase();
    try {
      const page = await this.prisma.facebookPage.findFirst({
        where: {
          status: 'ACTIVE',
          username: { not: null },
          OR: [{ username: identifier }, { username: lowered }],
        },
      });
      if (!page?.passwordHash || !page.portalUserId) return null;
      const valid = await bcrypt.compare(password, page.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('بيانات الدخول غير صحيحة');
      }
      return page.portalUserId;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      return null;
    }
  }

  private async pagePortalForUser(userId: string) {
    try {
      const page = await this.prisma.facebookPage.findFirst({
        where: { portalUserId: userId, status: 'ACTIVE' },
        select: { id: true, name: true, username: true, publicCode: true },
      });
      return toPagePortalSession(page);
    } catch {
      return null;
    }
  }

  private async branchForUser(userId: string) {
    try {
      const branch = await this.prisma.branch.findUnique({ where: { userId } });
      return toBranchSession(branch);
    } catch {
      return null;
    }
  }

  private async loadProfile(userId: string): Promise<UserWithRoles | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      roles: user.roles.map((r) => r.role.code),
      permissions: [
        ...new Set(
          user.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.code),
          ),
        ),
      ],
      branch: await this.branchForUser(user.id),
      pagePortal: await this.pagePortalForUser(user.id),
    };
  }

  private async createRefreshSession(
    userId: string,
    meta: SessionMeta | undefined,
    ttlMs: number,
  ) {
    const token = randomBytes(48).toString('base64url');
    await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: this.hashToken(token),
        deviceId: meta?.deviceId,
        platform: meta?.platform ?? ClientPlatform.WEB,
        appVersion: meta?.appVersion,
        userAgent: meta?.userAgent,
        ip: meta?.ip,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  private async findActiveSession(refreshToken: string) {
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
    });
    if (!session || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return null;
    }
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    return session;
  }

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }
}
