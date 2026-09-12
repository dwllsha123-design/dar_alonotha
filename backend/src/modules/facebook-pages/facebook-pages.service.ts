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
  CreatePageStaffDto,
  SetPageCredentialsDto,
  UpdateFacebookPageDto,
  UpsertShippingAccountDto,
} from './dto/facebook-page.dto';
import * as bcrypt from 'bcrypt';
import { ROLE_CODES } from '../../common/permissions';
import { assertCanUseFacebookPage } from '../../common/order-access';

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
      const shippingAccount =
        isAdmin && p.shippingAccount
          ? {
              ...p.shippingAccount,
              apiToken: token
                ? `${token.slice(0, 4)}…${token.slice(-4)}`
                : null,
              hasToken: Boolean(token),
            }
          : null;
      return {
        ...p,
        username: isAdmin ? p.username : undefined,
        passwordHash: undefined,
        hasCredentials: Boolean(p.username && p.passwordHash),
        ...links,
        shippingAccount,
        employees: isAdmin
          ? p.employees
          : p.employees.filter((e) => e.userId === user.id),
        members: {
          manager: isAdmin ? p.manager : null,
          admins: isAdmin
            ? p.employees.filter((e) => e.role === 'ADMIN')
            : [],
          agents: isAdmin
            ? p.employees.filter((e) => e.role === 'AGENT')
            : p.employees.filter((e) => e.userId === user.id),
        },
      };
    });
  }

  async findOne(user: AuthUser, id: string) {
    await assertCanUseFacebookPage(this.prisma, user, id);
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

    const isAdmin =
      user.roles.includes('super_admin') || user.roles.includes('admin');
    const safe = isAdmin
      ? page
      : {
          ...page,
          username: undefined,
          passwordHash: undefined,
          shippingAccount: undefined,
          employees: page.employees.filter((e) => e.userId === user.id),
        };

    return {
      ...safe,
      ...this.linksFor(page.publicCode),
      agents: isAdmin
        ? page.employees
            .filter((e) => e.role === 'AGENT' && e.agentCode != null)
            .map((e) => ({
              userId: e.userId,
              name: e.user.name,
              agentCode: e.agentCode,
              ...this.linksFor(page.publicCode, e.agentCode),
            }))
        : [],
    };
  }

  /** Admin/manage reads — no page-employee redaction. */
  private async adminFindOne(id: string) {
    const adminUser: AuthUser = {
      id: 'system',
      name: 'system',
      roles: ['admin'],
      permissions: [],
    };
    return this.findOne(adminUser, id);
  }

  async create(dto: CreateFacebookPageDto) {
    const publicCode =
      dto.publicCode ?? (await this.codes.nextCode('page_public_code', 1025));

    const notes = [
      dto.notes?.trim(),
      dto.internalLabel?.trim() ? `تعريفي: ${dto.internalLabel.trim()}` : '',
      dto.facebookUrl?.trim() ? `رابط فيسبوك: ${dto.facebookUrl.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n') || undefined;

    return this.prisma.facebookPage.create({
      data: {
        name: dto.name,
        publicCode,
        pageId: dto.pageId,
        managerId: dto.managerId,
        notes,
      },
    });
  }

  async update(id: string, dto: UpdateFacebookPageDto) {
    const page = await this.prisma.facebookPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');
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

    return this.adminFindOne(pageId);
  }

  /**
   * Create a sales_agent user and assign to this page (admin page-management flow).
   * Does not grant system ADMIN — only sales_agent + page role.
   */
  async createStaff(pageId: string, dto: CreatePageStaffDto) {
    const page = await this.prisma.facebookPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('أدخلي هاتفاً أو بريداً للموظفة');
    }

    const salesRole = await this.prisma.role.findUnique({
      where: { code: ROLE_CODES.SALES_AGENT },
    });
    if (!salesRole) throw new BadRequestException('دور موظفة المبيعات غير مُعرّف');

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          dto.phone ? { phone: dto.phone } : undefined,
          dto.email ? { email: dto.email } : undefined,
        ].filter(Boolean) as Array<{ phone?: string; email?: string }>,
      },
    });
    if (existing) {
      throw new BadRequestException('يوجد حساب بنفس الهاتف أو البريد — عيّنيها كموظفة موجودة');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const employmentType = dto.employmentType ?? 'COMMISSION';

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        status: 'ACTIVE',
        employmentType,
        monthlySalary:
          employmentType === 'SALARY' ? dto.monthlySalary ?? 0 : null,
        roles: { create: [{ roleId: salesRole.id }] },
      },
    });

    await this.assignMember(pageId, { userId: user.id, role: dto.role });

    if (
      employmentType === 'COMMISSION' &&
      dto.commissionPerPiece != null &&
      dto.commissionPerPiece >= 0
    ) {
      await this.upsertAgentPieceRule(
        pageId,
        user.id,
        dto.commissionPerPiece,
      );
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        employmentType: user.employmentType,
        monthlySalary: user.monthlySalary,
        status: user.status,
      },
      pageId,
      role: dto.role,
    };
  }

  async upsertAgentPieceRule(
    pageId: string,
    agentUserId: string,
    perPiece: number,
  ) {
    const existing = await this.prisma.commissionRule.findFirst({
      where: { pageId, agentUserId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.prisma.commissionRule.update({
        where: { id: existing.id },
        data: {
          type: 'PER_ITEM',
          fixedAmount: perPiece,
          ratePercent: 0,
          nameAr: existing.nameAr,
        },
      });
    }
    return this.prisma.commissionRule.create({
      data: {
        nameAr: `عمولة قطعة — صفحة`,
        type: 'PER_ITEM',
        fixedAmount: perPiece,
        ratePercent: 0,
        pageId,
        agentUserId,
        source: 'FACEBOOK',
        isActive: true,
      },
    });
  }

  async updateMemberEmployment(
    pageId: string,
    userId: string,
    dto: {
      employmentType?: 'NONE' | 'SALARY' | 'COMMISSION';
      monthlySalary?: number;
      commissionPerPiece?: number;
      role?: PageMemberRole;
    },
  ) {
    const link = await this.prisma.facebookPageEmployee.findUnique({
      where: { pageId_userId: { pageId, userId } },
    });
    if (!link) throw new NotFoundException('الموظفة غير مُعيَّنة على هذه الصفحة');

    if (dto.role) {
      await this.assignMember(pageId, { userId, role: dto.role });
    }

    if (dto.employmentType || dto.monthlySalary !== undefined) {
      const data: {
        employmentType?: 'NONE' | 'SALARY' | 'COMMISSION';
        monthlySalary?: number | null;
      } = {};
      if (dto.employmentType) data.employmentType = dto.employmentType;
      if (dto.employmentType === 'SALARY') {
        data.monthlySalary = dto.monthlySalary ?? 0;
      } else if (dto.employmentType === 'COMMISSION' || dto.employmentType === 'NONE') {
        data.monthlySalary = null;
      } else if (dto.monthlySalary !== undefined) {
        data.monthlySalary = dto.monthlySalary;
      }
      await this.prisma.user.update({ where: { id: userId }, data });
    }

    if (dto.commissionPerPiece != null) {
      await this.upsertAgentPieceRule(pageId, userId, dto.commissionPerPiece);
    }

    return this.analyticsSafeEmployees(pageId);
  }

  private async analyticsSafeEmployees(pageId: string) {
    return this.prisma.facebookPageEmployee.findMany({
      where: { pageId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
            employmentType: true,
            monthlySalary: true,
          },
        },
      },
    });
  }

  async removeMember(pageId: string, userId: string) {
    await this.prisma.facebookPageEmployee.delete({
      where: { pageId_userId: { pageId, userId } },
    });
    return this.adminFindOne(pageId);
  }

  /** Legacy helper kept for older admin UI */
  async assignEmployees(id: string, userIds: string[]) {
    for (const userId of userIds) {
      await this.assignMember(id, { userId, role: PageMemberRole.AGENT });
    }
    return this.adminFindOne(id);
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

      return this.adminFindOne(pageId);
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
