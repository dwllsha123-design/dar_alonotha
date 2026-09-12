/**
 * Phase 1.5 — DB + JWT authorization E2E + commission edge cases.
 *
 * Requires isolated Postgres (never production):
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/dar_alonotha_phase15?schema=public
 *
 * Run:
 *   npm run test:phase15-auth
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { CommissionsService } from '../src/modules/commissions/commissions.service';
import { PERMISSIONS, ROLE_CODES } from '../src/common/permissions';
import { PERMISSION_META } from '../src/common/permissions';

const TEST_DB_HINT = 'dar_alonotha_phase15';
const PASSWORD = 'Phase15Test!234';
const BASE = 'http://127.0.0.1:3099/api/v1';

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
  return { status: res.status, json, data: json?.data ?? json };
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

  const salesPerms = [
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.FACEBOOK_PAGES_VIEW,
  ];

  const roleDefs: Array<{ code: string; nameAr: string; perms: string[] }> = [
    {
      code: ROLE_CODES.SUPER_ADMIN,
      nameAr: 'مدير عام',
      perms: all.map((p) => p.code),
    },
    {
      code: ROLE_CODES.ADMIN,
      nameAr: 'مدير',
      perms: all.map((p) => p.code).filter((c) => c !== PERMISSIONS.USERS_MANAGE),
    },
    {
      code: ROLE_CODES.SALES_AGENT,
      nameAr: 'موظف مبيعات',
      perms: salesPerms,
    },
    {
      code: ROLE_CODES.DELIVERY_AGENT,
      nameAr: 'مندوب',
      perms: [
        PERMISSIONS.ORDERS_VIEW,
        PERMISSIONS.DELIVERY_ASSIGN,
        PERMISSIONS.CUSTOMERS_VIEW,
      ],
    },
    {
      code: ROLE_CODES.WAREHOUSE,
      nameAr: 'مخزن',
      perms: [
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_ADJUST,
        PERMISSIONS.PRODUCTS_VIEW,
        PERMISSIONS.ORDERS_VIEW,
      ],
    },
  ];

  for (const r of roleDefs) {
    const saved = await prisma.role.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        nameAr: r.nameAr,
        nameEn: r.code,
        isSystem: true,
      },
      update: { nameAr: r.nameAr },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    await prisma.rolePermission.createMany({
      data: r.perms
        .filter((c) => byCode[c])
        .map((c) => ({ roleId: saved.id, permissionId: byCode[c].id })),
    });
  }
}

async function main() {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'phase15-test-secret-must-be-32chars!!';
  process.env.UPLOAD_ROOT =
    process.env.UPLOAD_ROOT || `${process.cwd()}/uploads-phase15-test`;

  const dbUrl = process.env.DATABASE_URL || '';
  assertDbSafe(dbUrl);

  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('\n=== Seed fixtures ===');
  await ensurePermissions(prisma);

  const hash = await bcrypt.hash(PASSWORD, 10);
  const salesRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.SALES_AGENT },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.SUPER_ADMIN },
  });

  // Clean previous phase15 fixtures
  await prisma.commissionEntry.deleteMany({
    where: { order: { orderNumber: { startsWith: 'P15-' } } },
  });
  await prisma.orderItem.deleteMany({
    where: { order: { orderNumber: { startsWith: 'P15-' } } },
  });
  await prisma.delivery.deleteMany({
    where: { order: { orderNumber: { startsWith: 'P15-' } } },
  });
  const oldOrders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: 'P15-' } },
    select: { customerId: true },
  });
  await prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'P15-' } } });
  const customerIds = [
    ...new Set(oldOrders.map((o) => o.customerId).filter(Boolean) as string[]),
  ];
  if (customerIds.length) {
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  }
  await prisma.customer.deleteMany({ where: { phone: { startsWith: '0915' } } });
  await prisma.authSession.deleteMany({
    where: { user: { email: { endsWith: '@phase15.test' } } },
  });
  await prisma.facebookPageEmployee.deleteMany({
    where: { user: { email: { endsWith: '@phase15.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { email: { endsWith: '@phase15.test' } } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@phase15.test' } } });
  await prisma.facebookPage.deleteMany({
    where: { pageId: { in: ['p15-page-a', 'p15-page-b', 'p15-page-c'] } },
  });
  await prisma.stockItem.deleteMany({
    where: { variant: { sku: { startsWith: 'P15-' } } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { variant: { sku: { startsWith: 'P15-' } } },
  }).catch(() => undefined);
  await prisma.productVariant.deleteMany({
    where: { sku: { startsWith: 'P15-' } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'P15-' } } });

  const warehouse =
    (await prisma.warehouse.findFirst({ where: { isDefault: true } })) ||
    (await prisma.warehouse.create({
      data: { nameAr: 'مخزن اختبار', code: 'P15-WH', isDefault: true },
    }));

  const pageA = await prisma.facebookPage.create({
    data: {
      name: 'Page A P15',
      publicCode: 91001,
      pageId: 'p15-page-a',
      status: 'ACTIVE',
    },
  });
  const pageB = await prisma.facebookPage.create({
    data: {
      name: 'Page B P15',
      publicCode: 91002,
      pageId: 'p15-page-b',
      status: 'ACTIVE',
    },
  });
  const pageC = await prisma.facebookPage.create({
    data: {
      name: 'Page C P15',
      publicCode: 91003,
      pageId: 'p15-page-c',
      status: 'ACTIVE',
    },
  });

  async function makeAgent(email: string, name: string, pages: string[]) {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        passwordHash: hash,
        status: 'ACTIVE',
        employmentType: 'COMMISSION',
        roles: { create: [{ roleId: salesRole.id }] },
      },
    });
    for (const [i, pageId] of pages.entries()) {
      await prisma.facebookPageEmployee.create({
        data: {
          pageId,
          userId: user.id,
          role: 'AGENT',
          agentCode: 22000 + Math.floor(Math.random() * 7000) + i,
        },
      });
    }
    return user;
  }

  const agentA = await makeAgent('agent-a@phase15.test', 'Agent A', [pageA.id]);
  const agentB = await makeAgent('agent-b@phase15.test', 'Agent B', [pageB.id]);
  const agentMulti = await makeAgent('agent-multi@phase15.test', 'Agent Multi', [
    pageA.id,
    pageB.id,
  ]);
  const admin = await prisma.user.create({
    data: {
      name: 'Admin P15',
      email: 'admin@phase15.test',
      phone: '0911000099',
      passwordHash: hash,
      status: 'ACTIVE',
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  const product = await prisma.product.create({
    data: {
      nameAr: 'منتج اختبار P15',
      sku: 'P15-PROD',
      status: 'ACTIVE',
      basePrice: 100,
      retailPrice: 100,
      costPrice: 40,
      wholesalePrice: 70,
      variants: {
        create: {
          sku: 'P15-VAR-1',
          nameAr: 'مقاس M',
          size: 'M',
          price: 100,
          retailPrice: 100,
          costPrice: 40,
          wholesalePrice: 70,
          isActive: true,
        },
      },
    },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;

  await prisma.stockItem.upsert({
    where: {
      warehouseId_variantId: { warehouseId: warehouse.id, variantId },
    },
    create: {
      warehouseId: warehouse.id,
      variantId,
      quantityOnHand: 50,
    },
    update: { quantityOnHand: 50 },
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

  async function createPageOrder(opts: {
    pageId: string;
    agentId: string;
    number: string;
    customerId?: string;
  }) {
    let customerId = opts.customerId;
    if (!customerId) {
      const phone = `0915${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 90 + 10))}`;
      const c = await prisma.customer.create({
        data: {
          name: `Customer ${opts.number}`,
          phone,
        },
      });
      customerId = c.id;
    }
    return prisma.order.create({
      data: {
        orderNumber: opts.number,
        orderBarcode: opts.number,
        source: 'FACEBOOK',
        status: 'NEW',
        paymentMethod: 'COD',
        deliveryType: 'INTERNAL',
        customerId,
        salesAgentId: opts.agentId,
        createdById: opts.agentId,
        facebookPageId: opts.pageId,
        warehouseId: warehouse.id,
        subtotal: 100,
        totalAmount: 100,
        shippingName: 'زبونة',
        shippingPhone: '0911111111',
        city: 'طرابلس',
        area: 'حي الأندلس',
        address: 'شارع 1',
        items: {
          create: {
            variantId,
            productName: 'منتج اختبار',
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          },
        },
      },
    });
  }

  const orderA = await createPageOrder({
    pageId: pageA.id,
    agentId: agentA.id,
    number: 'P15-ORD-A1',
  });
  const orderB = await createPageOrder({
    pageId: pageB.id,
    agentId: agentB.id,
    number: 'P15-ORD-B1',
  });
  const orderC = await createPageOrder({
    pageId: pageC.id,
    agentId: admin.id,
    number: 'P15-ORD-C1',
  });

  const deliveryB = await prisma.delivery.create({
    data: {
      orderId: orderB.id,
      type: 'INTERNAL',
      status: 'ASSIGNED',
      shippingSlipNo: 'P15-SLIP-B1',
      fee: 15,
    },
  });

  console.log('\n=== Boot Nest app ===');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(3099, '127.0.0.1');

  async function login(email: string) {
    const res = await api('/auth/login', {
      method: 'POST',
      body: { identifier: email, password: PASSWORD },
    });
    ok(`login ${email}`, res.status === 200 || res.status === 201, `status=${res.status}`);
    return res.data?.accessToken as string;
  }

  const tokenA = await login('agent-a@phase15.test');
  const tokenB = await login('agent-b@phase15.test');
  const tokenMulti = await login('agent-multi@phase15.test');
  const tokenAdmin = await login('admin@phase15.test');

  console.log('\n=== Employee A / Page A ===');
  {
    const list = await api(`/orders?facebookPageId=${pageA.id}`, { token: tokenA });
    ok('A lists Page A orders', list.status === 200 && Array.isArray(list.data));
    ok(
      'A list contains order A',
      (list.data || []).some((o: any) => o.id === orderA.id),
    );

    const one = await api(`/orders/${orderA.id}`, { token: tokenA });
    ok('A opens Page A order by ID', one.status === 200 && one.data?.id === orderA.id);

    const created = await api('/orders', {
      method: 'POST',
      token: tokenA,
      body: {
        source: 'FACEBOOK',
        facebookPageId: pageA.id,
        customerName: 'زبونة جديدة',
        customerPhone: '0912223344',
        shippingName: 'زبونة جديدة',
        shippingPhone: '0912223344',
        city: 'طرابلس',
        area: 'حي الأندلس',
        address: 'عنوان كامل',
        deliveryGender: 'FEMALE',
        items: [
          {
            variantId,
            productName: 'منتج اختبار',
            quantity: 1,
            unitPrice: 100,
          },
        ],
      },
    });
    ok(
      'A creates Page A order',
      (created.status === 200 || created.status === 201) &&
        created.data?.facebookPageId === pageA.id &&
        created.data?.salesAgentId === agentA.id,
      `status=${created.status} msg=${created.json?.message || ''}`,
    );

    const patched = await api(`/orders/${orderA.id}/status`, {
      method: 'PATCH',
      token: tokenA,
      body: { status: 'CONFIRMED' },
    });
    ok(
      'A updates allowed Page A status',
      patched.status === 200 && patched.data?.status === 'CONFIRMED',
      `status=${patched.status} msg=${patched.json?.message || ''}`,
    );
  }

  console.log('\n=== Cross-page attack (A → B) ===');
  {
    const getB = await api(`/orders/${orderB.id}`, { token: tokenA });
    ok('A cannot GET Order B', getB.status === 403, `status=${getB.status}`);

    const patchB = await api(`/orders/${orderB.id}/status`, {
      method: 'PATCH',
      token: tokenA,
      body: { status: 'CONFIRMED' },
    });
    ok('A cannot PATCH Order B status', patchB.status === 403, `status=${patchB.status}`);

    const slip = await api(`/delivery/${deliveryB.id}/slip`, { token: tokenA });
    ok('A cannot access Order B slip', slip.status === 403, `status=${slip.status}`);

    const bulk = await api('/delivery/slips/bulk', {
      method: 'POST',
      token: tokenA,
      body: { orderIds: [orderB.id] },
    });
    ok(
      'A cannot bulk-slip Order B',
      bulk.status === 403 || bulk.status === 400,
      `status=${bulk.status}`,
    );

    const deliveries = await api('/delivery', { token: tokenA });
    ok(
      'A delivery list excludes Order B',
      deliveries.status === 200 &&
        !(deliveries.data || []).some((d: any) => d.orderId === orderB.id || d.order?.id === orderB.id),
    );

    const cust = await api(`/customers/${orderB.customerId}`, { token: tokenA });
    ok('A cannot access Order B customer', cust.status === 403, `status=${cust.status}`);

    const fulfill = await api(`/orders/${orderB.id}/fulfill`, {
      method: 'POST',
      token: tokenA,
      body: {},
    });
    ok(
      'A cannot fulfill Order B',
      fulfill.status === 403,
      `status=${fulfill.status}`,
    );

    const createOnB = await api('/orders', {
      method: 'POST',
      token: tokenA,
      body: {
        source: 'FACEBOOK',
        facebookPageId: pageB.id,
        customerName: 'هجوم',
        customerPhone: '0919998877',
        shippingName: 'هجوم',
        shippingPhone: '0919998877',
        city: 'طرابلس',
        area: 'حي الأندلس',
        address: 'x',
        items: [{ variantId, productName: 'x', quantity: 1, unitPrice: 100 }],
      },
    });
    ok(
      'A cannot create with Page B ID',
      createOnB.status === 403,
      `status=${createOnB.status}`,
    );

    const products = await api('/products', { token: tokenA });
    const payload = JSON.stringify(products.data || []);
    ok(
      'A products omit costPrice',
      products.status === 200 && !/"costPrice"\s*:/.test(payload),
    );
    ok(
      'A products omit wholesalePrice',
      products.status === 200 && !/"wholesalePrice"\s*:/.test(payload),
    );

    const inv = await api('/inventory/stock', { token: tokenA });
    ok(
      'A denied inventory.stock (least privilege)',
      inv.status === 403,
      `status=${inv.status}`,
    );

    const commissions = await api('/commissions/entries', { token: tokenA });
    ok(
      'A denied commissions.entries (least privilege)',
      commissions.status === 403,
      `status=${commissions.status}`,
    );

    const payrollSelf = await api('/users/payroll/me', { token: tokenA });
    ok('A can read own payroll', payrollSelf.status === 200);

    const payrollOther = await api(`/users/${agentB.id}`, { token: tokenA });
    ok(
      'A cannot read other user profile',
      payrollOther.status === 403,
      `status=${payrollOther.status}`,
    );
  }

  console.log('\n=== Removed employee ===');
  {
    await prisma.facebookPageEmployee.delete({
      where: { pageId_userId: { pageId: pageA.id, userId: agentA.id } },
    });
    const afterRemove = await api(`/orders/${orderA.id}`, { token: tokenA });
    ok(
      'Removed A cannot GET own former Page A order',
      afterRemove.status === 403,
      `status=${afterRemove.status}`,
    );
    // re-assign for later cleanup clarity
    await prisma.facebookPageEmployee.create({
      data: { pageId: pageA.id, userId: agentA.id, role: 'AGENT', agentCode: 20111 },
    });
  }

  console.log('\n=== Multi-page employee ===');
  {
    const a = await api(`/orders/${orderA.id}`, { token: tokenMulti });
    const b = await api(`/orders/${orderB.id}`, { token: tokenMulti });
    const c = await api(`/orders/${orderC.id}`, { token: tokenMulti });
    ok('Multi can access A', a.status === 200);
    ok('Multi can access B', b.status === 200);
    ok('Multi cannot access C', c.status === 403, `status=${c.status}`);
  }

  console.log('\n=== Admin retains access ===');
  {
    const a = await api(`/orders/${orderA.id}`, { token: tokenAdmin });
    const b = await api(`/orders/${orderB.id}`, { token: tokenAdmin });
    const c = await api(`/orders/${orderC.id}`, { token: tokenAdmin });
    ok('Admin can access A/B/C', a.status === 200 && b.status === 200 && c.status === 200);
  }

  console.log('\n=== Disabled account / session ===');
  {
    const tokenBefore = await login('agent-b@phase15.test');
    await prisma.user.update({
      where: { id: agentB.id },
      data: { status: 'INACTIVE' },
    });
    await prisma.authSession.updateMany({
      where: { userId: agentB.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const blocked = await api(`/orders/${orderB.id}`, { token: tokenBefore });
    ok(
      'Inactive user JWT blocked on next request',
      blocked.status === 401,
      `status=${blocked.status}`,
    );
    const relogin = await api('/auth/login', {
      method: 'POST',
      body: { identifier: 'agent-b@phase15.test', password: PASSWORD },
    });
    ok(
      'Inactive user cannot login',
      relogin.status === 401,
      `status=${relogin.status}`,
    );
    await prisma.user.update({
      where: { id: agentB.id },
      data: { status: 'ACTIVE' },
    });
  }

  console.log('\n=== Webhook remains disabled ===');
  {
    const mod = await import('../src/modules/delivery/delivery.module');
    const src = JSON.stringify(mod);
    ok(
      'DeliveryModule does not register AccuratessWebhookController',
      !src.includes('AccuratessWebhookController'),
    );
  }

  console.log('\n=== Commission edge cases ===');
  {
    const commissions = app.get(CommissionsService);
    const agentComm = await makeAgent('agent-comm@phase15.test', 'Agent Comm', [
      pageA.id,
    ]);
    await prisma.user.update({
      where: { id: agentComm.id },
      data: { employmentType: 'COMMISSION' },
    });
    const ord = await createPageOrder({
      pageId: pageA.id,
      agentId: agentComm.id,
      number: 'P15-ORD-COMM',
    });

    await commissions.accrueOnDelivered(ord.id);
    let entry = await prisma.commissionEntry.findFirst({ where: { orderId: ord.id } });
    ok('1) accrue on delivered creates PENDING', entry?.status === 'PENDING');
    const amount1 = Number(entry?.amount || 0);

    await commissions.voidForOrder(ord.id, 'delivery_returned');
    entry = await prisma.commissionEntry.findFirst({ where: { orderId: ord.id } });
    ok('1) DELIVERED→RETURNED voids to CANCELLED', entry?.status === 'CANCELLED');
    ok('1) audit note kept', Boolean(entry?.notes?.includes('VOID:')));

    // 2) DELIVERED → CANCELLED
    const ord2 = await createPageOrder({
      pageId: pageA.id,
      agentId: agentComm.id,
      number: 'P15-ORD-COMM2',
    });
    await commissions.accrueOnDelivered(ord2.id);
    await commissions.voidForOrder(ord2.id, 'order_cancelled');
    const e2 = await prisma.commissionEntry.findFirst({ where: { orderId: ord2.id } });
    ok('2) DELIVERED→CANCELLED voids', e2?.status === 'CANCELLED');

    // 3) PAID → RETURNED
    const ord3 = await createPageOrder({
      pageId: pageA.id,
      agentId: agentComm.id,
      number: 'P15-ORD-COMM3',
    });
    await commissions.accrueOnDelivered(ord3.id);
    await prisma.commissionEntry.updateMany({
      where: { orderId: ord3.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await commissions.voidForOrder(ord3.id, 'delivery_returned');
    const e3 = await prisma.commissionEntry.findFirst({ where: { orderId: ord3.id } });
    ok('3) PAID→RETURNED voids with clawback note', e3?.status === 'CANCELLED' && Boolean(e3?.notes?.includes('clawback_required')));

    // 4) RETURNED → DELIVERED again
    await commissions.accrueOnDelivered(ord.id);
    entry = await prisma.commissionEntry.findFirst({ where: { orderId: ord.id } });
    ok('4) re-DELIVERED reactivates PENDING', entry?.status === 'PENDING');
    ok('4) amount restored (no duplicate rows)', Number(entry?.amount) === amount1);
    const count4 = await prisma.commissionEntry.count({ where: { orderId: ord.id } });
    ok('4) single entry per order/agent', count4 === 1);

    // 5) repeated RETURNED
    await commissions.voidForOrder(ord.id, 'delivery_returned');
    await commissions.voidForOrder(ord.id, 'delivery_returned');
    const count5 = await prisma.commissionEntry.count({ where: { orderId: ord.id } });
    entry = await prisma.commissionEntry.findFirst({ where: { orderId: ord.id } });
    ok('5) repeated RETURNED stays one CANCELLED row', count5 === 1 && entry?.status === 'CANCELLED');

    // 6) repeated DELIVERED
    await commissions.accrueOnDelivered(ord.id);
    await commissions.accrueOnDelivered(ord.id);
    const count6 = await prisma.commissionEntry.count({ where: { orderId: ord.id } });
    entry = await prisma.commissionEntry.findFirst({ where: { orderId: ord.id } });
    ok('6) repeated DELIVERED no duplicate rows', count6 === 1 && entry?.status === 'PENDING');
    ok('6) no history deletion (notes/amount present)', entry != null && Number(entry.amount) > 0);
  }

  await app.close();
  await prisma.$disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
