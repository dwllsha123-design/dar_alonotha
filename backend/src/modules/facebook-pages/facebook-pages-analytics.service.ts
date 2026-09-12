import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseRange(from?: string, to?: string) {
  const gte = from ? new Date(from) : startOfMonth();
  const lte = to ? new Date(to) : new Date();
  if (to && !to.includes('T')) {
    lte.setHours(23, 59, 59, 999);
  }
  return { gte, lte };
}

@Injectable()
export class FacebookPagesAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSummaries() {
    const pages = await this.prisma.facebookPage.findMany({
      orderBy: { publicCode: 'asc' },
      include: {
        _count: { select: { employees: true, orders: true } },
      },
    });

    const today = startOfDay();
    const month = startOfMonth();

    const summaries = await Promise.all(
      pages.map(async (p) => {
        const [todayCount, monthCount, delivered, cancelled, salesAgg, lastOrder] =
          await Promise.all([
            this.prisma.order.count({
              where: { facebookPageId: p.id, createdAt: { gte: today } },
            }),
            this.prisma.order.count({
              where: { facebookPageId: p.id, createdAt: { gte: month } },
            }),
            this.prisma.order.count({
              where: { facebookPageId: p.id, status: 'DELIVERED' },
            }),
            this.prisma.order.count({
              where: {
                facebookPageId: p.id,
                status: { in: ['CANCELLED', 'RETURNED'] },
              },
            }),
            this.prisma.order.aggregate({
              where: {
                facebookPageId: p.id,
                status: 'DELIVERED',
              },
              _sum: { totalAmount: true },
            }),
            this.prisma.order.findFirst({
              where: { facebookPageId: p.id },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                status: true,
                totalAmount: true,
              },
            }),
          ]);

        return {
          id: p.id,
          name: p.name,
          publicCode: p.publicCode,
          status: p.status,
          notes: p.notes,
          pageId: p.pageId,
          employeeCount: p._count.employees,
          orderCount: p._count.orders,
          ordersToday: todayCount,
          ordersMonth: monthCount,
          deliveredCount: delivered,
          cancelledOrReturned: cancelled,
          salesDelivered: Number(salesAgg._sum.totalAmount || 0),
          lastOrder,
        };
      }),
    );

    return summaries;
  }

  async pageDashboard(pageId: string, from?: string, to?: string) {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id: pageId },
      select: { id: true, name: true, status: true, publicCode: true },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const range = parseRange(from, to);
    const today = startOfDay();
    const month = startOfMonth();
    const base: Prisma.OrderWhereInput = { facebookPageId: pageId };

    const [
      ordersToday,
      ordersMonth,
      delivered,
      cancelled,
      returned,
      salesDelivered,
      activeEmployees,
      recentOrders,
      rangeOrders,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { ...base, createdAt: { gte: today } },
      }),
      this.prisma.order.count({
        where: { ...base, createdAt: { gte: month } },
      }),
      this.prisma.order.count({ where: { ...base, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...base, status: 'CANCELLED' } }),
      this.prisma.order.count({ where: { ...base, status: 'RETURNED' } }),
      this.prisma.order.aggregate({
        where: { ...base, status: 'DELIVERED' },
        _sum: { totalAmount: true },
      }),
      this.prisma.facebookPageEmployee.count({
        where: {
          pageId,
          user: { status: 'ACTIVE' },
        },
      }),
      this.prisma.order.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          shippingName: true,
          shippingPhone: true,
          createdAt: true,
          salesAgent: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          ...base,
          createdAt: { gte: range.gte, lte: range.lte },
        },
        select: {
          id: true,
          status: true,
          salesAgentId: true,
          totalAmount: true,
          items: { select: { quantity: true } },
        },
      }),
    ]);

    const totalInRange = rangeOrders.length;
    const deliveredInRange = rangeOrders.filter((o) => o.status === 'DELIVERED').length;
    const deliveryRate =
      totalInRange > 0 ? Math.round((deliveredInRange / totalInRange) * 1000) / 10 : 0;

    const byAgent = new Map<
      string,
      { agentId: string; delivered: number; orders: number; pieces: number }
    >();
    for (const o of rangeOrders) {
      if (!o.salesAgentId) continue;
      const row = byAgent.get(o.salesAgentId) || {
        agentId: o.salesAgentId,
        delivered: 0,
        orders: 0,
        pieces: 0,
      };
      row.orders += 1;
      if (o.status === 'DELIVERED') {
        row.delivered += 1;
        row.pieces += o.items.reduce((s, i) => s + i.quantity, 0);
      }
      byAgent.set(o.salesAgentId, row);
    }
    const agentIds = [...byAgent.keys()];
    const agents = await this.prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const nameById = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    const topEmployees = [...byAgent.values()]
      .map((r) => ({
        ...r,
        name: nameById[r.agentId] || 'موظفة',
      }))
      .sort((a, b) => b.delivered - a.delivered)
      .slice(0, 5);

    return {
      page,
      kpis: {
        ordersToday,
        ordersMonth,
        delivered,
        cancelled,
        returned,
        salesDelivered: Number(salesDelivered._sum.totalAmount || 0),
        activeEmployees,
        deliveryRate,
      },
      recentOrders,
      topEmployees,
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
    };
  }

  async pageEmployees(pageId: string) {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id: pageId },
      select: { id: true, name: true },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const members = await this.prisma.facebookPageEmployee.findMany({
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
      orderBy: { assignedAt: 'asc' },
    });

    const enriched = await Promise.all(
      members.map(async (m) => {
        const [orders, delivered, commissionAgg] = await Promise.all([
          this.prisma.order.count({
            where: { facebookPageId: pageId, salesAgentId: m.userId },
          }),
          this.prisma.order.count({
            where: {
              facebookPageId: pageId,
              salesAgentId: m.userId,
              status: 'DELIVERED',
            },
          }),
          this.prisma.commissionEntry.aggregate({
            where: {
              agentUserId: m.userId,
              pageId,
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            },
            _sum: { amount: true },
          }),
        ]);
        return {
          userId: m.userId,
          role: m.role,
          agentCode: m.agentCode,
          assignedAt: m.assignedAt,
          user: m.user,
          orders,
          delivered,
          commissionTotal: Number(commissionAgg._sum.amount || 0),
        };
      }),
    );

    return { page, employees: enriched };
  }

  async pagePerformance(pageId: string, from?: string, to?: string) {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id: pageId },
      select: { id: true, name: true },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const range = parseRange(from, to);
    const members = await this.prisma.facebookPageEmployee.findMany({
      where: { pageId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            status: true,
            employmentType: true,
            monthlySalary: true,
          },
        },
      },
    });

    const rows = await Promise.all(
      members.map(async (m) => {
        const orders = await this.prisma.order.findMany({
          where: {
            facebookPageId: pageId,
            salesAgentId: m.userId,
            createdAt: { gte: range.gte, lte: range.lte },
          },
          include: { items: { select: { quantity: true } } },
        });
        const delivered = orders.filter((o) => o.status === 'DELIVERED');
        const cancelled = orders.filter((o) => o.status === 'CANCELLED').length;
        const returned = orders.filter((o) => o.status === 'RETURNED').length;
        const pieces = delivered.reduce(
          (s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0),
          0,
        );
        const commission = await this.prisma.commissionEntry.aggregate({
          where: {
            agentUserId: m.userId,
            pageId,
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            createdAt: { gte: range.gte, lte: range.lte },
          },
          _sum: { amount: true },
        });
        const deliveryRate =
          orders.length > 0
            ? Math.round((delivered.length / orders.length) * 1000) / 10
            : 0;
        return {
          userId: m.userId,
          name: m.user.name,
          status: m.user.status,
          role: m.role,
          employmentType: m.user.employmentType,
          monthlySalary: m.user.monthlySalary,
          orders: orders.length,
          pieces,
          delivered: delivered.length,
          cancelled,
          returned,
          deliveryRate,
          commissionEarned: Number(commission._sum.amount || 0),
        };
      }),
    );

    return {
      page,
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
      employees: rows.sort((a, b) => b.delivered - a.delivered),
    };
  }

  async pageReport(pageId: string, from?: string, to?: string) {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id: pageId },
      select: { id: true, name: true, publicCode: true },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    const range = parseRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        facebookPageId: pageId,
        createdAt: { gte: range.gte, lte: range.lte },
      },
      include: {
        items: { select: { quantity: true } },
        salesAgent: { select: { id: true, name: true } },
      },
    });

    const delivered = orders.filter((o) => o.status === 'DELIVERED');
    const cancelled = orders.filter((o) => o.status === 'CANCELLED').length;
    const returned = orders.filter((o) => o.status === 'RETURNED').length;
    const piecesDelivered = delivered.reduce(
      (s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0),
      0,
    );
    const salesValue = delivered.reduce((s, o) => s + Number(o.totalAmount), 0);

    const byEmployee = new Map<
      string,
      { userId: string; name: string; delivered: number; orders: number; pieces: number }
    >();
    for (const o of orders) {
      const id = o.salesAgentId || 'unknown';
      const name = o.salesAgent?.name || 'غير منسوب';
      const row = byEmployee.get(id) || {
        userId: id,
        name,
        delivered: 0,
        orders: 0,
        pieces: 0,
      };
      row.orders += 1;
      if (o.status === 'DELIVERED') {
        row.delivered += 1;
        row.pieces += o.items.reduce((a, i) => a + i.quantity, 0);
      }
      byEmployee.set(id, row);
    }

    return {
      page,
      period: { from: range.gte.toISOString(), to: range.lte.toISOString() },
      totals: {
        orders: orders.length,
        delivered: delivered.length,
        cancelled,
        returned,
        piecesDelivered,
        salesValue,
      },
      employees: [...byEmployee.values()].sort((a, b) => b.delivered - a.delivered),
    };
  }
}
