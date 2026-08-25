import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { CentralInventoryService } from '../inventory/services/central-inventory.service';
import { canViewCostPrices, retailOf } from '../../common/pricing/price-policy';
import { CommissionsService } from '../commissions/commissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderFulfillmentService } from '../delivery/order-fulfillment.service';
import { StoreService } from '../store/store.service';
import {
  deliveryGenderLabelAr,
  findDeliveryCity,
} from '../../common/delivery/delivery-zones';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: CentralInventoryService,
    private readonly commissions: CommissionsService,
    private readonly notifications: NotificationsService,
    private readonly fulfillment: OrderFulfillmentService,
    private readonly storeService: StoreService,
  ) {}

  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await tx.orderSequence.upsert({
      where: { year },
      create: { year, counter: 1 },
      update: { counter: { increment: 1 } },
    });
    return `ORD-${year}-${String(seq.counter).padStart(6, '0')}`;
  }

  private async assertFacebookPageAccess(
    user: AuthUser,
    facebookPageId?: string,
  ) {
    if (!facebookPageId) return;
    if (user.roles.includes('super_admin') || user.roles.includes('admin')) {
      return;
    }
    const link = await this.prisma.facebookPageEmployee.findUnique({
      where: {
        pageId_userId: { pageId: facebookPageId, userId: user.id },
      },
    });
    if (!link) {
      throw new ForbiddenException('غير مسموح لك بالبيع على هذه الصفحة');
    }
  }

  async findAll(
    user: AuthUser,
    filters?: {
      source?: OrderSource;
      status?: string;
      facebookPageId?: string;
      pagePublicCode?: number;
    },
  ) {
    const where: Prisma.OrderWhereInput = {};

    if (filters?.source) where.source = filters.source;
    if (filters?.status) where.status = filters.status as never;
    if (filters?.facebookPageId) where.facebookPageId = filters.facebookPageId;
    if (filters?.pagePublicCode) where.pagePublicCode = filters.pagePublicCode;

    if (
      user.roles.includes('sales_agent') &&
      !user.roles.includes('super_admin') &&
      !user.roles.includes('admin')
    ) {
      const pages = await this.prisma.facebookPageEmployee.findMany({
        where: { userId: user.id },
        select: { pageId: true },
      });
      where.OR = [
        { salesAgentId: user.id },
        { facebookPageId: { in: pages.map((p) => p.pageId) } },
      ];
    }

    return this.prisma.order.findMany({
      where,
      include: {
        customer: true,
        salesAgent: { select: { id: true, name: true } },
        facebookPage: true,
        items: true,
        deliveries: {
          select: {
            id: true,
            shippingSlipNo: true,
            status: true,
            agentId: true,
            trackingNumber: true,
            trackingUrl: true,
            externalRef: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        courier: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        salesAgent: { select: { id: true, name: true, phone: true } },
        cashier: { select: { id: true, name: true } },
        facebookPage: true,
        warehouse: true,
        items: true,
        deliveries: true,
        invoice: true,
        referralVisit: true,
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return order;
  }

  async create(user: AuthUser, dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('يجب إضافة منتجات للطلب');
    }

    // Resolve attribution from token / agent membership
    let facebookPageId = dto.facebookPageId;
    let salesAgentId: string | undefined =
      dto.source === 'FACEBOOK' || dto.source === 'WHOLESALE' ? user.id : undefined;
    let pagePublicCode = dto.pagePublicCode;
    let agentPublicCode = dto.agentPublicCode;
    let referralVisitId: string | undefined;
    let attributionSource: string | undefined;

    if (dto.attributionToken) {
      const visit = await this.prisma.referralVisit.findUnique({
        where: { attributionToken: dto.attributionToken },
        include: { page: true },
      });
      if (!visit || visit.expiresAt < new Date()) {
        throw new BadRequestException('رمز الإحالة غير صالح أو منتهي');
      }
      facebookPageId = visit.pageId;
      pagePublicCode = visit.pageCode;
      agentPublicCode = visit.agentCode ?? undefined;
      referralVisitId = visit.id;
      attributionSource =
        visit.agentCode != null ? 'REFERRAL_AGENT' : 'REFERRAL_PAGE';
      if (visit.agentUserId) salesAgentId = visit.agentUserId;
    }

    // Manual agent order: auto-bind page + agent codes
    if (!dto.attributionToken && user.roles.includes('sales_agent')) {
      const membership = await this.prisma.facebookPageEmployee.findFirst({
        where: {
          userId: user.id,
          ...(facebookPageId ? { pageId: facebookPageId } : {}),
        },
        include: { page: true },
      });
      if (membership) {
        facebookPageId = membership.pageId;
        pagePublicCode = membership.page.publicCode;
        agentPublicCode = membership.agentCode ?? undefined;
        salesAgentId = user.id;
        attributionSource = attributionSource || 'AGENT_MANUAL';
      }
    }

    if (facebookPageId && !pagePublicCode) {
      const page = await this.prisma.facebookPage.findUnique({
        where: { id: facebookPageId },
      });
      pagePublicCode = page?.publicCode;
    }

    await this.assertFacebookPageAccess(user, facebookPageId);

    const deliveryQuote =
      dto.source !== 'POS' && dto.city
        ? await this.storeService.resolveDelivery(
            dto.city,
            dto.area,
            dto.deliveryGender,
          )
        : null;

    const forceRetail = !canViewCostPrices(user);
    // خصم المخزون عند التأكيد لطلبات فيسبوك/الموقع؛ POS يخصم فوراً
    const deductStock =
      dto.deductStock != null
        ? dto.deductStock
        : dto.source === 'POS';

    return this.inventory.withTransaction(async (tx) => {
      const warehouseId =
        dto.warehouseId || (await this.inventory.defaultWarehouseId(tx));

      let customerId = dto.customerId;
      if (!customerId && dto.customerPhone) {
        const existing = await tx.customer.findUnique({
          where: { phone: dto.customerPhone },
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const created = await tx.customer.create({
            data: {
              name: dto.customerName || dto.shippingName || 'عميل',
              phone: dto.customerPhone,
              city: dto.city,
              area: dto.area,
              address: dto.address,
              landmark: dto.landmark,
            },
          });
          customerId = created.id;
        }
      }

      const items = [];
      for (const item of dto.items) {
        if (!item.variantId) {
          throw new BadRequestException('كل بند يجب أن يحتوي variantId');
        }
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: true },
        });
        if (!variant || !variant.isActive) {
          throw new NotFoundException('منتج غير متوفر');
        }

        const unitPrice = forceRetail
          ? retailOf(variant)
          : Number(item.unitPrice ?? retailOf(variant));
        const discount = item.discount ?? 0;
        const lineTotal = item.quantity * unitPrice - discount;

        items.push({
          variantId: variant.id,
          productName: item.productName || variant.product.nameAr,
          variantName:
            item.variantName ||
            variant.nameAr ||
            [variant.color, variant.size].filter(Boolean).join(' / ') ||
            null,
          sku: item.sku || variant.sku,
          quantity: item.quantity,
          unitPrice,
          discount,
          lineTotal,
          trackStock: variant.product.isTrackStock,
        });
      }

      const subtotal = items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
      const discountAmount = dto.discountAmount ?? 0;
      const deliveryFee = deliveryQuote
        ? deliveryQuote.deliveryFee
        : (dto.deliveryFee ?? 0);
      const totalAmount = subtotal - discountAmount + deliveryFee;
      const orderNumber = await this.nextOrderNumber(tx);
      const orderBarcode = orderNumber;

      const order = await tx.order.create({
        data: {
          orderNumber,
          orderBarcode,
          source: dto.source,
          status: 'NEW',
          paymentMethod: dto.paymentMethod ?? 'COD',
          deliveryType:
            dto.deliveryType ??
            (deliveryQuote?.deliveryType as 'INTERNAL' | 'EXTERNAL' | undefined) ??
            'INTERNAL',
          fulfillmentType: (() => {
            const t =
              dto.deliveryType ||
              deliveryQuote?.deliveryType ||
              (findDeliveryCity(dto.city || undefined).mode === 'OWN_AGENTS'
                ? 'INTERNAL'
                : 'EXTERNAL');
            return t === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL';
          })(),
          localStatus: (() => {
            const t =
              dto.deliveryType ||
              deliveryQuote?.deliveryType ||
              (findDeliveryCity(dto.city || undefined).mode === 'OWN_AGENTS'
                ? 'INTERNAL'
                : 'EXTERNAL');
            return t === 'INTERNAL' ? 'PENDING' : undefined;
          })(),
          customerId,
          salesAgentId,
          cashierId: dto.source === 'POS' ? user.id : undefined,
          facebookPageId,
          warehouseId,
          pagePublicCode,
          agentPublicCode,
          referralVisitId,
          attributionSource,
          pageSource: undefined,
          subtotal,
          discountAmount,
          deliveryFee,
          totalAmount,
          currency: 'LYD',
          shippingName: dto.shippingName ?? dto.customerName,
          shippingPhone: dto.shippingPhone ?? dto.customerPhone,
          city: dto.city,
          area: dto.area,
          deliveryGender: deliveryQuote?.gender || dto.deliveryGender || undefined,
          address: dto.address,
          landmark: dto.landmark,
          notes: [
            dto.notes?.trim(),
            deliveryQuote?.gender
              ? `توصيل ${deliveryGenderLabelAr(deliveryQuote.gender)}`
              : '',
          ]
            .filter(Boolean)
            .join(' | ') || undefined,
          items: {
            create: items.map(({ trackStock: _t, ...line }) => line),
          },
        },
        include: {
          customer: true,
          items: true,
          facebookPage: true,
          salesAgent: { select: { id: true, name: true } },
        },
      });

      if (deductStock) {
        for (const item of items) {
          if (!item.variantId || !item.trackStock) continue;
          await this.inventory.sale({
            tx,
            warehouseId,
            variantId: item.variantId,
            quantity: item.quantity,
            actorId: user.id,
            orderId: order.id,
            reference: order.orderBarcode,
            reason: 'order_sale',
          });
        }
        await tx.order.update({
          where: { id: order.id },
          data: { stockDeductedAt: new Date() },
        });
      }

      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalOrders: { increment: 1 },
            totalPurchases: { increment: totalAmount },
            lastOrderAt: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'order.create',
          entityType: 'Order',
          entityId: order.id,
          meta: {
            orderNumber,
            source: dto.source,
            pagePublicCode,
            agentPublicCode,
            attributionSource,
          },
        },
      });

      if (salesAgentId) {
        await this.commissions.accrueForOrder(tx, {
          orderId: order.id,
          orderTotal: totalAmount,
          source: dto.source,
          agentUserId: salesAgentId,
          pageId: facebookPageId,
        });
      }

      const created = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          customer: true,
          items: true,
          facebookPage: true,
          salesAgent: { select: { id: true, name: true } },
          referralVisit: true,
        },
      });

      return created;
    }).then(async (created) => {
      if (created.facebookPage?.name) {
        await this.prisma.order.update({
          where: { id: created.id },
          data: { pageSource: created.facebookPage.name },
        });
      }
      try {
        await this.fulfillment.routeOrder(created.id);
      } catch {
        /* لا نُفشل إنشاء الطلب إذا تعثر الشحن */
      }
      await this.notifications.notifyOrderStakeholders(created, {
        titleAr: `طلب جديد ${created.orderNumber}`,
        bodyAr: `مصدر: ${created.source} — المبلغ: ${created.totalAmount} د.ل`,
        type: 'ORDER_CREATED',
      });
      return this.findOne(created.id);
    });
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOne(id);

    if (dto.status === 'CANCELLED' && order.status === 'DELIVERED') {
      throw new BadRequestException('لا يمكن إلغاء طلب تم توصيله');
    }

    const data: Prisma.OrderUpdateInput = {
      status: dto.status,
      notes: dto.notes ?? order.notes,
    };

    if (dto.status === 'CONFIRMED') data.confirmedAt = new Date();
    if (dto.status === 'DELIVERED') data.deliveredAt = new Date();
    if (dto.status === 'CANCELLED') data.cancelledAt = new Date();

    const updated = await this.inventory.withTransaction(async (tx) => {
      // خصم المخزون عند التأكيد
      if (dto.status === 'CONFIRMED' && !order.stockDeductedAt) {
        const warehouseId =
          order.warehouseId || (await this.inventory.defaultWarehouseId(tx));
        for (const item of order.items) {
          if (!item.variantId) continue;
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          });
          if (!variant?.product.isTrackStock) continue;
          await this.inventory.sale({
            tx,
            warehouseId,
            variantId: item.variantId,
            quantity: item.quantity,
            actorId: user.id,
            orderId: order.id,
            reference: order.orderBarcode,
            reason: 'order_confirm',
          });
        }
        data.stockDeductedAt = new Date();
      }

      // إرجاع المخزون عند الإلغاء إن كان قد خُصم
      if (dto.status === 'CANCELLED' && order.stockDeductedAt && !order.returnedToStockAt) {
        const warehouseId =
          order.warehouseId || (await this.inventory.defaultWarehouseId(tx));
        for (const item of order.items) {
          if (!item.variantId) continue;
          await this.inventory.returnToStock({
            tx,
            warehouseId,
            variantId: item.variantId,
            quantity: item.quantity,
            actorId: user.id,
            orderId: order.id,
            reference: order.orderBarcode,
            reason: 'order_cancel',
          });
        }
        data.returnedToStockAt = new Date();
      }

      return tx.order.update({
        where: { id },
        data,
        include: { items: true, customer: true, facebookPage: true },
      });
    });

    if (order.customerId) {
      if (dto.status === 'DELIVERED') {
        await this.prisma.customer.update({
          where: { id: order.customerId },
          data: { deliveredOrders: { increment: 1 } },
        });
      }
      if (dto.status === 'CANCELLED') {
        await this.prisma.customer.update({
          where: { id: order.customerId },
          data: { cancelledOrders: { increment: 1 } },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'order.status_update',
        entityType: 'Order',
        entityId: id,
        meta: { from: order.status, to: dto.status },
      },
    });

    if (dto.status === 'CONFIRMED') {
      await this.notifyLowStockForOrder(updated.id);
      if (order.status !== 'CONFIRMED') {
        await this.notifications.notifyOrderStakeholders(updated, {
          titleAr: 'تم تأكيد الطلب',
          type: 'ORDER_CONFIRMED',
        });
      }
    }

    if (dto.status === 'DELIVERED' && order.status !== 'DELIVERED') {
      await this.notifications.notifyOrderStakeholders(updated, {
        titleAr: 'تم التسليم',
        type: 'ORDER_DELIVERED',
      });
    }

    if (dto.status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await this.notifications.notifyOrderStakeholders(updated, {
        titleAr: 'تم إلغاء الطلب',
        type: 'ORDER_CANCELLED',
      });
    }

    return updated;
  }

  private async notifyLowStockForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, warehouse: true },
    });
    if (!order?.warehouseId) return;

    for (const item of order.items) {
      if (!item.variantId) continue;
      const stock = await this.prisma.stockItem.findUnique({
        where: {
          warehouseId_variantId: {
            warehouseId: order.warehouseId,
            variantId: item.variantId,
          },
        },
        include: { variant: { include: { product: true } } },
      });
      if (!stock) continue;
      if (stock.quantityOnHand <= stock.reorderLevel) {
        const title =
          stock.quantityOnHand <= 0
            ? `نفاد مخزون: ${stock.variant.product.nameAr}`
            : `قرب نفاد: ${stock.variant.product.nameAr}`;
        const body = `المتبقي ${stock.quantityOnHand} (حد التنبيه ${stock.reorderLevel})`;
        await this.notifications.notifyAdmins({
          titleAr: title,
          bodyAr: body,
          type: 'LOW_STOCK',
          entityType: 'Product',
          entityId: stock.variant.productId,
        });
      }
    }
  }
}
