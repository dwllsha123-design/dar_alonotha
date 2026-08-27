import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PageMemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CodeSequenceService } from '../inventory/services/code-sequence.service';
import { ConfigService } from '@nestjs/config';
import {
  AssignMemberDto,
  CreateFacebookPageDto,
  SetPageCredentialsDto,
  UpdateFacebookPageDto,
  UpsertShippingAccountDto,
} from './dto/facebook-page.dto';
import * as bcrypt from 'bcrypt';
import { ROLE_CODES } from '../../common/permissions';

@Injectable()
export class FacebookPagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeSequenceService,
    private readonly config: ConfigService,
  ) {}

  private storeUrl() {
    return (this.config.get<string>('STORE_URL') || 'http://localhost:5174').replace(/\/$/, '');
  }

  private apiUrl() {
    return (this.config.get<string>('APP_URL') || 'http://localhost:3000').replace(/\/$/, '');
  }

  private linksFor(pageCode: number, agentCode?: number | null) {
    const shortPath =
      agentCode != null ? `/r/${pageCode}/${agentCode}` : `/r/${pageCode}`;
    return {
      referralLink: shortPath,
      shortUrl: `${this.apiUrl()}${shortPath}`,
      storefrontUrl:
        agentCode != null
          ? `${this.storeUrl()}/?page=${pageCode}&agent=${agentCode}`
          : `${this.storeUrl()}/?page=${pageCode}`,
    };
  }

  async findAll(user: AuthUser) {
    const isAdmin =
      user.roles.includes('super_admin') || user.roles.includes('admin');

    const pages = await this.prisma.facebookPage.findMany({
      where: isAdmin
        ? undefined
        : { employees: { some: { userId: user.id } }, status: 'ACTIVE' },
      include: {
        manager: { select: { id: true, name: true, phone: true } },
        employees: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        shippingAccount: {
          select: {
            id: true,
            label: true,
            pageIdentifier: true,
            endpoint: true,
            senderZoneId: true,
            senderSubzoneId: true,
            isActive: true,
            notes: true,
            updatedAt: true,
            /** لا نُرجع التوكن كاملاً في القائمة */
            apiToken: true,
          },
        },
        _count: { select: { orders: true } },
      },
      orderBy: { publicCode: 'asc' },
    });

    return pages.map((p) => {
      const links = this.linksFor(p.publicCode);
      const token = p.shippingAccount?.apiToken;
      return {
        ...p,
        username: p.username,
        hasCredentials: Boolean(p.username && p.passwordHash),
        ...links,
        shippingAccount: p.shippingAccount
          ? {
              ...p.shippingAccount,
              apiToken: token
                ? `${token.slice(0, 4)}…${token.slice(-4)}`
                : null,
              hasToken: Boolean(token),
            }
          : null,
        members: {
          manager: p.manager,
          admins: p.employees.filter((e) => e.role === 'ADMIN'),
          agents: p.employees.filter((e) => e.role === 'AGENT'),
        },
      };
    });
  }

  async findOne(id: string) {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, phone: true } },
        employees: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            pagePublicCode: true,
            agentPublicCode: true,
            createdAt: true,
          },
        },
      },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');
    return {
      ...page,
      ...this.linksFor(page.publicCode),
      agents: page.employees
        .filter((e) => e.role === 'AGENT' && e.agentCode != null)
        .map((e) => ({
          userId: e.userId,
          name: e.user.name,
          agentCode: e.agentCode,
          ...this.linksFor(page.publicCode, e.agentCode),
        })),
    };
  }

  async create(dto: CreateFacebookPageDto) {
    const publicCode =
      dto.publicCode ?? (await this.codes.nextCode('page_public_code', 1025));

    return this.prisma.facebookPage.create({
      data: {
        name: dto.name,
        publicCode,
        pageId: dto.pageId,
        managerId: dto.managerId,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateFacebookPageDto) {
    await this.findOne(id);
    return this.prisma.facebookPage.update({ where: { id }, data: dto });
  }

  async assignMember(pageId: string, dto: AssignMemberDto) {
    const page = await this.prisma.facebookPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('المستخدم غير موجود');

    if (dto.role === 'ADMIN') {
      const admins = await this.prisma.facebookPageEmployee.count({
        where: { pageId, role: 'ADMIN' },
      });
      const existing = await this.prisma.facebookPageEmployee.findUnique({
        where: { pageId_userId: { pageId, userId: dto.userId } },
      });
      if (!existing && admins >= 2) {
        throw new BadRequestException('الحد الأقصى أدمنان لكل صفحة');
      }
    }

    if (dto.role === 'MANAGER') {
      await this.prisma.facebookPage.update({
        where: { id: pageId },
        data: { managerId: dto.userId },
      });
    }

    let agentCode = dto.agentCode ?? null;
    if (dto.role === 'AGENT') {
      agentCode =
        dto.agentCode ?? (await this.codes.nextCode('agent_public_code', 2050));
    } else {
      agentCode = null;
    }

    await this.prisma.facebookPageEmployee.upsert({
      where: { pageId_userId: { pageId, userId: dto.userId } },
      create: {
        pageId,
        userId: dto.userId,
        role: dto.role,
        agentCode,
      },
      update: {
        role: dto.role,
        agentCode,
      },
    });

    return this.findOne(pageId);
  }

  async removeMember(pageId: string, userId: string) {
    await this.prisma.facebookPageEmployee.delete({
      where: { pageId_userId: { pageId, userId } },
    });
    return this.findOne(pageId);
  }

  /** Legacy helper kept for older admin UI */
  async assignEmployees(id: string, userIds: string[]) {
    for (const userId of userIds) {
      await this.assignMember(id, { userId, role: PageMemberRole.AGENT });
    }
    return this.findOne(id);
  }

  async setCredentials(pageId: string, dto: SetPageCredentialsDto) {
    const page = await this.prisma.facebookPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const username = dto.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      throw new BadRequestException(
        'اسم المستخدم بالإنجليزية فقط (حروف وأرقام و . _ -)',
      );
    }

    const taken = await this.prisma.facebookPage.findFirst({
      where: { username, NOT: { id: pageId } },
    });
    if (taken) throw new BadRequestException('اسم المستخدم مستخدم لصفحة أخرى');

    const branchTaken = await this.prisma.branch.findUnique({ where: { username } });
    if (branchTaken) throw new BadRequestException('اسم المستخدم مستخدم لفرع آخر');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const salesRole = await this.prisma.role.findUnique({
      where: { code: ROLE_CODES.SALES_AGENT },
    });
    if (!salesRole) throw new BadRequestException('دور المبيعات غير مُعرّف');

    return this.prisma.$transaction(async (tx) => {
      let portalUserId = page.portalUserId;

      if (!portalUserId) {
        const portalUser = await tx.user.create({
          data: {
            name: `صفحة ${page.name}`,
            email: `page_${username}@page.local`,
            passwordHash,
            status: 'ACTIVE',
            roles: { create: [{ roleId: salesRole.id }] },
          },
        });
        portalUserId = portalUser.id;
      } else {
        await tx.user.update({
          where: { id: portalUserId },
          data: { passwordHash },
        });
      }

      await tx.facebookPage.update({
        where: { id: pageId },
        data: { username, passwordHash, portalUserId },
      });

      await tx.facebookPageEmployee.upsert({
        where: { pageId_userId: { pageId, userId: portalUserId } },
        create: {
          pageId,
          userId: portalUserId,
          role: PageMemberRole.MANAGER,
        },
        update: { role: PageMemberRole.MANAGER },
      });

      return this.findOne(pageId);
    });
  }

  async remove(id: string) {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');
    if (page._count.orders > 0) {
      throw new BadRequestException(
        'لا يمكن حذف صفحة لها طلبات مسجّلة. أوقفيها حتى لا تُستخدم في روابط جديدة.',
      );
    }
    await this.prisma.facebookPage.delete({ where: { id } });
    return { ok: true };
  }

  async upsertShippingAccount(pageId: string, dto: UpsertShippingAccountDto) {
    const page = await this.prisma.facebookPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const saved = await this.prisma.externalShippingAccount.upsert({
      where: { facebookPageId: pageId },
      create: {
        facebookPageId: pageId,
        label: dto.label || page.name,
        pageIdentifier: dto.pageIdentifier || page.name,
        apiToken: dto.apiToken,
        endpoint: dto.endpoint,
        senderZoneId: dto.senderZoneId,
        senderSubzoneId: dto.senderSubzoneId,
        isActive: dto.isActive ?? true,
        notes: dto.notes,
      },
      update: {
        label: dto.label || page.name,
        pageIdentifier: dto.pageIdentifier || page.name,
        apiToken: dto.apiToken,
        endpoint: dto.endpoint,
        senderZoneId: dto.senderZoneId,
        senderSubzoneId: dto.senderSubzoneId,
        isActive: dto.isActive ?? true,
        notes: dto.notes,
      },
    });

    return {
      ...saved,
      apiToken: `${saved.apiToken.slice(0, 4)}…${saved.apiToken.slice(-4)}`,
      hasToken: true,
    };
  }

  async removeShippingAccount(pageId: string) {
    await this.prisma.externalShippingAccount.deleteMany({
      where: { facebookPageId: pageId },
    });
    return { ok: true };
  }
}
