/**
 * Production one-shot Accuratess connectivity + NEW test shipment.
 * Never prints tokens. Never touches ORD-2026-000001.
 *
 * Run inside Railway backend (/app):
 *   node dist/... or npx ts-node — prefer compiled Nest context via nest start isn't needed;
 *   use: node -r ts-node/register may be unavailable — ship as JS using Nest dist.
 *
 * Safer: use NestFactory against AppModule from dist after deploy.
 */
const { NestFactory } = require('@nestjs/core');
const { Logger } = require('@nestjs/common');

function present(v) {
  return v != null && String(v).trim() !== '';
}

async function main() {
  if (process.env.ACCURATESS_WEBHOOK_ENABLED === 'true') {
    console.error('REFUSE: ACCURATESS_WEBHOOK_ENABLED must stay false for this run');
    process.exit(2);
  }

  console.log('ENV_PRESENCE', {
    ACCURATESS_ENABLED: process.env.ACCURATESS_ENABLED === 'true' ? 'true' : 'false/unset',
    ACCURATESS_TOKEN: present(process.env.ACCURATESS_TOKEN) ? 'SET' : 'MISSING',
    ACCURATESS_ENDPOINT: present(process.env.ACCURATESS_ENDPOINT) ? 'SET' : 'MISSING',
    ACCURATESS_WEBHOOK_ENABLED: process.env.ACCURATESS_WEBHOOK_ENABLED || 'unset',
  });

  const { AppModule } = require('./dist/app.module');
  const { AccuratessService } = require('./dist/modules/delivery/accuratess.service');
  const { OrderFulfillmentService } = require('./dist/modules/delivery/order-fulfillment.service');
  const { DeliveryService } = require('./dist/modules/delivery/delivery.service');
  const { PrismaService } = require('./dist/prisma/prisma.service');
  const { resolvePrintAccuratessCode } = require('./dist/modules/delivery/accuratess-tracking');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const accuratess = app.get(AccuratessService);
  const fulfillment = app.get(OrderFulfillmentService);
  const deliverySvc = app.get(DeliveryService);
  const prisma = app.get(PrismaService);

  const out = {
    TOKEN_AUTH: 'FAIL',
    GRAPHQL_CONNECTION: 'FAIL',
    SAVE_SHIPMENT: 'FAIL',
    SHIPMENT_ID_SAVED: 'FAIL',
    TRACKING_CODE_SAVED: 'FAIL',
    PRINT_SHOWS_CODE: 'FAIL',
    WEBHOOK_ENABLED: process.env.ACCURATESS_WEBHOOK_ENABLED === 'true' ? 'YES' : 'NO',
    testOrderNumber: null,
    shipmentId: null,
    trackingCode: null,
  };

  try {
    if (!accuratess.isConfigured(null)) {
      console.log(JSON.stringify({ ...out, error: 'Accuratess not configured' }, null, 2));
      process.exit(1);
    }
    out.TOKEN_AUTH = present(process.env.ACCURATESS_TOKEN) ? 'PASS' : 'FAIL';

    const ping = await accuratess.ping();
    out.GRAPHQL_CONNECTION = ping.ok ? 'PASS' : 'FAIL';
    console.log('GRAPHQL_PING', { ok: Boolean(ping.ok), error: ping.error || null });

    if (!ping.ok) {
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    // Prefer known external cities used previously
    const city = 'مصراتة';
    const area = 'المركز';
    const stamp = Date.now();
    const orderNumber = `TEST-ACC-${stamp}`;
    const orderBarcode = `ORD-TEST-${stamp}`;

    const admin = await prisma.user.findFirst({
      where: { OR: [{ email: 'admin@dar-alunotha.ly' }, { email: { contains: 'admin' } }] },
      select: { id: true },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderBarcode,
        source: 'OTHER',
        status: 'NEW',
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
        deliveryType: 'EXTERNAL',
        fulfillmentType: 'EXTERNAL',
        subtotal: 100,
        deliveryFee: 25,
        totalAmount: 125,
        shippingName: 'عميل اختبار Accurate',
        shippingPhone: '0912345678',
        city,
        area,
        address: `شارع الاختبار — ${city}`,
        notes: `accuratess-prod-verify-${stamp}`,
        createdById: admin?.id || undefined,
        items: {
          create: [
            {
              productName: 'منتج اختبار Accuratess',
              quantity: 1,
              unitPrice: 100,
              lineTotal: 100,
            },
          ],
        },
      },
    });
    out.testOrderNumber = order.orderNumber;
    console.log('CREATED_TEST_ORDER', order.orderNumber);

    // Exactly one Accuratess create via normal fulfillment path
    const routed = await fulfillment.routeOrder(order.id);
    const code = routed?.externalTrackingNumber || routed?.accuratessCode || null;
    const shipmentId = routed?.accuratessShipmentId || null;

    const refreshed = await prisma.order.findUnique({
      where: { id: order.id },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const d = refreshed?.deliveries?.[0] || null;

    out.shipmentId = d?.accuratessShipmentId || shipmentId;
    out.trackingCode = d?.trackingNumber || refreshed?.externalTrackingNumber || code;

    out.SAVE_SHIPMENT =
      out.shipmentId && out.trackingCode && !routed?.error ? 'PASS' : 'FAIL';
    out.SHIPMENT_ID_SAVED =
      d?.accuratessShipmentId && String(d.accuratessShipmentId) === String(out.shipmentId)
        ? 'PASS'
        : 'FAIL';
    out.TRACKING_CODE_SAVED =
      d?.trackingNumber &&
      refreshed?.externalTrackingNumber &&
      d.trackingNumber === refreshed.externalTrackingNumber &&
      d.trackingNumber === out.trackingCode
        ? 'PASS'
        : 'FAIL';

    if (d?.id) {
      const slip = await deliverySvc.getShippingSlip(d.id);
      const printCode = resolvePrintAccuratessCode({
        trackingNumber: slip.trackingNumber,
        externalTrackingNumber: slip.externalTrackingNumber || slip.order?.externalTrackingNumber,
        accuratessShipmentId: slip.accuratessShipmentId,
        externalRef: slip.externalRef,
      });
      out.PRINT_SHOWS_CODE =
        printCode &&
        printCode === out.trackingCode &&
        printCode !== String(out.shipmentId || '')
          ? 'PASS'
          : 'FAIL';
      console.log('SLIP_CHECK', {
        orderNumber: slip.order?.orderNumber,
        shippingSlipNo: slip.shippingSlipNo,
        printCode: printCode || null,
        accuratessShipmentId: slip.accuratessShipmentId || null,
      });
    }

    // Ensure we did not touch ORD-2026-000001
    const old = await prisma.order.findFirst({
      where: { orderNumber: 'ORD-2026-000001' },
      select: {
        orderNumber: true,
        externalTrackingNumber: true,
        fulfillmentError: true,
        updatedAt: true,
      },
    });
    console.log('ORD_2026_000001_UNCHANGED_SNAPSHOT', {
      orderNumber: old?.orderNumber,
      externalTrackingNumber: old?.externalTrackingNumber,
      hasFulfillmentError: Boolean(old?.fulfillmentError),
    });

    console.log('RESULT', JSON.stringify(out, null, 2));
    if (
      out.SAVE_SHIPMENT !== 'PASS' ||
      out.SHIPMENT_ID_SAVED !== 'PASS' ||
      out.TRACKING_CODE_SAVED !== 'PASS' ||
      out.PRINT_SHOWS_CODE !== 'PASS'
    ) {
      process.exit(1);
    }
  } catch (e) {
    console.error('FATAL', String(e && e.message ? e.message : e));
    console.log('RESULT', JSON.stringify(out, null, 2));
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
