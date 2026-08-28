/**
 * Dev-only end-to-end Accuratess integration test.
 * Usage: npm run test:accuratess
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { execSync } from 'child_process';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderFulfillmentService } from '../src/modules/delivery/order-fulfillment.service';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { AccuratessService } from '../src/modules/delivery/accuratess.service';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';
import { PERMISSIONS } from '../src/common/permissions';

type Check = { name: string; ok: boolean; detail: string };

const logLines: string[] = [];

function hookLogger() {
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    const orig = Logger.prototype[level];
    Logger.prototype[level] = function (message: unknown, ...rest: unknown[]) {
      logLines.push(
        `[${level}] ${String(message)}${rest.length ? ' ' + rest.map(String).join(' ') : ''}`,
      );
      return orig.call(this, message, ...rest);
    };
  }
}

function assert(condition: boolean, name: string, detail: string): Check {
  return { name, ok: condition, detail };
}

function scanLogsForSecrets(): Check[] {
  const checks: Check[] = [];
  const blob = logLines.join('\n');
  const sensitiveEnvKeys = [
    'ACCURATESS_PASSWORD',
    'ACCURATESS_TOKEN',
    'ACCURATESS_USERNAME',
    'JWT_SECRET',
  ] as const;

  for (const key of sensitiveEnvKeys) {
    const val = (process.env[key] || '').trim();
    if (val.length >= 4 && blob.includes(val)) {
      checks.push(
        assert(false, `logs omit ${key}`, `Found raw ${key} value in logs`),
      );
    } else {
      checks.push(assert(true, `logs omit ${key}`, 'No raw secret value in logs'));
    }
  }

  checks.push(
    assert(
      !/Bearer\s+[A-Za-z0-9\-._~+/]+=*/.test(blob),
      'logs omit Bearer token',
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/.test(blob)
        ? 'Bearer token pattern found in logs'
        : 'No Bearer token in logs',
    ),
  );
  checks.push(
    assert(
      !/"password"\s*:\s*"[^"]+"/.test(blob),
      'logs omit password field',
      /"password"\s*:\s*"[^"]+"/.test(blob)
        ? 'password JSON field found in logs'
        : 'No password field in logs',
    ),
  );

  return checks;
}

async function buildAdminUser(prisma: PrismaService): Promise<AuthUser> {
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@dar-alunotha.ly' },
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
    },
  });
  if (!admin) throw new Error('Admin user missing — run prisma db seed');

  const permissions = [
    ...new Set(
      admin.roles.flatMap((r) =>
        r.role.permissions.map((p) => p.permission.code),
      ),
    ),
  ];

  return {
    id: admin.id,
    email: admin.email,
    phone: admin.phone,
    name: admin.name,
    roles: admin.roles.map((r) => r.role.code),
    permissions: permissions.length ? permissions : Object.values(PERMISSIONS),
  };
}

async function pickExternalTestCity(
  accuratess: AccuratessService,
): Promise<{ city: string; area: string }> {
  const candidates = ['مصراتة', 'الزاوية', 'سبها', 'البيضاء', 'درنة', 'صبراتة', 'بنغازي'];
  for (const city of candidates) {
    const probe = await accuratess.saveShipment({
      orderNumber: `PROBE-${Date.now()}`,
      senderName: 'دار الأنوثة',
      recipientName: 'Probe Test',
      recipientPhone: '0912345678',
      recipientAddress: `${city} — probe`,
      city,
      area: 'المركز',
      price: 10,
      piecesCount: 1,
      paymentTypeCode: 'COLC',
      sourcePage: 'probe',
      account: null,
    });
    if ('ok' in probe && probe.ok && probe.shipment?.code) {
      console.log(`Probe succeeded for city=${city} code=${probe.shipment.code}`);
      return { city, area: 'المركز' };
    }
  }
  throw new Error('No Accurate destination city succeeded — check customer price list / zones');
}

async function createExternalTestOrder(
  prisma: PrismaService,
  adminId: string,
  city: string,
  area: string,
) {
  const stamp = Date.now();
  const orderNumber = `TEST-ACC-${stamp}`;
  const orderBarcode = `ORD-TEST-${stamp}`;

  return prisma.order.create({
    data: {
      orderNumber,
      orderBarcode,
      source: 'FACEBOOK',
      status: 'NEW',
      paymentMethod: 'COD',
      paymentStatus: 'UNPAID',
      deliveryType: 'EXTERNAL',
      subtotal: 100,
      deliveryFee: 25,
      totalAmount: 125,
      shippingName: 'عميل اختبار Accurate',
      shippingPhone: '0912345678',
      city,
      area,
      address: `شارع الاختبار — ${city}`,
      notes: `accuratess-integration-test-${stamp}`,
      createdById: adminId,
      items: {
        create: [
          {
            productName: 'منتج اختبار',
            quantity: 2,
            unitPrice: 50,
            lineTotal: 100,
          },
        ],
      },
    },
    include: { items: true },
  });
}

async function ensureAccuratessCredentials() {
  if (!process.env.ACCURATESS_ENABLED) process.env.ACCURATESS_ENABLED = 'true';
  if (!process.env.ACCURATESS_ENDPOINT) {
    process.env.ACCURATESS_ENDPOINT = 'https://mayar.lg.accuratess.com:8443/graphql';
  }
  if (process.env.ACCURATESS_TOKEN?.trim()) return;
  if (process.env.ACCURATESS_USERNAME?.trim() && process.env.ACCURATESS_PASSWORD) return;

  const backendRoot = path.resolve(__dirname, '..');
  const out = execSync('npm run accuratess:token --silent', {
    cwd: backendRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const match = out.match(
    /--- Accuratess token \(copy into UI settings \/ ACCURATESS_TOKEN\) ---\r?\n([\s\S]*?)\r?\n--- end token ---/,
  );
  if (match?.[1]?.trim()) {
    process.env.ACCURATESS_TOKEN = match[1].trim();
  }
}

async function main() {
  process.env.ACCURATESS_DEBUG = 'true';
  await ensureAccuratessCredentials();
  hookLogger();

  const checks: Check[] = [];
  let orderId: string | null = null;
  let firstCode: string | null = null;

  console.log('=== Accuratess integration test (dev) ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const prisma = app.get(PrismaService);
  const fulfillment = app.get(OrderFulfillmentService);
  const delivery = app.get(DeliveryService);
  const orders = app.get(OrdersService);
  const accuratess = app.get(AccuratessService);

  try {
    const admin = await buildAdminUser(prisma);
    checks.push(assert(Boolean(admin.id), 'admin user exists', admin.email || '—'));

    const configured = accuratess.isConfigured(null);
    checks.push(
      assert(
        configured,
        'Accuratess configured',
        configured
          ? 'ACCURATESS_ENABLED + credentials present'
          : 'Set ACCURATESS_ENABLED and token or username/password in backend/.env',
      ),
    );

    if (!configured) {
      printReport(checks);
      process.exitCode = 1;
      return;
    }

    const ping = await accuratess.ping(null);
    checks.push(
      assert(
        ping.ok,
        'Accuratess ping / auth',
        ping.ok ? 'Connected' : String(ping.error || 'ping failed'),
      ),
    );

    if (!ping.ok) {
      printReport(checks);
      process.exitCode = 1;
      return;
    }

    const destination = await pickExternalTestCity(accuratess);
    console.log(`Using destination city: ${destination.city}\n`);

    const order = await createExternalTestOrder(
      prisma,
      admin.id,
      destination.city,
      destination.area,
    );
    orderId = order.id;
    console.log(`Created test order ${order.orderNumber} (${order.id})\n`);

    // 1) routeOrder (store checkout path)
    const routed = await fulfillment.routeOrder(order.id);
    checks.push(
      assert(
        routed.fulfillmentType === 'EXTERNAL',
        'routeOrder → EXTERNAL',
        `type=${routed.fulfillmentType}`,
      ),
    );

    const afterRoute = await prisma.order.findUnique({ where: { id: order.id } });
    firstCode = afterRoute?.externalTrackingNumber || null;
    checks.push(
      assert(
        Boolean(firstCode),
        'routeOrder saves externalTrackingNumber',
        firstCode ? `code=${firstCode}` : `error=${afterRoute?.fulfillmentError || 'none'}`,
      ),
    );
    checks.push(
      assert(
        Boolean(afterRoute?.shippingLabelUrl),
        'routeOrder saves trackingUrl',
        afterRoute?.shippingLabelUrl ? 'trackingUrl present' : 'trackingUrl missing',
      ),
    );

    const deliveryAfterRoute = await prisma.delivery.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    checks.push(
      assert(
        deliveryAfterRoute?.trackingNumber === firstCode,
        'routeOrder saves delivery.trackingNumber',
        deliveryAfterRoute?.trackingNumber
          ? `trackingNumber=${deliveryAfterRoute.trackingNumber}`
          : 'no delivery.trackingNumber',
      ),
    );

    // 2) assign EXTERNAL (admin path) — idempotent
    const assign1 = await delivery.assign(admin, {
      orderId: order.id,
      type: 'EXTERNAL',
    });
    const assign1Code =
      assign1.trackingNumber ||
      (assign1 as { accuratess?: { shipment?: { code?: string } } }).accuratess?.shipment
        ?.code ||
      null;
    checks.push(
      assert(
        assign1Code === firstCode,
        'assign reuses existing tracking (idempotent)',
        `first=${firstCode} assign=${assign1Code}`,
      ),
    );

    const shipmentCount1 = await prisma.delivery.count({
      where: { orderId: order.id, trackingNumber: { not: null } },
    });
    const assign2 = await delivery.assign(admin, {
      orderId: order.id,
      type: 'EXTERNAL',
    });
    const shipmentCount2 = await prisma.delivery.count({
      where: { orderId: order.id, trackingNumber: { not: null } },
    });
    checks.push(
      assert(
        shipmentCount1 === shipmentCount2,
        'second assign does not create duplicate tracked delivery',
        `count before=${shipmentCount1} after=${shipmentCount2}`,
      ),
    );
    checks.push(
      assert(
        Boolean((assign2 as { accuratess?: { idempotent?: boolean } }).accuratess?.idempotent),
        'second assign returns idempotent flag',
        JSON.stringify((assign2 as { accuratess?: unknown }).accuratess ?? {}),
      ),
    );

    // 3) UI-facing reads
    const orderDetail = await orders.findOne(order.id);
    checks.push(
      assert(
        orderDetail.externalTrackingNumber === firstCode,
        'order detail exposes externalTrackingNumber',
        String(orderDetail.externalTrackingNumber),
      ),
    );

    const deliveryList = await delivery.listDeliveries(admin, undefined, 'EXTERNAL');
    const row = deliveryList.find((d) => d.orderId === order.id);
    checks.push(
      assert(
        row?.trackingNumber === firstCode || row?.accuratessCode === firstCode,
        'delivery list exposes tracking code',
        `trackingNumber=${row?.trackingNumber} accuratessCode=${row?.accuratessCode}`,
      ),
    );

    // 4) Failure scenario — invalid token must not succeed without code
    const directFail = await accuratess.saveShipment({
      orderNumber: `FAIL-${Date.now()}`,
      senderName: 'دار الأنوثة',
      recipientName: 'عميل فاشل',
      recipientPhone: '0911111111',
      recipientAddress: 'بنغازي — اختبار فشل',
      city: 'بنغازي',
      area: 'المركز',
      price: 50,
      paymentTypeCode: 'COLC',
      sourcePage: 'test-fail',
      account: {
        apiToken: 'invalid-token-for-test-only',
        endpoint: process.env.ACCURATESS_ENDPOINT,
      },
    });

    checks.push(
      assert(
        !directFail.ok && !('skipped' in directFail && directFail.skipped),
        'invalid token → saveShipment fails',
        'error' in directFail ? String(directFail.error) : JSON.stringify(directFail),
      ),
    );

    if (process.env.ACCURATESS_ENABLED === 'true') {
      const failOrder2 = await createExternalTestOrder(prisma, admin.id);
      await prisma.externalShippingAccount.deleteMany({
        where: { label: '__test_bad_account__' },
      });
      const fbPage = await prisma.facebookPage.findFirst();
      if (fbPage) {
        await prisma.externalShippingAccount.create({
          data: {
            facebookPageId: fbPage.id,
            label: '__test_bad_account__',
            apiToken: 'invalid-token-for-test-only',
            isActive: true,
          },
        });
        await prisma.order.update({
          where: { id: failOrder2.id },
          data: { facebookPageId: fbPage.id },
        });
        let assignFailThrown = false;
        let assignFailMsg = '';
        try {
          await delivery.assign(admin, { orderId: failOrder2.id, type: 'EXTERNAL' });
        } catch (err) {
          assignFailThrown = true;
          assignFailMsg = err instanceof Error ? err.message : String(err);
        }
        const fail2 = await prisma.order.findUnique({ where: { id: failOrder2.id } });
        checks.push(
          assert(
            assignFailThrown,
            'assign throws when Accurate configured but shipment fails',
            assignFailThrown ? assignFailMsg : 'no exception thrown',
          ),
        );
        checks.push(
          assert(
            !fail2?.externalTrackingNumber,
            'failed assign does not save tracking code on order',
            String(fail2?.externalTrackingNumber),
          ),
        );
        await prisma.externalShippingAccount.deleteMany({
          where: { label: '__test_bad_account__' },
        });
        await prisma.order.delete({ where: { id: failOrder2.id } }).catch(() => undefined);
      }
    }

    checks.push(...scanLogsForSecrets());

    printReport(checks);

    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      console.log('\nFailed checks:');
      for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
      process.exitCode = 1;
    } else {
      console.log('\nAll checks passed.');
    }
  } finally {
    if (orderId) {
      await prisma.delivery.deleteMany({ where: { orderId } }).catch(() => undefined);
      await prisma.orderItem.deleteMany({ where: { orderId } }).catch(() => undefined);
      await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    }
    await app.close();
  }
}

function printReport(checks: Check[]) {
  console.log('\n--- Test report ---');
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    if (!c.ok || c.detail) console.log(`       ${c.detail}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
