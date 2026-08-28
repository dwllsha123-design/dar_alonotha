import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FulfillmentType, LocalOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { findDeliveryCity } from '../../common/delivery/delivery-zones';
import { AccuratessService } from './accuratess.service';
import { extractAccuratessTracking } from './accuratess-tracking';

@Injectable()
export class OrderFulfillmentService {
  private readonly logger = new Logger(OrderFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accuratess: AccuratessService,
  ) {}

  normalizeCity(city?: string | null) {
    return (city || '').trim().replace(/\s+/g, ' ');
  }

  resolveFulfillmentType(city?: string | null): FulfillmentType {
    const zone = findDeliveryCity(this.normalizeCity(city) || undefined);
    return zone.mode === 'OWN_AGENTS' ? 'INTERNAL' : 'EXTERNAL';
  }

  async resolvePageAccount(order: {
    facebookPageId?: string | null;
    pagePublicCode?: number | null;
    pageSource?: string | null;
  }) {
    if (order.facebookPageId) {
      const byPage = await this.prisma.externalShippingAccount.findFirst({
        where: { facebookPageId: order.facebookPageId, isActive: true },
      });
      if (byPage) return byPage;
    }

    if (order.pagePublicCode != null) {
      const page = await this.prisma.facebookPage.findUnique({
        where: { publicCode: order.pagePublicCode },
        include: { shippingAccount: true },
      });
      if (page?.shippingAccount?.isActive) return page.shippingAccount;
    }

    const identifier = (order.pageSource || '').trim();
    if (identifier) {
      const byId = await this.prisma.externalShippingAccount.findFirst({
        where: {
          isActive: true,
          OR: [
            { pageIdentifier: identifier },
            { label: identifier },
            { facebookPage: { name: identifier } },
          ],
        },
      });
      if (byId) return byId;
    }

    // Fallback: أي حساب شحن نشط محفوظ من الواجهة (عند عدم ربط الصفحة بالطلب)
    const anyActive = await this.prisma.externalShippingAccount.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    return anyActive;
  }

  /**
   * توجيه ذكي عند إنشاء/اعتماد الطلب:
   * طرابلس → internal + local_status
   * خارجها → external + Accuratess بمفتاح صفحة الطلب
   */
  async routeOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { facebookPage: true, items: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const pageSource =
      order.pageSource ||
      order.facebookPage?.name ||
      (order.pagePublicCode != null ? `صفحة #${order.pagePublicCode}` : null) ||
      order.attributionSource ||
      null;

    const fulfillmentType = this.resolveFulfillmentType(order.city);

    if (fulfillmentType === 'INTERNAL') {
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          fulfillmentType: 'INTERNAL',
          deliveryType: 'INTERNAL',
          localStatus: (order.localStatus || 'PENDING') as LocalOrderStatus,
          pageSource,
          courierId: order.courierId,
          fulfillmentError: null,
        },
        include: { facebookPage: true, courier: true },
      });
      return {
        fulfillmentType: 'INTERNAL' as const,
        localStatus: updated.localStatus,
        order: updated,
        external: null,
      };
    }

    // EXTERNAL
    const account = await this.resolvePageAccount({
      facebookPageId: order.facebookPageId,
      pagePublicCode: order.pagePublicCode,
      pageSource,
    });

    if (!account && !this.accuratess.isConfigured(null)) {
      this.logger.warn(
        `Accuratess skipped for ${order.orderNumber}: no page shipping token and env not configured`,
      );
    }

    const senderName =
      account?.label ||
      order.facebookPage?.name ||
      pageSource ||
      'دار الأنوثة';

    const piecesCount = (order.items || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    let externalResult: Record<string, unknown> = {};
    let tracking: string | null = null;
    let labelUrl: string | null = null;
    let payloadJson: string | null = null;
    let fulfillmentError: string | null = null;

    const pagePublicCode =
      order.pagePublicCode ?? order.facebookPage?.publicCode ?? null;

    if (order.externalTrackingNumber) {
      tracking = order.externalTrackingNumber;
      labelUrl = order.shippingLabelUrl;
      externalResult = {
        ok: true,
        idempotent: true,
        shipment: { code: tracking, trackingUrl: labelUrl },
      };
      payloadJson = JSON.stringify(externalResult);
    } else {
      try {
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
          deliveryFees: Number(order.deliveryFee || 0),
          piecesCount: piecesCount > 0 ? piecesCount : 1,
          paymentTypeCode: 'COLC',
          sourcePage: senderName,
          sourcePageCode: pagePublicCode,
          account: account
            ? {
                apiToken: account.apiToken,
                endpoint: account.endpoint,
                senderZoneId: account.senderZoneId,
                senderSubzoneId: account.senderSubzoneId,
              }
            : null,
        });

        externalResult = shipped as Record<string, unknown>;
        payloadJson = JSON.stringify(shipped);

        if ('skipped' in shipped && shipped.skipped) {
          fulfillmentError = String(shipped.reason || 'تم تخطي Accuratess');
          this.logger.warn(
            `Accuratess skipped for ${order.orderNumber}: ${fulfillmentError}`,
          );
        } else if ('ok' in shipped && shipped.ok) {
          const extracted = extractAccuratessTracking(
            shipped.shipment as never,
            (shipped as { raw?: unknown }).raw ?? shipped,
          );
          tracking = extracted.code;
          labelUrl = extracted.trackingUrl;
          if (!tracking) {
            fulfillmentError = 'Accuratess نجح لكن بدون رقم شحنة في الرد';
            this.logger.error(
              `Accuratess empty tracking for ${order.orderNumber}: ${payloadJson}`,
            );
          } else {
            this.logger.log(
              `Accuratess OK ${order.orderNumber} tracking=${tracking} pageCode=${pagePublicCode ?? '—'}`,
            );
          }
        } else if ('error' in shipped && shipped.error) {
          const extracted = extractAccuratessTracking(
            null,
            (shipped as { raw?: unknown }).raw ?? shipped,
          );
          if (extracted.code) {
            tracking = extracted.code;
            labelUrl = extracted.trackingUrl;
            this.logger.warn(
              `Accuratess reported error but recovered code=${tracking} for ${order.orderNumber}`,
            );
          } else {
            fulfillmentError = String(shipped.error);
            this.logger.error(
              `Accuratess error for ${order.orderNumber}: ${fulfillmentError}`,
            );
          }
        }
      } catch (err) {
        fulfillmentError =
          err instanceof Error ? err.message : 'فشل الاتصال بشركة المعيار';
        this.logger.error(
          `Fulfillment Accuratess error for ${order.orderNumber}: ${fulfillmentError}`,
        );
        payloadJson = JSON.stringify({ error: fulfillmentError });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const orderRow = await tx.order.update({
        where: { id: orderId },
        data: {
          fulfillmentType: 'EXTERNAL',
          deliveryType: 'EXTERNAL',
          localStatus: null,
          pageSource,
          pagePublicCode: pagePublicCode ?? undefined,
          // Always write when we have a code — never leave stale null after a success
          ...(tracking
            ? {
                externalTrackingNumber: tracking,
                shippingLabelUrl: labelUrl || order.shippingLabelUrl,
                fulfillmentError: null,
              }
            : {
                externalTrackingNumber: order.externalTrackingNumber,
                shippingLabelUrl: labelUrl || order.shippingLabelUrl,
                fulfillmentError,
              }),
          externalResponsePayload: payloadJson,
        },
        include: { facebookPage: true, courier: true },
      });

      const existing = await tx.delivery.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });

      const deliveryNotes = fulfillmentError
        ? `يحتاج إرسال يدوي: ${fulfillmentError}`
        : [
            `Accuratess page=${senderName}`,
            pagePublicCode != null ? `pageCode=${pagePublicCode}` : '',
            tracking ? `code=${tracking}` : '',
          ]
            .filter(Boolean)
            .join(' | ');

      if (!existing) {
        const year = new Date().getFullYear();
        const count = await tx.delivery.count({
          where: { shippingSlipNo: { startsWith: `SLIP-${year}-` } },
        });
        const shippingSlipNo = `SLIP-${year}-${String(count + 1).padStart(6, '0')}`;
        await tx.delivery.create({
          data: {
            orderId,
            type: 'EXTERNAL',
            status: tracking ? 'ASSIGNED' : 'PENDING',
            fee: order.deliveryFee,
            shippingSlipNo,
            trackingNumber: tracking || undefined,
            trackingUrl: labelUrl || undefined,
            externalRef: tracking || undefined,
            notes: deliveryNotes,
          },
        });
      } else {
        await tx.delivery.update({
          where: { id: existing.id },
          data: {
            type: 'EXTERNAL',
            status: tracking ? 'ASSIGNED' : existing.status,
            ...(tracking
              ? {
                  trackingNumber: tracking,
                  trackingUrl: labelUrl || existing.trackingUrl,
                  externalRef: tracking,
                }
              : {}),
            notes: deliveryNotes,
          },
        });
      }

      return orderRow;
    });

    return {
      fulfillmentType: 'EXTERNAL' as const,
      order: updated,
      externalTrackingNumber: updated.externalTrackingNumber,
      accuratessCode: updated.externalTrackingNumber,
      pagePublicCode: updated.pagePublicCode,
      accountUsed: account
        ? { id: account.id, label: account.label, pageIdentifier: account.pageIdentifier }
        : null,
      external: externalResult,
      error: fulfillmentError,
    };
  }

  async assignCourier(orderId: string, courierId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { id: courierId } });
    if (!courier || !courier.isActive) {
      throw new NotFoundException('المندوب غير موجود أو غير نشط');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.fulfillmentType === 'EXTERNAL' || order.deliveryType === 'EXTERNAL') {
      throw new BadRequestException('طلبات خارج طرابلس تُمرَّر لشركة التوصيل ولا تُسند لمناديب محليين');
    }

    const year = new Date().getFullYear();
    const count = await this.prisma.delivery.count({
      where: { shippingSlipNo: { startsWith: `SLIP-${year}-` } },
    });
    const shippingSlipNo = `SLIP-${year}-${String(count + 1).padStart(6, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          courierId,
          fulfillmentType: 'INTERNAL',
          deliveryType: 'INTERNAL',
          localStatus: 'IN_WAREHOUSE',
          status: 'ASSIGNED',
        },
        include: { courier: true, facebookPage: true },
      });

      const existing = await tx.delivery.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
      if (!existing) {
        await tx.delivery.create({
          data: {
            orderId,
            type: 'INTERNAL',
            status: 'ASSIGNED',
            agentId: courier.userId || undefined,
            assignedAt: new Date(),
            shippingSlipNo,
            fee: order.deliveryFee,
            notes: `مندوب طرابلس: ${courier.name}`,
          },
        });
      } else {
        await tx.delivery.update({
          where: { id: existing.id },
          data: {
            type: 'INTERNAL',
            status: 'ASSIGNED',
            agentId: courier.userId || existing.agentId,
            assignedAt: existing.assignedAt || new Date(),
            notes: existing.notes || `مندوب طرابلس: ${courier.name}`,
          },
        });
      }

      return updated;
    });
  }

  async updateLocalStatus(orderId: string, localStatus: LocalOrderStatus) {
    const data: Prisma.OrderUpdateInput = { localStatus };
    if (localStatus === 'OUT_FOR_DELIVERY') data.status = 'OUT_FOR_DELIVERY';
    if (localStatus === 'IN_WAREHOUSE') data.status = 'READY';
    if (localStatus === 'DELIVERED') {
      data.status = 'DELIVERED';
      data.deliveredAt = new Date();
      data.paymentStatus = 'PAID';
    }
    if (localStatus === 'FAILED') data.status = 'READY';
    if (localStatus === 'RETURNED') data.status = 'RETURNED';
    if (localStatus === 'PENDING') data.status = 'CONFIRMED';

    return this.prisma.order.update({
      where: { id: orderId },
      data,
      include: { courier: true, facebookPage: true },
    });
  }
}
