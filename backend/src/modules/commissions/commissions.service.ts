import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  CreateCommissionRuleDto,
  UpdateCommissionStatusDto,
} from './dto/commission.dto';

export const COMMISSION_PER_PIECE_KEY = 'commission.per_piece_lyd';

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listRules() {
    return this.prisma.commissionRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  createRule(dto: CreateCommissionRuleDto) {
    return this.prisma.commissionRule.create({
      data: {
        nameAr: dto.nameAr,
        type: dto.type ?? 'PER_ITEM',
        ratePercent: dto.ratePercent ?? 0,
        fixedAmount: dto.fixedAmount ?? 0,
        pageId: dto.pageId,
        agentUserId: dto.agentUserId,
        source: dto.source ?? 'FACEBOOK',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getPerPieceRate() {
    const row = await this.prisma.setting.findUnique({
      where: { key: COMMISSION_PER_PIECE_KEY },
    });
    return row ? Number(row.value) : 5;
  }

  async setPerPieceRate(amount: number) {
    return this.prisma.setting.upsert({
      where: { key: COMMISSION_PER_PIECE_KEY },
      create: {
        key: COMMISSION_PER_PIECE_KEY,
        value: String(amount),
        group: 'commissions',
      },
      update: { value: String(amount) },
    });
  }

  async listEntries(user: AuthUser) {
    const isAdmin =
      user.roles.includes('super_admin') ||
      user.roles.includes('admin') ||
      user.permissions.includes('commissions.manage');

    return this.prisma.commissionEntry.findMany({
      where: isAdmin ? undefined : { agentUserId: user.id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            source: true,
            pagePublicCode: true,
            agentPublicCode: true,
            createdAt: true,
          },
        },
        agent: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateStatus(id: string, dto: UpdateCommissionStatusDto) {
    const entry = await this.prisma.commissionEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('العمولة غير موجودة');
    return this.prisma.commissionEntry.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === 'PAID' ? new Date() : entry.paidAt,
      },
    });
  }

  /**
   * Accrue commission when an order is delivered (per successful piece sold).
   */
  async accrueOnDelivered(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return null;

    const agentUserId = order.salesAgentId ?? order.createdById;
    if (!agentUserId) return null;

    const agent = await this.prisma.user.findUnique({
      where: { id: agentUserId },
      select: { id: true, employmentType: true },
    });
    if (!agent || agent.employmentType !== 'COMMISSION') return null;

    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    if (itemCount <= 0) return null;

    return this.prisma.$transaction(async (tx) =>
      this.accrueForOrder(tx, {
        orderId: order.id,
        orderTotal: Number(order.totalAmount),
        source: order.source,
        agentUserId,
        pageId: order.facebookPageId,
        itemCount,
      }),
    );
  }

  /**
   * Accrue commission inside an existing transaction.
   */
  async accrueForOrder(
    tx: Prisma.TransactionClient,
    input: {
      orderId: string;
      orderTotal: number;
      source: string;
      agentUserId?: string | null;
      pageId?: string | null;
      itemCount?: number;
    },
  ) {
    if (!input.agentUserId) return null;

    const agent = await tx.user.findUnique({
      where: { id: input.agentUserId },
      select: { employmentType: true },
    });
    if (!agent || agent.employmentType !== 'COMMISSION') return null;

    const itemCount = input.itemCount ?? 0;
    const rules = await tx.commissionRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const rule =
      rules.find(
        (r) =>
          r.agentUserId === input.agentUserId &&
          (!r.pageId || r.pageId === input.pageId) &&
          (!r.source || r.source === 'ALL' || r.source === input.source),
      ) ||
      rules.find(
        (r) =>
          !r.agentUserId &&
          r.pageId === input.pageId &&
          (!r.source || r.source === 'ALL' || r.source === input.source),
      ) ||
      rules.find(
        (r) =>
          !r.agentUserId &&
          !r.pageId &&
          (!r.source || r.source === 'ALL' || r.source === input.source),
      );

    const defaultPerPiece = await this.getPerPieceRate();
    const ruleType = rule?.type ?? 'PER_ITEM';
    const fixedAmount = rule ? Number(rule.fixedAmount || 0) : defaultPerPiece;
    const rate = Number(rule?.ratePercent || 0);

    let amount = 0;
    if (ruleType === 'PER_ITEM') {
      const perPiece = fixedAmount > 0 ? fixedAmount : defaultPerPiece;
      amount = perPiece * itemCount;
    } else if (ruleType === 'FIXED') {
      amount = fixedAmount;
    } else {
      amount = (input.orderTotal * rate) / 100;
    }

    if (amount <= 0) return null;

    return tx.commissionEntry.upsert({
      where: {
        orderId_agentUserId: {
          orderId: input.orderId,
          agentUserId: input.agentUserId,
        },
      },
      create: {
        orderId: input.orderId,
        agentUserId: input.agentUserId,
        pageId: input.pageId,
        ruleId: rule?.id,
        orderTotal: input.orderTotal,
        itemCount,
        ratePercent: rate,
        amount,
        status: 'PENDING',
      },
      update: {
        amount,
        itemCount,
        ratePercent: rate,
        orderTotal: input.orderTotal,
        ruleId: rule?.id,
      },
    });
  }
}
