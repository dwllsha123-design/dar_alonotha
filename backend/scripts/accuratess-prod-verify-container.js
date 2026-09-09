/**
 * Production verify — run inside Railway container (/app).
 * Never prints secrets. Never touches ORD-2026-000001.
 */
const { NestFactory } = require('@nestjs/core');

function present(v) {
  return v != null && String(v).trim() !== '';
}

async function main() {
  if (process.env.ACCURATESS_WEBHOOK_ENABLED === 'true') {
    console.error('REFUSE: ACCURATESS_WEBHOOK_ENABLED must stay false');
    process.exit(2);
  }
  if (present(process.env.ACCURATESS_TOKEN)) {
    console.error('REFUSE: ACCURATESS_TOKEN must be absent');
    process.exit(2);
  }
  if (!present(process.env.ACCURATESS_USERNAME) || !present(process.env.ACCURATESS_PASSWORD)) {
    console.error('REFUSE: ACCURATESS_USERNAME/PASSWORD required');
    process.exit(2);
  }

  console.log('ENV_PRESENCE', {
    ACCURATESS_ENABLED: process.env.ACCURATESS_ENABLED === 'true' ? 'true' : 'false/unset',
    ACCURATESS_TOKEN: 'MISSING',
    ACCURATESS_USERNAME: 'SET',
    ACCURATESS_PASSWORD: 'SET',
    ACCURATESS_WEBHOOK_ENABLED: process.env.ACCURATESS_WEBHOOK_ENABLED || 'unset',
  });

  const { AppModule } = require('/app/dist/app.module');
  const { AccuratessService } = require('/app/dist/modules/delivery/accuratess.service');
  const { OrderFulfillmentService } = require('/app/dist/modules/delivery/order-fulfillment.service');
  const { DeliveryService } = require('/app/dist/modules/delivery/delivery.service');
  const { PrismaService } = require('/app/dist/prisma/prisma.service');
  const { resolvePrintAccuratessCode } = require('/app/dist/modules/delivery/accuratess-tracking');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const accuratess = app.get(AccuratessService);
  const fulfillment = app.get(OrderFulfillmentService);
  const deliverySvc = app.get(DeliveryService);
  const prisma = app.get(PrismaService);

  const out = {
    LOGIN_MUTATION: 'FAIL',
    FRESH_TOKEN_OBTAINED: 'NO',
    AUTHENTICATED_ME: 'FAIL',
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
    const loggedIn = await accuratess.login(true);
    out.LOGIN_MUTATION = loggedIn.ok ? 'PASS' : 'FAIL';
    out.FRESH_TOKEN_OBTAINED = loggedIn.ok && present(loggedIn.token) ? 'YES' : 'NO';
    console.log('LOGIN', { ok: Boolean(loggedIn.ok), error: loggedIn.error || null });
    if (!loggedIn.ok) {
      console.log('RESULT', JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const ping = await accuratess.ping();
    out.AUTHENTICATED_ME = ping.ok ? 'PASS' : 'FAIL';
    console.log('ME', { ok: Boolean(ping.ok), error: ping.error || null });
    if (!ping.ok) {
      console.log('RESULT', JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const city = Buffer.from('d985d8b5d8b1d8a7d8aad8a9', 'hex').toString('utf8');
    const area = Buffer.from('d8a7d984d985d8b1d983d8b2', 'hex').toString('utf8');
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
        shippingName: 'Accuratess Test Customer',
        shippingPhone: '0912345678',
        city,
        area,
        address: 'Test street - ' + city,
        notes: `accuratess-login-verify-${stamp}`,
        createdById: admin?.id || undefined,
        items: {
          create: [
            {
              productName: 'Accuratess test product',
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

    const routed = await fulfillment.routeOrder(order.id);

    const refreshed = await prisma.order.findUnique({
      where: { id: order.id },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const d = refreshed?.deliveries?.[0] || null;

    out.shipmentId = d?.accuratessShipmentId || routed?.accuratessShipmentId || null;
    out.trackingCode =
      d?.trackingNumber || refreshed?.externalTrackingNumber || routed?.externalTrackingNumber || null;

    out.SAVE_SHIPMENT =
      out.shipmentId && out.trackingCode && !routed?.error ? 'PASS' : 'FAIL';
    out.SHIPMENT_ID_SAVED = d?.accuratessShipmentId ? 'PASS' : 'FAIL';
    out.TRACKING_CODE_SAVED =
      d?.trackingNumber &&
      refreshed?.externalTrackingNumber &&
      d.trackingNumber === refreshed.externalTrackingNumber
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
        printCode: printCode || null,
        accuratessShipmentIdPresent: Boolean(slip.accuratessShipmentId),
        trackingCodePresent: Boolean(printCode),
      });
    }

    const old = await prisma.order.findFirst({
      where: { orderNumber: 'ORD-2026-000001' },
      select: {
        orderNumber: true,
        externalTrackingNumber: true,
        fulfillmentError: true,
      },
    });
    console.log('ORD_2026_000001_UNCHANGED_SNAPSHOT', {
      orderNumber: old?.orderNumber,
      externalTrackingNumber: old?.externalTrackingNumber,
      hasFulfillmentError: Boolean(old?.fulfillmentError),
    });

    console.log('ROUTE_ERROR', routed?.error || routed?.fulfillmentError || null);
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
