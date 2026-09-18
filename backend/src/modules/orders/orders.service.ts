import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { CentralInventoryService } from '../inventory/services/central-inventory.service';
import { retailOf } from '../../common/pricing/price-policy';
import { CommissionsService } from '../commissions/commissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderFulfillmentService } from '../delivery/order-fulfillment.service';
import { StoreService } from '../store/store.service';
import {
  deliveryGenderLabelAr,
  findDeliveryCity,
} from '../../common/delivery/delivery-zones';
import { resolveVariantImageUrl } from '../../common/variant-image';
import {
  assertCanAccessOrder,
  assertCanUseFacebookPage,
  assertFacebookPageAcceptsNewOrders,
  getAssignedFacebookPageIds,
  isPageScopedAgent,
  pageAgentOrderScope,
} from '../../common/order-access';

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

  async findAll(
    user: AuthUser,
    filters?: {
      source?: OrderSource;
      status?: string;
      facebookPageId?: string;
      pagePublicCode?: number;
      mine?: boolean;
    },
  ) {
    const where: Prisma.OrderWhereInput = {};

    if (filters?.source) where.source = filters.source;
    if (filters?.status) where.status = filters.status as never;
    if (filters?.facebookPageId) {
      await assertCanUseFacebookPage(this.prisma, user, filters.facebookPageId);
      where.facebookPageId = filters.facebookPageId;
    }
    if (filters?.pagePublicCode) where.pagePublicCode = filters.pagePublicCode;
    if (filters?.mine) where.salesAgentId = user.id;

    const scope = await pageAgentOrderScope(this.prisma, user);
    if (scope) Object.assign(where, scope);

    const rows = await this.prisma.order.findMany({
      where,
      include: {
        customer: true,
        salesAgent: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
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
    return this.enrichOrdersWithItemImages(rows);
  }

  private async enrichOrdersWithItemImages<
    T extends { items: Array<{ variantId: string | null; imageUrl?: string | null }> },
  >(orders: T[]): Promise<T[]> {
    const variantIds = [
      ...new Set(
        orders.flatMap((o) =>
          o.items.map((i) => i.variantId).filter((id): id is string => !!id),
        ),
      ),
    ];
    if (!variantIds.length) return orders;

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    const imageByVariant = new Map(
      variants.map((v) => [v.id, resolveVariantImageUrl(v)]),
    );

    return orders.map((o) => ({
      ...o,
      items: o.items.map((item) => ({
        ...item,
        imageUrl:
          item.imageUrl ||
          (item.variantId ? imageByVariant.get(item.variantId) || null : null),
      })),
    }));
  }

  async findOne(user: AuthUser, id: string) {
    await assertCanAccessOrder(this.prisma, user, id);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        salesAgent: { select: { id: true, name: true, phone: true } },
        cashier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, phone: true } },
        facebookPage: true,
        warehouse: true,
        items: true,
        deliveries: true,
        invoice: true,
        referralVisit: true,
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    const [enriched] = await this.enrichOrdersWithItemImages([order]);
    return enriched;
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

    const pageScoped = isPageScopedAgent(user);

    if (dto.attributionToken && !pageScoped) {
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

    // Page employees: force self as agent; page must be an assigned page
    if (pageScoped) {
      const pageIds = await getAssignedFacebookPageIds(this.prisma, user.id);
      if (!pageIds.length) {
        throw new ForbiddenException('لست مُعيَّناً على أي صفحة فيسبوك');
      }
      if (facebookPageId && !pageIds.includes(facebookPageId)) {
        throw new ForbiddenException('غير مسموح لك بالبيع على هذه الصفحة');
      }
      if (!facebookPageId) {
        if (pageIds.length === 1) facebookPageId = pageIds[0];
        else {
          throw new ForbiddenException('يجب اختيار صفحة فيسبوك مُعيَّنة لك');
        }
      }
      const membership = await this.prisma.facebookPageEmployee.findUnique({
        where: {
          pageId_userId: { pageId: facebookPageId, userId: user.id },
        },
        include: { page: true },
      });
      if (!membership) {
        throw new ForbiddenException('غير مسموح لك بالبيع على هذه الصفحة');
      }
      facebookPageId = membership.pageId;
      pagePublicCode = membership.page.publicCode;
      agentPublicCode = membership.agentCode ?? undefined;
      salesAgentId = user.id;
      attributionSource = 'AGENT_MANUAL';
    } else if (!dto.attributionToken && user.roles.includes('sales_agent')) {
      // Manual agent order: auto-bind page + agent codes
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

    await assertCanUseFacebookPage(this.prisma, user, facebookPageId);
    if (facebookPageId) {
      await assertFacebookPageAcceptsNewOrders(this.prisma, facebookPageId);
    }

    const secondaryPhone =
      dto.customerPhone2?.trim() || dto.shippingPhone2?.trim() || '';

    const deliveryQuote =
      dto.source !== 'POS' && dto.city
        ? await this.storeService.resolveDelivery(
            dto.city,
            dto.area,
            dto.deliveryGender,
          )
        : null;

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
          include: { product: { include: { images: { orderBy: { sortOrder: 'asc' } } } } },
        });
        if (!variant || !variant.isActive) {
          throw new NotFoundException('منتج غير متوفر');
        }

        const retail = retailOf(variant);
        // Honor explicit unitPrice so Facebook reps can adjust (help/raise) the sale price.
        const unitPrice =
          item.unitPrice != null && Number.isFinite(Number(item.unitPrice))
            ? Number(item.unitPrice)
            : retail;
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
          imageUrl: resolveVariantImageUrl(variant),
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
          createdById: user.id,
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
            secondaryPhone ? `هاتف بديل: ${secondaryPhone}` : '',
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
      return this.findOne(user, created.id);
    });
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOne(user, id);

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
      try {
        await this.commissions.accrueOnDelivered(id);
      } catch {
        /* لا نُفشل تحديث الحالة */
      }
    }

    if (dto.status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await this.notifications.notifyOrderStakeholders(updated, {
        titleAr: 'تم إلغاء الطلب',
        type: 'ORDER_CANCELLED',
      });
      try {
        await this.commissions.voidForOrder(id, 'order_cancelled');
      } catch {
        /* لا نُفشل تحديث الحالة */
      }
    }

    return updated;
  }

  /**
   * PATCH order details. Omitted fields are preserved.
   * `items` is applied only when explicitly provided (full replace of lines).
   */
  async update(user: AuthUser, id: string, dto: UpdateOrderDto) {
    const order = await this.findOne(user, id);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('لا يمكن تعديل طلب ملغى');
    }

    const wantsItems = dto.items !== undefined;
    if (wantsItems) {
      if (['DELIVERED', 'OUT_FOR_DELIVERY'].includes(order.status)) {
        throw new BadRequestException(
          'لا يمكن تعديل منتجات طلب قيد التوصيل أو مُسلَّم',
        );
      }
      if (!dto.items?.length) {
        throw new BadRequestException('يجب أن يحتوي الطلب على منتج واحد على الأقل');
      }
    }

    const updated = await this.inventory.withTransaction(async (tx) => {
      const data: Prisma.OrderUpdateInput = {};

      if (dto.shippingName !== undefined) data.shippingName = dto.shippingName.trim();
      if (dto.shippingPhone !== undefined) data.shippingPhone = dto.shippingPhone.trim();
      if (dto.city !== undefined) data.city = dto.city.trim() || null;
      if (dto.area !== undefined) data.area = dto.area.trim() || null;
      if (dto.address !== undefined) data.address = dto.address.trim() || null;
      if (dto.landmark !== undefined) data.landmark = dto.landmark.trim() || null;
      if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
      if (dto.deliveryGender !== undefined) data.deliveryGender = dto.deliveryGender;
      if (dto.discountAmount !== undefined) data.discountAmount = dto.discountAmount;
      if (dto.deliveryFee !== undefined) data.deliveryFee = dto.deliveryFee;

      let nextLines:
        | Array<{
            variantId: string | null;
            productName: string;
            variantName: string | null;
            sku: string | null;
            imageUrl: string | null;
            quantity: number;
            unitPrice: number;
            discount: number;
            lineTotal: number;
            trackStock: boolean;
          }>
        | undefined;

      if (wantsItems) {
        nextLines = [];
        for (const raw of dto.items!) {
          const qty = Math.max(1, Math.floor(Number(raw.quantity)));
          if (raw.id) {
            const existing = order.items.find((i) => i.id === raw.id);
            if (!existing) {
              throw new BadRequestException(`بند غير موجود في الطلب: ${raw.id}`);
            }
            const unitPrice =
              raw.unitPrice != null && Number.isFinite(Number(raw.unitPrice))
                ? Number(raw.unitPrice)
                : Number(existing.unitPrice);
            const discount =
              raw.discount != null && Number.isFinite(Number(raw.discount))
                ? Number(raw.discount)
                : Number(existing.discount || 0);
            const lineTotal = qty * unitPrice - discount;
            let trackStock = false;
            if (existing.variantId) {
              const variant = await tx.productVariant.findUnique({
                where: { id: existing.variantId },
                include: { product: true },
              });
              trackStock = Boolean(variant?.product.isTrackStock);
            }
            nextLines.push({
              variantId: existing.variantId,
              productName: raw.productName?.trim() || existing.productName,
              variantName:
                raw.variantName !== undefined
                  ? raw.variantName
                  : existing.variantName,
              sku: raw.sku !== undefined ? raw.sku : existing.sku,
              imageUrl:
                raw.imageUrl !== undefined ? raw.imageUrl : existing.imageUrl,
              quantity: qty,
              unitPrice,
              discount,
              lineTotal,
              trackStock,
            });
            continue;
          }

          if (!raw.variantId) {
            throw new BadRequestException(
              'البند الجديد يحتاج variantId أو id لبند قائم',
            );
          }
          const variant = await tx.productVariant.findUnique({
            where: { id: raw.variantId },
            include: {
              product: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
            },
          });
          if (!variant || !variant.isActive) {
            throw new NotFoundException('منتج غير متوفر');
          }
          const retail = retailOf(variant);
          const unitPrice =
            raw.unitPrice != null && Number.isFinite(Number(raw.unitPrice))
              ? Number(raw.unitPrice)
              : retail;
          const discount = raw.discount ?? 0;
          const lineTotal = qty * unitPrice - discount;
          nextLines.push({
            variantId: variant.id,
            productName: raw.productName || variant.product.nameAr,
            variantName:
              raw.variantName ||
              variant.nameAr ||
              [variant.color, variant.size].filter(Boolean).join(' / ') ||
              null,
            sku: raw.sku || variant.sku,
            imageUrl: raw.imageUrl || resolveVariantImageUrl(variant),
            quantity: qty,
            unitPrice,
            discount,
            lineTotal,
            trackStock: Boolean(variant.product.isTrackStock),
          });
        }

        const subtotal = nextLines.reduce((s, i) => s + Number(i.lineTotal), 0);
        const discountAmount =
          dto.discountAmount !== undefined
            ? Number(dto.discountAmount)
            : Number(order.discountAmount || 0);
        const deliveryFee =
          dto.deliveryFee !== undefined
            ? Number(dto.deliveryFee)
            : Number(order.deliveryFee || 0);
        data.subtotal = subtotal;
        data.discountAmount = discountAmount;
        data.deliveryFee = deliveryFee;
        data.totalAmount = subtotal - discountAmount + deliveryFee;

        // Stock: return old lines then deduct new ones when already deducted
        if (order.stockDeductedAt && !order.returnedToStockAt) {
          const warehouseId =
            order.warehouseId || (await this.inventory.defaultWarehouseId(tx));
          for (const old of order.items) {
            if (!old.variantId) continue;
            const variant = await tx.productVariant.findUnique({
              where: { id: old.variantId },
              include: { product: true },
            });
            if (!variant?.product.isTrackStock) continue;
            await this.inventory.returnToStock({
              tx,
              warehouseId,
              variantId: old.variantId,
              quantity: old.quantity,
              actorId: user.id,
              orderId: order.id,
              reference: order.orderBarcode,
              reason: 'order_edit_return',
            });
          }
          for (const line of nextLines) {
            if (!line.variantId || !line.trackStock) continue;
            await this.inventory.sale({
              tx,
              warehouseId,
              variantId: line.variantId,
              quantity: line.quantity,
              actorId: user.id,
              orderId: order.id,
              reference: order.orderBarcode,
              reason: 'order_edit_sale',
            });
          }
        }

        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: nextLines.map(({ trackStock: _t, ...line }) => ({
            ...line,
            orderId: id,
          })),
        });
      } else if (dto.discountAmount !== undefined || dto.deliveryFee !== undefined) {
        const subtotal = Number(order.subtotal || 0);
        const discountAmount =
          dto.discountAmount !== undefined
            ? Number(dto.discountAmount)
            : Number(order.discountAmount || 0);
        const deliveryFee =
          dto.deliveryFee !== undefined
            ? Number(dto.deliveryFee)
            : Number(order.deliveryFee || 0);
        data.totalAmount = subtotal - discountAmount + deliveryFee;
      }

      if (Object.keys(data).length === 0 && !wantsItems) {
        return order;
      }

      await tx.order.update({ where: { id }, data });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'order.update',
          entityType: 'Order',
          entityId: id,
          meta: {
            fields: Object.keys(dto).filter(
              (k) => (dto as Record<string, unknown>)[k] !== undefined,
            ),
            itemsReplaced: wantsItems,
          },
        },
      });

      return tx.order.findUnique({
        where: { id },
        include: {
          customer: true,
          items: true,
          facebookPage: true,
          salesAgent: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          deliveries: true,
          courier: { select: { id: true, name: true } },
        },
      });
    });

    const [enriched] = await this.enrichOrdersWithItemImages([updated!]);
    return enriched;
  }

  /**
   * Hard-delete an order. Restores stock when previously deducted,
   * voids commissions, then removes the order (cascades items/deliveries/invoice).
   * Delivered orders cannot be deleted.
   */
  async remove(user: AuthUser, id: string) {
    const order = await this.findOne(user, id);

    if (order.status === 'DELIVERED') {
      throw new BadRequestException('لا يمكن حذف طلب تم تسليمه');
    }

    try {
      await this.commissions.voidForOrder(id, 'order_deleted');
    } catch {
      /* لا نمنع الحذف إذا فشل إبطال العمولة */
    }

    await this.inventory.withTransaction(async (tx) => {
      if (order.stockDeductedAt && !order.returnedToStockAt) {
        const warehouseId =
          order.warehouseId || (await this.inventory.defaultWarehouseId(tx));
        for (const item of order.items) {
          if (!item.variantId) continue;
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          });
          if (!variant?.product.isTrackStock) continue;
          await this.inventory.returnToStock({
            tx,
            warehouseId,
            variantId: item.variantId,
            quantity: item.quantity,
            actorId: user.id,
            orderId: order.id,
            reference: order.orderBarcode,
            reason: 'order_delete',
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'order.delete',
          entityType: 'Order',
          entityId: id,
          meta: {
            orderNumber: order.orderNumber,
            status: order.status,
            totalAmount: String(order.totalAmount),
          },
        },
      });

      await tx.order.delete({ where: { id } });
    });

    return { ok: true, id, orderNumber: order.orderNumber };
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
