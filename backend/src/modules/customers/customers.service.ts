import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  getAssignedFacebookPageIds,
  isPageScopedAgent,
} from '../../common/order-access';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, search?: string) {
    const searchWhere = search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { whatsapp: { contains: search } },
          ],
        }
      : undefined;

    if (isPageScopedAgent(user)) {
      const pageIds = await getAssignedFacebookPageIds(this.prisma, user.id);
      return this.prisma.customer.findMany({
        where: {
          AND: [
            searchWhere || {},
            {
              orders: {
                some: {
                  facebookPageId: { in: pageIds },
                },
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
    }

    return this.prisma.customer.findMany({
      where: searchWhere,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            source: true,
            totalAmount: true,
            createdAt: true,
            facebookPageId: true,
            salesAgentId: true,
            createdById: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('العميل غير موجود');

    if (isPageScopedAgent(user)) {
      const pageIds = await getAssignedFacebookPageIds(this.prisma, user.id);
      const visible = customer.orders.filter(
        (o) => o.facebookPageId != null && pageIds.includes(o.facebookPageId),
      );
      if (!visible.length) {
        throw new ForbiddenException('غير مسموح لك بالوصول إلى هذا العميل');
      }
      return { ...customer, orders: visible };
    }

    return customer;
  }

  findByPhone(phone: string) {
    return this.prisma.customer.findUnique({ where: { phone } });
  }

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto) {
    await this.findOne(user, id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }
}
