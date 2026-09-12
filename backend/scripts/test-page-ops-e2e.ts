/**
 * Facebook Page operational requirements — storefront attribution,
 * shipping-account isolation, label scope, delete/inactive rules.
 *
 * Requires isolated Postgres (never production):
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/dar_alonotha_phase15?schema=public
 *
 * Run:
 *   npm run test:page-ops
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { OrderFulfillmentService } from '../src/modules/delivery/order-fulfillment.service';
import { ROLE_CODES } from '../src/common/permissions';
import { PERMISSION_META } from '../src/common/permissions';

const TEST_DB_HINT = 'dar_alonotha_phase15';
const PASSWORD = 'PageOpsTest!234';
const BASE = 'http://127.0.0.1:3101/api/v1';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function assertDbSafe(url: string) {
  if (!url.includes(TEST_DB_HINT)) {
    throw new Error(
      `Refusing to run: DATABASE_URL must target isolated DB containing "${TEST_DB_HINT}"`,
    );
  }
  if (/railway|rlwy|neon\.tech|supabase|prod/i.test(url)) {
    throw new Error('Refusing to run against a cloud/production-looking DATABASE_URL');
  }
}

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, data: json?.data ?? json, message: json?.message };
}

async function ensurePermissions(prisma: PrismaClient) {
  for (const p of PERMISSION_META) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        module: p.module,
      },
      update: {
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        module: p.module,
      },
    });
  }
  const all = await prisma.permission.findMany();
  const byCode = Object.fromEntries(all.map((p) => [p.code, p]));
  const adminRole = await prisma.role.upsert({
    where: { code: ROLE_CODES.ADMIN },
    create: {
      code: ROLE_CODES.ADMIN,
      nameAr: 'مدير',
      nameEn: 'admin',
      isSystem: true,
    },
    update: {},
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: all.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
  });
  return { adminRole, byCode };
}

async function main() {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'page-ops-test-secret-must-be-32chars!';
  process.env.UPLOAD_ROOT =
    process.env.UPLOAD_ROOT || `${process.cwd()}/uploads-page-ops-test`;
  process.env.ACCURATESS_ENABLED = 'false';

  const dbUrl = process.env.DATABASE_URL || '';
  assertDbSafe(dbUrl);

  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('\n=== Page Ops seed ===');
  const { adminRole } = await ensurePermissions(prisma);
  const hash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { phone: '0910000091' },
    create: {
      name: 'Page Ops Admin',
      phone: '0910000091',
      passwordHash: hash,
      status: 'ACTIVE',
    },
    update: { passwordHash: hash, status: 'ACTIVE' },
  });
  await prisma.userRole.deleteMany({ where: { userId: admin.id } });
  await prisma.userRole.create({
    data: { userId: admin.id, roleId: adminRole.id },
  });

  // Clean prior fixtures by publicCode range
  const codes = [8801, 8802, 8803, 8804];
  for (const code of codes) {
    const old = await prisma.facebookPage.findUnique({ where: { publicCode: code } });
    if (old) {
      await prisma.externalShippingAccount.deleteMany({
        where: { facebookPageId: old.id },
      });
      await prisma.orderItem.deleteMany({
        where: { order: { facebookPageId: old.id } },
      });
      await prisma.delivery.deleteMany({
        where: { order: { facebookPageId: old.id } },
      });
      await prisma.order.deleteMany({ where: { facebookPageId: old.id } });
      await prisma.referralVisit.deleteMany({ where: { pageId: old.id } });
      await prisma.facebookPageEmployee.deleteMany({ where: { pageId: old.id } });
      await prisma.facebookPage.delete({ where: { id: old.id } });
    }
  }

  const pageA = await prisma.facebookPage.create({
    data: { name: 'Page Ops A', publicCode: 8801, status: 'ACTIVE' },
  });
  const pageB = await prisma.facebookPage.create({
    data: { name: 'Page Ops B', publicCode: 8802, status: 'ACTIVE' },
  });
  const pageInactive = await prisma.facebookPage.create({
    data: { name: 'Page Ops Inactive', publicCode: 8803, status: 'INACTIVE' },
  });

  const acctA = await prisma.externalShippingAccount.create({
    data: {
      facebookPageId: pageA.id,
      label: 'Account A',
      apiToken: 'token-page-a-secret-aaaa',
      isActive: true,
    },
  });
  const acctB = await prisma.externalShippingAccount.create({
    data: {
      facebookPageId: pageB.id,
      label: 'Account B',
      apiToken: 'token-page-b-secret-bbbb',
      isActive: true,
    },
  });

  // Product + variant for checkout
  const product = await prisma.product.create({
    data: {
      nameAr: `منتج Page Ops ${Date.now()}`,
      sku: `PO-PROD-${Date.now()}`,
      status: 'ACTIVE',
      basePrice: 50,
      retailPrice: 50,
      variants: {
        create: {
          sku: `PO-VAR-${Date.now()}`,
          nameAr: 'Default',
          price: 50,
          retailPrice: 50,
          isActive: true,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  const warehouse =
    (await prisma.warehouse.findFirst()) ||
    (await prisma.warehouse.create({
      data: {
        nameAr: 'Page Ops WH',
        code: `POWH-${Date.now()}`,
        isDefault: true,
      },
    }));
  await prisma.stockItem.upsert({
    where: {
      warehouseId_variantId: {
        warehouseId: warehouse.id,
        variantId: variant.id,
      },
    },
    create: {
      warehouseId: warehouse.id,
      variantId: variant.id,
      quantityOnHand: 100,
    },
    update: { quantityOnHand: 100 },
  });

  await prisma.deliveryZone.upsert({
    where: { city_area: { city: 'طرابلس', area: 'حي الأندلس' } },
    create: {
      city: 'طرابلس',
      area: 'حي الأندلس',
      maleFee: 15,
      femaleFee: 20,
      maleEnabled: true,
      femaleEnabled: true,
      isActive: true,
    },
    update: { isActive: true },
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'r/:pageCode', method: RequestMethod.GET },
      { path: 'r/:pageCode/:agentCode', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(3101);

  const login = await api('/auth/login', {
    method: 'POST',
    body: { phone: admin.phone, password: PASSWORD },
  });
  const token = login.data?.accessToken || login.data?.token;
  ok('admin login', Boolean(token), String(login.status));

  const fulfillment = app.get(OrderFulfillmentService);

  console.log('\n=== Storefront attribution ===');

  const checkoutA = await api('/store/checkout', {
    method: 'POST',
    body: {
      name: 'Customer A',
      phone: `0911${Date.now().toString().slice(-7)}`,
      city: 'طرابلس',
      area: 'حي الأندلس',
      address: 'شارع 1',
      pagePublicCode: pageA.publicCode,
      items: [{ variantId: variant.id, quantity: 1 }],
    },
  });
  const pageFromA =
    checkoutA.data?.sourcePage?.id ||
    checkoutA.data?.facebookPageId ||
    (
      await prisma.order.findFirst({
        where: { orderNumber: checkoutA.data?.orderNumber },
        select: { facebookPageId: true },
      })
    )?.facebookPageId;
  ok(
    'Page A link → facebookPageId = Page A',
    checkoutA.status < 400 && pageFromA === pageA.id,
    `status=${checkoutA.status} page=${pageFromA}`,
  );

  const checkoutB = await api('/store/checkout', {
    method: 'POST',
    body: {
      name: 'Customer B',
      phone: `0912${Date.now().toString().slice(-7)}`,
      city: 'طرابلس',
      area: 'حي الأندلس',
      address: 'شارع 2',
      pagePublicCode: pageB.publicCode,
      items: [{ variantId: variant.id, quantity: 1 }],
    },
  });
  const pageFromB =
    checkoutB.data?.sourcePage?.id ||
    checkoutB.data?.facebookPageId ||
    (
      await prisma.order.findFirst({
        where: { orderNumber: checkoutB.data?.orderNumber },
        select: { facebookPageId: true },
      })
    )?.facebookPageId;
  ok(
    'Page B link → facebookPageId = Page B',
    checkoutB.status < 400 && pageFromB === pageB.id,
    `status=${checkoutB.status} page=${pageFromB}`,
  );

  const spoof = await api('/store/checkout', {
    method: 'POST',
    body: {
      name: 'Spoof',
      phone: `0913${Date.now().toString().slice(-7)}`,
      city: 'طرابلس',
      area: 'حي الأندلس',
      address: 'شارع 3',
      pagePublicCode: pageA.publicCode,
      facebookPageId: pageB.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    },
  });
  const spoofPage =
    spoof.data?.sourcePage?.id ||
    (
      await prisma.order.findFirst({
        where: { orderNumber: spoof.data?.orderNumber },
        select: { facebookPageId: true },
      })
    )?.facebookPageId;
  ok(
    'cannot spoof facebookPageId on public checkout',
    spoof.status === 400 || spoofPage === pageA.id,
    `status=${spoof.status} page=${spoofPage} msg=${spoof.message || spoof.json?.message}`,
  );

  const inactiveCheckout = await api('/store/checkout', {
    method: 'POST',
    body: {
      name: 'Inactive Cust',
      phone: `0914${Date.now().toString().slice(-7)}`,
      city: 'طرابلس',
      area: 'حي الأندلس',
      address: 'شارع 4',
      pagePublicCode: pageInactive.publicCode,
      items: [{ variantId: variant.id, quantity: 1 }],
    },
  });
  ok(
    'inactive page cannot receive new public orders',
    inactiveCheckout.status >= 400,
    `status=${inactiveCheckout.status} msg=${inactiveCheckout.message || inactiveCheckout.json?.message}`,
  );

  console.log('\n=== Shipping uses global Accuratess ===');

  const resolvedA = await fulfillment.resolvePageAccount({
    facebookPageId: pageA.id,
  });
  const resolvedB = await fulfillment.resolvePageAccount({
    facebookPageId: pageB.id,
  });
  ok(
    'Page A shipment uses global Accuratess (no page-specific account)',
    resolvedA == null,
    `resolved=${resolvedA?.id}`,
  );
  ok(
    'Page B shipment uses same global Accuratess path',
    resolvedB == null,
    `resolved=${resolvedB?.id}`,
  );
  ok(
    'Page A and Page B share global credentials path',
    resolvedA == null && resolvedB == null,
  );

  let missingThrew = false;
  try {
    fulfillment.requirePageShippingAccount(
      { facebookPageId: pageInactive.id },
      null,
    );
  } catch {
    missingThrew = true;
  }
  ok(
    'page with no ExternalShippingAccount is not blocked',
    missingThrew === false,
  );

  const orphanResolved = await fulfillment.resolvePageAccount({
    facebookPageId: pageInactive.id,
  });
  ok(
    'page without ExternalShippingAccount still resolves to global (null account)',
    orphanResolved == null,
  );

  // Non-page / legacy order path also uses global
  const legacyResolved = await fulfillment.resolvePageAccount({
    facebookPageId: null,
    pagePublicCode: null,
  });
  ok(
    'legacy/non-page order uses global Accuratess path',
    legacyResolved == null,
  );

  console.log('\n=== Labels scope ===');

  const stamp = Date.now();
  const orderA = await prisma.order.create({
    data: {
      orderNumber: `PO-A-${stamp}`,
      orderBarcode: `PO-A-${stamp}`,
      status: 'CONFIRMED',
      source: 'WEBSITE',
      deliveryType: 'EXTERNAL',
      fulfillmentType: 'EXTERNAL',
      totalAmount: 50,
      subtotal: 50,
      deliveryFee: 15,
      city: 'مصراتة',
      area: 'المركزي',
      shippingName: 'Label A',
      shippingPhone: '0911111111',
      pagePublicCode: pageA.publicCode,
      facebookPage: { connect: { id: pageA.id } },
      warehouse: { connect: { id: warehouse.id } },
      customer: {
        create: {
          name: 'Label A',
          phone: `0921${String(stamp).slice(-7)}`,
        },
      },
      items: {
        create: {
          variantId: variant.id,
          productName: product.nameAr,
          quantity: 1,
          unitPrice: 50,
          lineTotal: 50,
        },
      },
    },
  });
  const orderB = await prisma.order.create({
    data: {
      orderNumber: `PO-B-${stamp}`,
      orderBarcode: `PO-B-${stamp}`,
      status: 'CONFIRMED',
      source: 'WEBSITE',
      deliveryType: 'EXTERNAL',
      fulfillmentType: 'EXTERNAL',
      totalAmount: 50,
      subtotal: 50,
      deliveryFee: 15,
      city: 'مصراتة',
      area: 'المركزي',
      shippingName: 'Label B',
      shippingPhone: '0912222222',
      pagePublicCode: pageB.publicCode,
      facebookPage: { connect: { id: pageB.id } },
      warehouse: { connect: { id: warehouse.id } },
      customer: {
        create: {
          name: 'Label B',
          phone: `0922${String(stamp).slice(-7)}`,
        },
      },
      items: {
        create: {
          variantId: variant.id,
          productName: product.nameAr,
          quantity: 1,
          unitPrice: 50,
          lineTotal: 50,
        },
      },
    },
  });

  const slipsA = await api('/delivery/slips/bulk', {
    method: 'POST',
    token,
    body: { facebookPageId: pageA.id },
  });
  const slipOrderNums = (slipsA.data?.slips || []).map(
    (s: any) => s.order?.orderNumber || s.orderNumber,
  );
  ok(
    'print Page A labels → Page A orders only',
    slipsA.status < 400 &&
      slipOrderNums.every((n: string) => String(n).includes('PO-A') || !String(n).includes('PO-B')) &&
      !slipOrderNums.includes(orderB.orderNumber),
    `status=${slipsA.status} nums=${JSON.stringify(slipOrderNums)}`,
  );

  const crafted = await api('/delivery/slips/bulk', {
    method: 'POST',
    token,
    body: {
      facebookPageId: pageA.id,
      orderIds: [orderA.id, orderB.id],
    },
  });
  ok(
    'cannot include Page B orders through crafted IDs',
    crafted.status >= 400,
    `status=${crafted.status} msg=${crafted.message || crafted.json?.message}`,
  );

  console.log('\n=== Delete / deactivate ===');

  const emptyPage = await prisma.facebookPage.create({
    data: {
      name: 'Page Ops Empty',
      publicCode: 8804,
      status: 'ACTIVE',
    },
  });
  const delEmpty = await api(`/facebook-pages/${emptyPage.id}`, {
    method: 'DELETE',
    token,
  });
  ok('page with zero orders can be deleted', delEmpty.status < 400, String(delEmpty.status));

  const delWithOrders = await api(`/facebook-pages/${pageA.id}`, {
    method: 'DELETE',
    token,
  });
  const delMsg = String(
    delWithOrders.message ||
      delWithOrders.json?.message ||
      delWithOrders.data?.message ||
      '',
  );
  ok(
    'page with orders cannot be deleted',
    delWithOrders.status >= 400 &&
      delMsg.includes('لا يمكن حذف الصفحة لوجود طلبات مرتبطة بها'),
    `status=${delWithOrders.status} msg=${delMsg}`,
  );

  const deactivate = await api(`/facebook-pages/${pageA.id}`, {
    method: 'PATCH',
    token,
    body: { status: 'INACTIVE' },
  });
  const stillThere = await prisma.order.findUnique({ where: { id: orderA.id } });
  ok(
    'deactivation preserves history',
    deactivate.status < 400 &&
      stillThere?.facebookPageId === pageA.id,
    `status=${deactivate.status} orderPage=${stillThere?.facebookPageId}`,
  );

  const inactiveCreate = await api('/orders', {
    method: 'POST',
    token,
    body: {
      source: 'FACEBOOK',
      facebookPageId: pageA.id,
      customerName: 'Blocked',
      customerPhone: `0919${Date.now().toString().slice(-7)}`,
      shippingName: 'Blocked',
      shippingPhone: `0919${Date.now().toString().slice(-7)}`,
      city: 'طرابلس',
      area: 'حي الأندلس',
      items: [{ variantId: variant.id, quantity: 1 }],
    },
  });
  ok(
    'employees/admin cannot create new orders for inactive page',
    inactiveCreate.status >= 400,
    `status=${inactiveCreate.status}`,
  );

  console.log('\n=== Links ===');
  const detail = await api(`/facebook-pages/${pageB.id}`, { token });
  ok(
    'storefront URL uses ?page=publicCode',
    String(detail.data?.storefrontUrl || '').includes(`page=${pageB.publicCode}`),
    String(detail.data?.storefrontUrl),
  );

  await app.close();
  await prisma.$disconnect();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
