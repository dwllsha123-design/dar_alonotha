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
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.roleCodes) {
        const roles = await tx.role.findMany({
          where: { code: { in: dto.roleCodes } },
        });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        });
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
    return { profile, salaries, commissions };
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
