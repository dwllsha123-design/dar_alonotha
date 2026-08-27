import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AssignDeliveryDto,
  BulkSlipsDto,
  CreateDeliveryCompanyDto,
  UpdateDeliveryStatusDto,
  UpdateDeliveryZoneDto,
  UpsertDeliveryZoneDto,
} from './dto/delivery.dto';

import { ROLE_CODES } from '../../common/permissions';
import {
  findDeliveryCity,
  TRIPOLI_AREAS,
} from '../../common/delivery/delivery-zones';
import { StoreService } from '../store/store.service';
import { AccuratessService } from './accuratess.service';
import { extractAccuratessTracking } from './accuratess-tracking';
import { CentralInventoryService } from '../inventory/services/central-inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommissionsService } from '../commissions/commissions.service';

const orderPageSelect = {
  id: true,
  name: true,
  publicCode: true,
} as const;

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeService: StoreService,
    private readonly accuratess: AccuratessService,
    private readonly inventory: CentralInventoryService,
    private readonly notifications: NotificationsService,
    private readonly commissions: CommissionsService,
  ) {}

  quote(city?: string, area?: string, gender?: string) {
    return this.storeService.resolveDelivery(city, area, gender);
  }

  async ensureTripoliZones() {
    const maleRow = await this.prisma.setting.findUnique({
      where: { key: 'store.delivery_fee_tripoli' },
    });
    const femaleRow = await this.prisma.setting.findUnique({
      where: { key: 'store.delivery_fee_tripoli_female' },
    });
    const maleFee = Number(maleRow?.value || 15);
    const femaleFee = Number(femaleRow?.value || 20);
    for (const [i, a] of TRIPOLI_AREAS.entries()) {
      await this.prisma.deliveryZone.upsert({
        where: { city_area: { city: 'طرابلس', area: a.nameAr } },
        create: {
          city: 'طرابلس',
          area: a.nameAr,
          maleFee,
          femaleFee,
          sortOrder: i,
          isActive: true,
        },
        update: {},
      });
    }
  }

  async listZones() {
    const count = await this.prisma.deliveryZone.count({ where: { city: 'طرابلس' } });
    if (count === 0) {
      await this.ensureTripoliZones();
    }
    return this.prisma.deliveryZone.findMany({
      orderBy: [{ city: 'asc' }, { sortOrder: 'asc' }, { area: 'asc' }],
    });
  }

  async upsertZone(dto: UpsertDeliveryZoneDto) {
    const city = (dto.city || 'طرابلس').trim() || 'طرابلس';
    const area = dto.area.trim();
    if (!area) {
      throw new BadRequestException('أدخل اسم المنطقة');
    }
    const count = await this.prisma.deliveryZone.count({ where: { city } });
    return this.prisma.deliveryZone.upsert({
      where: { city_area: { city, area } },
      create: {
        city,
        area,
        maleFee: dto.maleFee,
        femaleFee: dto.femaleFee,
        sortOrder: dto.sortOrder ?? count,
        isActive: dto.isActive ?? true,
      },
      update: {
        maleFee: dto.maleFee,
        femaleFee: dto.femaleFee,
        isActive: dto.isActive ?? true,
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async updateZone(id: string, dto: UpdateDeliveryZoneDto) {
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('المنطقة غير موجودة');
    }
    if (dto.area && dto.area.trim() !== existing.area) {
      const clash = await this.prisma.deliveryZone.findUnique({
        where: { city_area: { city: existing.city, area: dto.area.trim() } },
      });
      if (clash && clash.id !== id) {
        throw new BadRequestException('هذه المنطقة مسجّلة مسبقاً');
      }
    }
    return this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(dto.area ? { area: dto.area.trim() } : {}),
        ...(dto.maleFee != null ? { maleFee: dto.maleFee } : {}),
        ...(dto.femaleFee != null ? { femaleFee: dto.femaleFee } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deactivateZone(id: string) {
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('المنطقة غير موجودة');
    }
    return this.prisma.deliveryZone.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deleteZone(id: string) {
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('المنطقة غير موجودة');
    }
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { ok: true };
  }

  private isAdmin(user: AuthUser) {
    return user.roles.includes('super_admin') || user.roles.includes('admin');
  }

  private async orderScope(user: AuthUser): Promise<Prisma.OrderWhereInput | undefined> {
    if (this.isAdmin(user) || user.roles.includes(ROLE_CODES.DELIVERY_AGENT)) {
      return undefined;
    }
    if (user.roles.includes(ROLE_CODES.SALES_AGENT)) {
      const pages = await this.prisma.facebookPageEmployee.findMany({
        where: { userId: user.id },
        select: { pageId: true },
      });
      return {
        OR: [
          { salesAgentId: user.id },
          { facebookPageId: { in: pages.map((p) => p.pageId) } },
        ],
      };
    }
    return undefined;
  }

  async listDeliveries(
    user: AuthUser,
    status?: string,
    type?: string,
    facebookPageId?: string,
  ) {
    const scope = await this.orderScope(user);
    const rows = await this.prisma.delivery.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
        order: {
          ...(facebookPageId ? { facebookPageId } : {}),
          ...(scope || {}),
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            shippingName: true,
            shippingPhone: true,
            city: true,
            area: true,
            address: true,
            totalAmount: true,
            deliveryType: true,
            deliveryGender: true,
            deliveryFee: true,
            pagePublicCode: true,
            fulfillmentType: true,
            localStatus: true,
            externalTrackingNumber: true,
            shippingLabelUrl: true,
            facebookPage: { select: orderPageSelect },
            courier: { select: { id: true, name: true, phone: true } },
          },
        },
        agent: { select: { id: true, name: true, phone: true } },
        company: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((d) => {
      const accuratessCode = this.resolveAccuratessCode(d, d.order);
      return {
        ...d,
        trackingNumber: accuratessCode || d.trackingNumber,
        accuratessCode,
      };
    });
  }

  async listAgents() {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { code: ROLE_CODES.DELIVERY_AGENT } } },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  listCompanies() {
    return this.prisma.deliveryCompany.findMany({
      where: { isActive: true },
      orderBy: { nameAr: 'asc' },
    });
  }

  createCompany(dto: CreateDeliveryCompanyDto) {
    return this.prisma.deliveryCompany.create({ data: dto });
  }

  /** طلبات جاهزة للتعيين ولم يُنشأ لها سجل توصيل بعد */
  async listPendingOrders(user: AuthUser) {
    const scope = await this.orderScope(user);
    return this.prisma.order.findMany({
      where: {
        status: { in: ['NEW', 'CONFIRMED', 'PREPARING', 'READY'] },
        deliveries: { none: {} },
        ...(scope || {}),
      },
      select: {
        id: true,
        orderNumber: true,
        shippingName: true,
        shippingPhone: true,
        city: true,
        area: true,
        address: true,
        deliveryType: true,
        deliveryGender: true,
        fulfillmentType: true,
        localStatus: true,
        courierId: true,
        deliveryFee: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        pagePublicCode: true,
        facebookPage: { select: orderPageSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async nextShippingSlip(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.delivery.count({
      where: { shippingSlipNo: { startsWith: `SLIP-${year}-` } },
    });
    return `SLIP-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  /** اسم الراسل = اسم صفحة فيسبوك التي حجز الزبون عبر رابطها */
  private async resolveSenderName(order: {
    facebookPage?: { name: string } | null;
    pagePublicCode?: number | null;
  }): Promise<string> {
    const fromRelation = order.facebookPage?.name?.trim();
    if (fromRelation) return fromRelation;
    if (order.pagePublicCode) {
      const page = await this.prisma.facebookPage.findUnique({
        where: { publicCode: order.pagePublicCode },
        select: { name: true },
      });
      if (page?.name?.trim()) return page.name.trim();
    }
    return 'دار الأنوثة';
  }

  async assign(user: AuthUser, dto: AssignDeliveryDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { facebookPage: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
      throw new BadRequestException('لا يمكن تعيين توصيل لهذا الطلب');
    }

    const zone = findDeliveryCity(order.city || undefined);
    const type = dto.type || (zone.mode === 'OWN_AGENTS' ? 'INTERNAL' : 'EXTERNAL');

    if (type === 'INTERNAL' && !dto.agentId) {
      throw new BadRequestException('يجب اختيار مندوب توصيل داخلي (مندوبوك المسجّلون)');
    }

    const shippingSlipNo = await this.nextShippingSlip();
    let status: DeliveryStatus = type === 'INTERNAL' ? 'ASSIGNED' : 'PENDING';
    let notes =
      dto.notes ||
      (type === 'EXTERNAL'
        ? 'طلب خارج طرابلس — Accuratess'
        : undefined);
    let trackingNumber: string | undefined;
    let trackingUrl: string | undefined;
    let externalRef: string | undefined;

    const senderName = await this.resolveSenderName(order);

    // خارج طرابلس: إرسال لشركة Accuratess بمفتاح حساب الصفحة إن وُجد
    let accuratessResult: Record<string, unknown> | null = null;
    if (type === 'EXTERNAL') {
      let account = await this.prisma.externalShippingAccount.findFirst({
        where: {
          isActive: true,
          OR: [
            ...(order.facebookPageId
              ? [{ facebookPageId: order.facebookPageId }]
              : []),
            ...(order.pageSource
              ? [
                  { pageIdentifier: order.pageSource },
                  { label: order.pageSource },
                ]
              : []),
          ],
        },
      });
      if (!account) {
        account = await this.prisma.externalShippingAccount.findFirst({
          where: { isActive: true },
          orderBy: { updatedAt: 'desc' },
        });
      }
      const piecesCount = await this.prisma.orderItem
        .aggregate({
          where: { orderId: order.id },
          _sum: { quantity: true },
        })
        .then((r) => Number(r._sum.quantity || 1));
      const shipped = await this.accuratess.saveShipment({
        orderNumber: order.orderNumber,
        senderName,
        recipientName: order.shippingName || 'عميل',
        recipientPhone: order.shippingPhone || '',
        recipientAddress: order.address || order.area || order.city || 'ليبيا',
        city: order.city,
        area: order.area,
        notes: order.notes,
        price: Number(order.totalAmount || 0),
        deliveryFees: Number(dto.fee ?? order.deliveryFee ?? 0),
        piecesCount: piecesCount > 0 ? piecesCount : 1,
        paymentTypeCode: 'COLC',
        sourcePage: senderName,
        sourcePageCode: order.pagePublicCode,
        account: account
          ? {
              apiToken: account.apiToken,
              endpoint: account.endpoint,
              senderZoneId: account.senderZoneId,
              senderSubzoneId: account.senderSubzoneId,
            }
          : null,
      });
      accuratessResult = shipped as Record<string, unknown>;

      const result = shipped as {
        ok?: boolean;
        skipped?: boolean;
        shipment?: {
          code?: string | number;
          trackingUrl?: string;
          id?: string | number;
        };
        error?: string;
        reason?: string;
        raw?: unknown;
      };

      if (result.ok || result.shipment || result.raw) {
        const extracted = extractAccuratessTracking(
          result.shipment as never,
          result.raw ?? shipped,
        );
        if (extracted.code) {
          status = 'ASSIGNED';
          trackingNumber = extracted.code;
          externalRef = extracted.id || extracted.code;
          trackingUrl = extracted.trackingUrl || undefined;
          notes = [
            notes,
            `Accuratess code=${extracted.code}`,
            trackingUrl ? `track=${trackingUrl}` : '',
            `source_page=${senderName}`,
            order.pagePublicCode != null ? `pageCode=${order.pagePublicCode}` : '',
          ]
            .filter(Boolean)
            .join(' | ');
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              externalTrackingNumber: trackingNumber,
              shippingLabelUrl: trackingUrl,
              pagePublicCode:
                order.pagePublicCode ?? order.facebookPage?.publicCode ?? undefined,
              fulfillmentError: null,
              externalResponsePayload: JSON.stringify(shipped),
              fulfillmentType: 'EXTERNAL',
              deliveryType: 'EXTERNAL',
            },
          });
        } else if (result.skipped) {
          notes = `${notes || ''} | ${result.reason}`;
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              fulfillmentError: String(result.reason || 'skipped'),
              externalResponsePayload: JSON.stringify(shipped),
            },
          });
        } else if (result.error) {
          notes = `${notes || ''} | Accuratess error: ${result.error}`;
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              fulfillmentError: String(result.error),
              externalResponsePayload: JSON.stringify(shipped),
            },
          });
        }
      } else if (result.skipped) {
        notes = `${notes || ''} | ${result.reason}`;
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            fulfillmentError: String(result.reason || 'skipped'),
            externalResponsePayload: JSON.stringify(shipped),
          },
        });
      } else if (result.error) {
        notes = `${notes || ''} | Accuratess error: ${result.error}`;
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            fulfillmentError: String(result.error),
            externalResponsePayload: JSON.stringify(shipped),
          },
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          orderId: dto.orderId,
          type,
          status,
          agentId: type === 'INTERNAL' ? dto.agentId : undefined,
          companyId: type === 'EXTERNAL' ? dto.companyId : undefined,
          fee: dto.fee ?? order.deliveryFee,
          notes,
          shippingSlipNo,
          trackingNumber,
          externalRef,
          trackingUrl,
          lastSyncedAt: trackingNumber ? new Date() : undefined,
          assignedAt: status === 'ASSIGNED' ? new Date() : undefined,
        },
        include: {
          order: { include: { facebookPage: true } },
          agent: { select: { id: true, name: true, phone: true } },
          company: true,
        },
      });

      await tx.order.update({
        where: { id: dto.orderId },
        data: {
          status:
            type === 'INTERNAL' || status === 'ASSIGNED'
              ? 'ASSIGNED'
              : order.status === 'NEW'
                ? 'CONFIRMED'
                : order.status,
          deliveryType: type,
          deliveryFee: dto.fee ?? order.deliveryFee,
          ...(order.status === 'NEW' && !order.stockDeductedAt
            ? { confirmedAt: new Date() }
            : {}),
        },
      });

      // خصم المخزون عند أول تقدم بعد الإنشاء
      if (!order.stockDeductedAt) {
        const full = await tx.order.findUnique({
          where: { id: dto.orderId },
          include: { items: true },
        });
        const warehouseId =
          full?.warehouseId || (await this.inventory.defaultWarehouseId(tx));
        for (const item of full?.items || []) {
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
            orderId: dto.orderId,
            reference: full?.orderBarcode,
            reason: 'delivery_assign',
          });
        }
        await tx.order.update({
          where: { id: dto.orderId },
          data: { stockDeductedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'delivery.assign',
          entityType: 'Delivery',
          entityId: delivery.id,
          meta: {
            orderId: dto.orderId,
            type,
            shippingSlipNo,
            sourcePage: senderName,
            accuratess: accuratessResult ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      return { ...delivery, accuratess: accuratessResult };
    });
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateDeliveryStatusDto) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('سجل التوصيل غير موجود');

    const data: Record<string, unknown> = {
      status: dto.status,
      notes: dto.notes ?? delivery.notes,
      trackingNumber: dto.trackingNumber ?? delivery.trackingNumber,
    };

    if (dto.status === 'PICKED_UP') data.pickedUpAt = new Date();
    if (dto.status === 'DELIVERED') data.deliveredAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.delivery.update({
        where: { id },
        data,
        include: {
          order: { include: { facebookPage: true } },
          agent: { select: { id: true, name: true } },
          company: true,
        },
      });

      if (dto.status === 'IN_TRANSIT') {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { status: 'OUT_FOR_DELIVERY' },
        });
      }
      if (dto.status === 'DELIVERED') {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { status: 'DELIVERED', deliveredAt: new Date(), paymentStatus: 'PAID' },
        });
        const order = await tx.order.findUnique({ where: { id: delivery.orderId } });
        if (order?.customerId) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: { deliveredOrders: { increment: 1 } },
          });
        }
      }
      if (dto.status === 'FAILED' || dto.status === 'RETURNED') {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { status: dto.status === 'RETURNED' ? 'RETURNED' : 'READY' },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'delivery.status_update',
          entityType: 'Delivery',
          entityId: id,
          meta: { from: delivery.status, to: dto.status },
        },
      });

      return saved;
    });

    if (dto.status !== delivery.status) {
      if (dto.status === 'DELIVERED') {
        await this.notifications.notifyOrderStakeholders(updated.order, {
          titleAr: 'تم التسليم',
          type: 'ORDER_DELIVERED',
        });
        try {
          await this.commissions.accrueOnDelivered(updated.order.id);
        } catch {
          /* ignore */
        }
      }
      if (dto.status === 'FAILED') {
        await this.notifications.notifyOrderStakeholders(updated.order, {
          titleAr: 'تعذر التسليم',
          type: 'ORDER_DELIVERY_FAILED',
        });
      }
      if (dto.status === 'RETURNED') {
        await this.notifications.notifyOrderStakeholders(updated.order, {
          titleAr: 'مرتجع توصيل',
          type: 'ORDER_RETURNED',
        });
      }
      if (dto.status === 'IN_TRANSIT') {
        await this.notifications.notifyOrderStakeholders(updated.order, {
          titleAr: 'الطلب في الطريق',
          type: 'ORDER_OUT_FOR_DELIVERY',
        });
      }
    }

    return updated;
  }

  /** قفل البوليصة: طلبات طرابلس لا تُطبع إلا بعد تعيين مندوب */
  private assertWaybillPrintable(order: {
    deliveryType?: string | null;
    fulfillmentType?: string | null;
    courierId?: string | null;
    courier?: { id: string } | null;
    deliveries?: Array<{ agentId?: string | null; status?: string }>;
  }) {
    const internal =
      order.fulfillmentType === 'INTERNAL' || order.deliveryType === 'INTERNAL';
    if (!internal) return;
    const assigned =
      Boolean(order.courierId) ||
      Boolean(order.courier?.id) ||
      Boolean(order.deliveries?.[0]?.agentId);
    if (!assigned) {
      throw new BadRequestException(
        'لا يمكن طباعة البوليصة قبل تعيين مندوب توصيل للطلب.',
      );
    }
  }

  async listCompanyOrders(user: AuthUser) {
    const rows = await this.listDeliveries(user, undefined, 'EXTERNAL');
    const groups: Record<string, number> = {
      PENDING: 0,
      ASSIGNED: 0,
      PICKED_UP: 0,
      IN_TRANSIT: 0,
      DELIVERED: 0,
      FAILED: 0,
      RETURNED: 0,
    };
    for (const row of rows) {
      groups[row.status] = (groups[row.status] || 0) + 1;
    }
    return { live: true, counts: groups, orders: rows };
  }

  async getShippingSlip(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            items: true,
            customer: true,
            courier: { select: { id: true, name: true, phone: true } },
            facebookPage: { select: { id: true, name: true, publicCode: true } },
          },
        },
        agent: { select: { id: true, name: true, phone: true } },
        company: true,
      },
    });
    if (!delivery) throw new NotFoundException('بوليصة الشحن غير موجودة');
    this.assertWaybillPrintable(delivery.order);
    const senderName = await this.resolveSenderName(delivery.order);
    const accuratessCode = this.resolveAccuratessCode(delivery, delivery.order);
    const pagePublicCode =
      delivery.order.pagePublicCode ??
      delivery.order.facebookPage?.publicCode ??
      null;
    return {
      ...delivery,
      trackingNumber: accuratessCode || delivery.trackingNumber,
      accuratessCode,
      pagePublicCode,
      pageCode: pagePublicCode,
      printTitle: 'بوليصة شحن — دار الأنوثة',
      senderName,
      sourcePage: senderName,
      order: {
        ...delivery.order,
        pagePublicCode,
        externalTrackingNumber:
          delivery.order.externalTrackingNumber || accuratessCode,
      },
    };
  }

  /** رقم شحنة Accuratess الظاهر على البوليصة وتفاصيل الطلب */
  private resolveAccuratessCode(
    delivery: {
      trackingNumber?: string | null;
      externalRef?: string | null;
    } | null,
    order: { externalTrackingNumber?: string | null },
  ): string | null {
    const raw =
      delivery?.trackingNumber ||
      delivery?.externalRef ||
      order.externalTrackingNumber ||
      null;
    const code = raw ? String(raw).trim() : '';
    return code || null;
  }

  async slipFromOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: true,
        courier: { select: { id: true, name: true, phone: true } },
        facebookPage: { select: { id: true, name: true, publicCode: true } },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            agent: { select: { id: true, name: true, phone: true } },
            company: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    this.assertWaybillPrintable(order);
    if (order.deliveries[0]) {
      return this.getShippingSlip(order.deliveries[0].id);
    }
    const senderName = await this.resolveSenderName(order);
    const accuratessCode = this.resolveAccuratessCode(null, order);
    const pagePublicCode =
      order.pagePublicCode ?? order.facebookPage?.publicCode ?? null;
    return {
      id: order.id,
      shippingSlipNo: order.orderNumber,
      trackingNumber: accuratessCode,
      trackingUrl: order.shippingLabelUrl || null,
      accuratessCode,
      pagePublicCode,
      pageCode: pagePublicCode,
      fee: order.deliveryFee,
      type: order.deliveryType,
      status: order.status,
      senderName,
      sourcePage: senderName,
      agent: order.courier
        ? { id: order.courier.id, name: order.courier.name, phone: order.courier.phone }
        : null,
      company: null,
      printTitle: 'بوليصة شحن — دار الأنوثة',
      order: {
        ...order,
        pagePublicCode,
        externalTrackingNumber: order.externalTrackingNumber || accuratessCode,
      },
    };
  }

  async getShippingSlipsBulk(user: AuthUser, dto: BulkSlipsDto) {
    const slips = [];
    if (dto.facebookPageId) {
      const scope = await this.orderScope(user);
      const orders = await this.prisma.order.findMany({
        where: {
          facebookPageId: dto.facebookPageId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          ...(scope || {}),
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      if (!orders.length) {
        throw new BadRequestException('لا توجد بوليصات لهذه الصفحة');
      }
      for (const o of orders) {
        try {
          slips.push(await this.slipFromOrder(o.id));
        } catch {
          /* طلبات طرابلس بلا مندوب تُتخطّى ولا تُطبع */
        }
      }
      if (!slips.length) {
        throw new BadRequestException(
          'لا يمكن طباعة بوليصات هذه الصفحة قبل تعيين مناديب لطلبات طرابلس.',
        );
      }
      return { slips };
    }
    if (dto.orderIds?.length) {
      for (const id of dto.orderIds) slips.push(await this.slipFromOrder(id));
      return { slips };
    }
    if (dto.ids?.length) {
      for (const id of dto.ids) {
        const asDelivery = await this.prisma.delivery.findUnique({
          where: { id },
          select: { id: true },
        });
        slips.push(
          asDelivery
            ? await this.getShippingSlip(id)
            : await this.slipFromOrder(id),
        );
      }
      return { slips };
    }
    throw new BadRequestException('حدد بوليصات للطباعة');
  }

  async syncAccuratess(user: AuthUser, id: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('سجل التوصيل غير موجود');
    if (delivery.type !== 'EXTERNAL') {
      throw new BadRequestException('المزامنة متاحة للشحن الخارجي فقط');
    }
    const code = delivery.trackingNumber || delivery.externalRef;
    if (!code) {
      throw new BadRequestException('لا يوجد رقم شحنة Accuratess');
    }

    const remote = await this.accuratess.getShipment(code);
    if ('skipped' in remote && remote.skipped) return remote;
    if (!remote.ok) return remote;

    const mapped = this.accuratess.mapRemoteStatus(remote.shipment?.status);
    await this.prisma.delivery.update({
      where: { id },
      data: {
        trackingUrl: remote.shipment?.trackingUrl || delivery.trackingUrl,
        lastSyncedAt: new Date(),
        notes: [
          delivery.notes,
          remote.shipment?.status ? `accuratess_status=${remote.shipment.status}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
      },
    });

    if (mapped && mapped !== delivery.status) {
      return {
        remote,
        updated: await this.updateStatus(user, id, { status: mapped }),
      };
    }

    return { remote, updated: null, message: 'لا تغيير في الحالة' };
  }

  async syncAllAccuratess(user: AuthUser) {
    const open = await this.prisma.delivery.findMany({
      where: {
        type: 'EXTERNAL',
        status: { notIn: ['DELIVERED', 'RETURNED', 'FAILED'] },
        OR: [{ trackingNumber: { not: null } }, { externalRef: { not: null } }],
      },
      take: 50,
      orderBy: { updatedAt: 'asc' },
    });

    const results = [];
    for (const d of open) {
      try {
        results.push({ id: d.id, ...(await this.syncAccuratess(user, d.id)) });
      } catch (err) {
        results.push({
          id: d.id,
          ok: false,
          error: err instanceof Error ? err.message : 'sync error',
        });
      }
    }
    return { count: results.length, results };
  }
}
