import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateUserDto,
  MarketerRegisterDto,
  UpdateUserDto,
} from './dto/user.dto';
import {
  CreateSalaryPaymentDto,
  UpdateSalaryPaymentStatusDto,
} from './dto/payroll.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ROLE_CODES } from '../../common/permissions';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        locale: true,
        employmentType: true,
        monthlySalary: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { nameAr: 'asc' },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  pendingMarketers() {
    return this.prisma.user.findMany({
      where: {
        status: 'PENDING',
        roles: { some: { role: { code: ROLE_CODES.SALES_AGENT } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        facebookPages: { include: { page: true } },
      },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async create(dto: CreateUserDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('يجب إدخال بريد أو هاتف');
    }

    const roles = await this.prisma.role.findMany({
      where: { code: { in: dto.roleCodes } },
    });
    if (roles.length !== dto.roleCodes.length) {
      throw new BadRequestException('دور غير صالح');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        employmentType: dto.employmentType ?? 'NONE',
        monthlySalary: dto.monthlySalary,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        employmentType: true,
        monthlySalary: true,
        roles: { include: { role: true } },
      },
    });
  }

  async registerMarketer(dto: MarketerRegisterDto) {
    if (!dto.phone) throw new BadRequestException('رقم الهاتف مطلوب');
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          dto.email ? { email: dto.email } : undefined,
        ].filter(Boolean) as Array<{ phone?: string; email?: string }>,
      },
    });
    if (existing) {
      throw new BadRequestException('يوجد حساب بهذا الهاتف أو البريد');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: ROLE_CODES.SALES_AGENT },
    });
    if (!role) throw new BadRequestException('دور المسوق غير مُعرّف');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        status: 'PENDING',
        locale: 'ar',
        roles: { create: [{ roleId: role.id }] },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'marketer.register',
        entityType: 'User',
        entityId: user.id,
        meta: { phone: dto.phone, city: dto.city || 'طرابلس' },
      },
    });

    await this.notifications.notifyAdmins({
      titleAr: `مسوق جديد بانتظار الموافقة: ${user.name}`,
      bodyAr: `هاتف: ${user.phone}${dto.city ? ` — ${dto.city}` : ' — طرابلس'}`,
      type: 'MARKETER_PENDING',
      entityType: 'User',
      entityId: user.id,
    });

    return {
      message: 'تم إرسال طلبك. ستتمكن من الدخول بعد موافقة الإدارة.',
      user,
    };
  }

  async approveMarketer(actor: AuthUser, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    const isAgent = user.roles.some((r) => r.role.code === ROLE_CODES.SALES_AGENT);
    if (!isAgent) {
      throw new BadRequestException('المستخدم ليس مسوقاً');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        roles: { include: { role: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'marketer.approve',
        entityType: 'User',
        entityId: id,
      },
    });

    await this.notifications.notifyUsers([id], {
      titleAr: 'تمت الموافقة على حسابك',
      bodyAr: 'يمكنك الآن تسجيل الدخول وإدخال الطلبات.',
      type: 'MARKETER_APPROVED',
      entityType: 'User',
      entityId: id,
    });

    return updated;
  }

  async rejectMarketer(actor: AuthUser, id: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: { id: true, name: true, status: true },
    });
    await this.prisma.authSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'marketer.reject',
        entityType: 'User',
        entityId: id,
      },
    });
    await this.notifications.notifyUsers([id], {
      titleAr: 'لم تتم الموافقة على طلب التسجيل',
      bodyAr: 'يمكنك التواصل مع الإدارة لمزيد من التفاصيل.',
      type: 'MARKETER_REJECTED',
      entityType: 'User',
      entityId: id,
    });
    return updated;
  }

  async update(id: string, dto: UpdateUserDto) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!before) throw new NotFoundException('المستخدم غير موجود');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.roleCodes !== undefined) {
        if (!Array.isArray(dto.roleCodes) || dto.roleCodes.length === 0) {
          // omit empty → preserve roles (do not wipe)
        } else {
          const roles = await tx.role.findMany({
            where: { code: { in: dto.roleCodes } },
          });
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.createMany({
            data: roles.map((r) => ({ userId: id, roleId: r.id })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          status: dto.status,
          employmentType: dto.employmentType,
          monthlySalary: dto.monthlySalary,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          employmentType: true,
          monthlySalary: true,
          roles: { include: { role: true } },
        },
      });
    });

    // Immediate session kill when account leaves ACTIVE
    if (
      dto.status &&
      dto.status !== 'ACTIVE' &&
      before.status === 'ACTIVE'
    ) {
      await this.prisma.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  }

  async myPayroll(user: AuthUser) {
    const [salaries, commissions] = await Promise.all([
      this.prisma.salaryPayment.findMany({
        where: { userId: user.id },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 24,
      }),
      this.prisma.commissionEntry.findMany({
        where: { agentUserId: user.id },
        include: {
          order: {
            select: {
              orderNumber: true,
              totalAmount: true,
              createdAt: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        employmentType: true,
        monthlySalary: true,
        name: true,
      },
    });

    const earned = commissions.filter((c) => c.status !== 'CANCELLED');
    const voided = commissions.filter((c) => c.status === 'CANCELLED');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const earnedThisMonth = earned.filter(
      (c) => new Date(c.createdAt) >= monthStart,
    );

    return {
      profile,
      salaries,
      commissions,
      summary: {
        earnedAmount: earned.reduce((s, c) => s + Number(c.amount), 0),
        earnedPieces: earned.reduce((s, c) => s + c.itemCount, 0),
        earnedOrders: earned.length,
        voidedAmount: voided.reduce((s, c) => s + Number(c.amount), 0),
        monthAmount: earnedThisMonth.reduce((s, c) => s + Number(c.amount), 0),
        monthPieces: earnedThisMonth.reduce((s, c) => s + c.itemCount, 0),
        monthOrders: earnedThisMonth.length,
      },
    };
  }

  /** Restricted dashboard for Facebook page employees */
  async staffHome(user: AuthUser) {
    const memberships = await this.prisma.facebookPageEmployee.findMany({
      where: { userId: user.id },
      select: { pageId: true, page: { select: { id: true, name: true, status: true } } },
    });
    const pageIds = memberships.map((p) => p.pageId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);

    // Phase 1.5: only orders on currently assigned pages
    const pageScope = { facebookPageId: { in: pageIds } };

    const [
      ordersToday,
      deliveredMonth,
      inProgress,
      cancelledMonth,
      profile,
      commissionsMonth,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { ...pageScope, createdAt: { gte: today } },
      }),
      this.prisma.order.count({
        where: {
          ...pageScope,
          status: 'DELIVERED',
          createdAt: { gte: month },
        },
      }),
      this.prisma.order.count({
        where: {
          ...pageScope,
          status: {
            in: [
              'NEW',
              'CONFIRMED',
              'PREPARING',
              'READY',
              'ASSIGNED',
              'OUT_FOR_DELIVERY',
            ],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          ...pageScope,
          status: { in: ['CANCELLED', 'RETURNED'] },
          createdAt: { gte: month },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          employmentType: true,
          monthlySalary: true,
        },
      }),
      this.prisma.commissionEntry.aggregate({
        where: {
          agentUserId: user.id,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          createdAt: { gte: month },
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      profile,
      pages: memberships.map((m) => m.page),
      kpis: {
        ordersToday,
        deliveredMonth,
        inProgress,
        cancelledMonth,
        commissionMonth: Number(commissionsMonth._sum.amount || 0),
        monthlySalary: profile?.monthlySalary
          ? Number(profile.monthlySalary)
          : null,
        employmentType: profile?.employmentType || 'NONE',
      },
    };
  }

  async pageStaffProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        employmentType: true,
        monthlySalary: true,
        roles: { include: { role: { select: { code: true, nameAr: true } } } },
        facebookPages: {
          include: {
            page: {
              select: { id: true, name: true, status: true, publicCode: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const pageIds = user.facebookPages.map((fp) => fp.pageId);

    const [ordersToday, ordersMonth, delivered, cancelled, commissionAgg, recent] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            salesAgentId: id,
            facebookPageId: { in: pageIds },
            createdAt: { gte: today },
          },
        }),
        this.prisma.order.count({
          where: {
            salesAgentId: id,
            facebookPageId: { in: pageIds },
            createdAt: { gte: month },
          },
        }),
        this.prisma.order.count({
          where: {
            salesAgentId: id,
            facebookPageId: { in: pageIds },
            status: 'DELIVERED',
          },
        }),
        this.prisma.order.count({
          where: {
            salesAgentId: id,
            facebookPageId: { in: pageIds },
            status: { in: ['CANCELLED', 'RETURNED'] },
          },
        }),
        this.prisma.commissionEntry.aggregate({
          where: {
            agentUserId: id,
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          },
          _sum: { amount: true },
        }),
        this.prisma.order.findMany({
          where: {
            salesAgentId: id,
            facebookPageId: { in: pageIds },
          },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            facebookPage: { select: { id: true, name: true } },
            shippingName: true,
          },
        }),
      ]);

    return {
      user,
      pages: user.facebookPages.map((fp) => ({
        pageId: fp.pageId,
        role: fp.role,
        agentCode: fp.agentCode,
        assignedAt: fp.assignedAt,
        page: fp.page,
      })),
      kpis: {
        ordersToday,
        ordersMonth,
        delivered,
        cancelled,
        commissionTotal: Number(commissionAgg._sum.amount || 0),
      },
      recentOrders: recent,
    };
  }

  listSalaryPayments(userId?: string) {
    return this.prisma.salaryPayment.findMany({
      where: userId ? { userId } : undefined,
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 200,
    });
  }

  async createSalaryPayment(dto: CreateSalaryPaymentDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.employmentType !== 'SALARY') {
      throw new BadRequestException('هذا الموظف ليس براتب شهري');
    }
    const amount = dto.amount ?? Number(user.monthlySalary || 0);
    if (amount <= 0) {
      throw new BadRequestException('حدّد الراتب الشهري للموظف أولاً');
    }
    return this.prisma.salaryPayment.upsert({
      where: {
        userId_year_month: {
          userId: dto.userId,
          year: dto.year,
          month: dto.month,
        },
      },
      create: {
        userId: dto.userId,
        year: dto.year,
        month: dto.month,
        amount,
        notes: dto.notes,
      },
      update: {
        amount,
        notes: dto.notes,
      },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async updateSalaryPaymentStatus(
    id: string,
    dto: UpdateSalaryPaymentStatusDto,
  ) {
    const row = await this.prisma.salaryPayment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('سجل الراتب غير موجود');
    return this.prisma.salaryPayment.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === 'PAID' ? new Date() : row.paidAt,
      },
    });
  }
}
