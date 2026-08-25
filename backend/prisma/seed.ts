import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  PERMISSION_META,
  ROLE_CODES,
  PERMISSIONS,
} from '../src/common/permissions';
import { TRIPOLI_AREAS } from '../src/common/delivery/delivery-zones';

const prisma = new PrismaClient();
const production = process.env.NODE_ENV === 'production';

async function main() {
  if (production && process.env.ALLOW_SEED !== 'true') {
    throw new Error(
      'الـ seed مرفوض في الإنتاج. لتشغيله مرة واحدة فقط: ALLOW_SEED=true',
    );
  }
  console.log('Seeding دار الأنوثة...');

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

  const allPermissions = await prisma.permission.findMany();
  const byCode = Object.fromEntries(allPermissions.map((p) => [p.code, p]));

  const roleDefs = [
    {
      code: ROLE_CODES.SUPER_ADMIN,
      nameAr: 'المدير العام',
      nameEn: 'Super Admin',
      isSystem: true,
      permissions: allPermissions.map((p) => p.code),
    },
    {
      code: ROLE_CODES.ADMIN,
      nameAr: 'مدير',
      nameEn: 'Admin',
      isSystem: true,
      permissions: allPermissions
        .map((p) => p.code)
        .filter((c) => c !== PERMISSIONS.USERS_MANAGE),
    },
    {
      code: ROLE_CODES.SALES_AGENT,
      nameAr: 'موظف مبيعات',
      nameEn: 'Sales Agent',
      isSystem: true,
      permissions: [
        PERMISSIONS.ORDERS_VIEW,
        PERMISSIONS.ORDERS_CREATE,
        PERMISSIONS.ORDERS_EDIT,
        PERMISSIONS.CUSTOMERS_VIEW,
        PERMISSIONS.CUSTOMERS_CREATE,
        PERMISSIONS.CUSTOMERS_EDIT,
        PERMISSIONS.PRODUCTS_VIEW,
        PERMISSIONS.FACEBOOK_PAGES_VIEW,
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.COMMISSIONS_VIEW,
      ],
    },
    {
      code: ROLE_CODES.CASHIER,
      nameAr: 'كاشير',
      nameEn: 'Cashier',
      isSystem: true,
      permissions: [
        PERMISSIONS.POS_SELL,
        PERMISSIONS.POS_RETURN,
        PERMISSIONS.ORDERS_VIEW,
        PERMISSIONS.ORDERS_CREATE,
        PERMISSIONS.PRODUCTS_VIEW,
        PERMISSIONS.CUSTOMERS_VIEW,
        PERMISSIONS.CUSTOMERS_CREATE,
        PERMISSIONS.INVENTORY_VIEW,
      ],
    },
    {
      code: ROLE_CODES.BRANCH_CASHIER,
      nameAr: 'كاشير الفرع',
      nameEn: 'Branch Cashier',
      isSystem: true,
      permissions: [
        PERMISSIONS.POS_SELL,
        PERMISSIONS.POS_RETURN,
        PERMISSIONS.ORDERS_VIEW,
        PERMISSIONS.PRODUCTS_VIEW,
        PERMISSIONS.CUSTOMERS_VIEW,
        PERMISSIONS.CUSTOMERS_CREATE,
        PERMISSIONS.INVENTORY_VIEW,
      ],
    },
    {
      code: ROLE_CODES.WAREHOUSE,
      nameAr: 'موظف مخزن',
      nameEn: 'Warehouse Employee',
      isSystem: true,
      permissions: [
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_ADJUST,
        PERMISSIONS.PRODUCTS_VIEW,
        PERMISSIONS.ORDERS_VIEW,
      ],
    },
    {
      code: ROLE_CODES.DELIVERY_AGENT,
      nameAr: 'مندوب توصيل',
      nameEn: 'Delivery Agent',
      isSystem: true,
      permissions: [
        PERMISSIONS.ORDERS_VIEW,
        PERMISSIONS.DELIVERY_ASSIGN,
        PERMISSIONS.CUSTOMERS_VIEW,
        PERMISSIONS.INVENTORY_ADJUST,
      ],
    },
    {
      code: ROLE_CODES.CUSTOMER,
      nameAr: 'عميل المتجر',
      nameEn: 'Customer',
      isSystem: true,
      permissions: [
        PERMISSIONS.PRODUCTS_VIEW,
        PERMISSIONS.ORDERS_VIEW,
        PERMISSIONS.CUSTOMERS_EDIT,
      ],
    },
  ];

  for (const role of roleDefs) {
    const saved = await prisma.role.upsert({
      where: { code: role.code },
      create: {
        code: role.code,
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        isSystem: role.isSystem,
      },
      update: {
        nameAr: role.nameAr,
        nameEn: role.nameEn,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions
        .filter((code) => byCode[code])
        .map((code) => ({
          roleId: saved.id,
          permissionId: byCode[code].id,
        })),
    });
  }

  const passwordHash = await bcrypt.hash('Admin@12345', 10);
  const superRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.SUPER_ADMIN },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@dar-alunotha.ly' },
    create: {
      name: 'المدير العام',
      email: 'admin@dar-alunotha.ly',
      phone: '0911820999',
      passwordHash,
      locale: 'ar',
      roles: { create: [{ roleId: superRole.id }] },
    },
    update: production
      ? { status: 'ACTIVE', phone: '0911820999' }
      : {
          passwordHash,
          phone: '0911820999',
          status: 'ACTIVE',
        },
  });

  const deliveryRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.DELIVERY_AGENT },
  });
  const agentHash = await bcrypt.hash('Agent@12345', 10);
  const agent = await prisma.user.upsert({
    where: { email: 'agent@dar-alunotha.ly' },
    create: {
      name: 'مندوب طرابلس',
      email: 'agent@dar-alunotha.ly',
      phone: '0920000001',
      passwordHash: agentHash,
      locale: 'ar',
      roles: { create: [{ roleId: deliveryRole.id }] },
    },
    update: production
      ? { status: 'ACTIVE' }
      : {
          passwordHash: agentHash,
          status: 'ACTIVE',
        },
  });

  await prisma.courier.upsert({
    where: { userId: agent.id },
    create: {
      name: 'مندوب طرابلس',
      phone: '0920000001',
      city: 'طرابلس',
      isActive: true,
      userId: agent.id,
      notes: 'حساب تجريبي — كلمة السر Agent@12345',
    },
    update: {
      isActive: true,
      phone: '0920000001',
      city: 'طرابلس',
    },
  });

  // شركة خارجية placeholder — API يُربط لاحقاً من المالك
  const existingCompany = await prisma.deliveryCompany.findFirst({
    where: { nameAr: 'شركة توصيل خارجية (قيد الربط)' },
  });
  if (!existingCompany) {
    await prisma.deliveryCompany.create({
      data: {
        nameAr: 'شركة توصيل خارجية (قيد الربط)',
        nameEn: 'External courier (API pending)',
        isActive: false,
      },
    });
  }

  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    create: {
      code: 'MAIN',
      nameAr: 'المخزن الرئيسي',
      nameEn: 'Main Warehouse',
      isDefault: true,
      address: 'طرابلس - ليبيا',
    },
    update: { isDefault: true, address: 'طرابلس - ليبيا' },
  });

  const mainWarehouse = await prisma.warehouse.findUniqueOrThrow({
    where: { code: 'MAIN' },
  });
  const branchCashierRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.BRANCH_CASHIER },
  });
  const branchHash = await bcrypt.hash('Branch@12345', 10);
  const mainBranchUser = await prisma.user.upsert({
    where: { email: 'main@branch.local' },
    create: {
      name: 'الفرع الرئيسي',
      email: 'main@branch.local',
      passwordHash: branchHash,
      locale: 'ar',
      roles: { create: [{ roleId: branchCashierRole.id }] },
    },
    update: production
      ? { status: 'ACTIVE', name: 'الفرع الرئيسي' }
      : {
          passwordHash: branchHash,
          status: 'ACTIVE',
          name: 'الفرع الرئيسي',
        },
  });
  const existingMainBranch = await prisma.branch.findUnique({
    where: { username: 'main' },
  });
  const mainBranch = existingMainBranch
    ? await prisma.branch.update({
        where: { username: 'main' },
        data: {
          name: 'الفرع الرئيسي',
          passwordHash: branchHash,
          type: 'WHOLESALE_RETAIL',
          isMain: true,
          isActive: true,
          warehouseId: mainWarehouse.id,
          userId: mainBranchUser.id,
        },
      })
    : await prisma.branch.create({
        data: {
          name: 'الفرع الرئيسي',
          username: 'main',
          passwordHash: branchHash,
          type: 'WHOLESALE_RETAIL',
          isMain: true,
          isActive: true,
          warehouseId: mainWarehouse.id,
          userId: mainBranchUser.id,
        },
      });
  await prisma.stockItem.updateMany({
    where: { warehouseId: mainWarehouse.id, branchId: null },
    data: { branchId: mainBranch.id },
  });

  const settings: Array<{ key: string; value: string; group: string }> = [
    { key: 'app.name', value: 'دار الأنوثة', group: 'app' },
    { key: 'app.locale', value: 'ar', group: 'app' },
    { key: 'app.fallback_locale', value: 'en', group: 'app' },
    { key: 'app.currency', value: 'LYD', group: 'app' },
    { key: 'app.currency_symbol', value: 'د.ل', group: 'app' },
    { key: 'app.timezone', value: 'Africa/Tripoli', group: 'app' },
    { key: 'orders.number_prefix', value: 'ORD', group: 'orders' },
    { key: 'company.city', value: 'طرابلس', group: 'company' },
    { key: 'company.country', value: 'ليبيا', group: 'company' },
    { key: 'company.phone_primary', value: '0921820999', group: 'company' },
    { key: 'company.phone_secondary', value: '0924443839', group: 'company' },
    { key: 'company.address', value: 'طرابلس - ليبيا', group: 'company' },
    { key: 'store.delivery_fee_tripoli', value: '15', group: 'store' },
    { key: 'store.delivery_fee_tripoli_female', value: '20', group: 'store' },
    { key: 'store.delivery_fee_external', value: '35', group: 'store' },
    { key: 'mobile.android_package', value: 'ly.daronotha.store', group: 'mobile' },
    { key: 'mobile.ios_bundle_id', value: 'ly.daronotha.store', group: 'mobile' },
    { key: 'mobile.ios_team_id', value: '', group: 'mobile' },
    { key: 'mobile.android_min_version', value: '1.0.0', group: 'mobile' },
    { key: 'mobile.ios_min_version', value: '1.0.0', group: 'mobile' },
    { key: 'mobile.android_latest_version', value: '1.0.0', group: 'mobile' },
    { key: 'mobile.ios_latest_version', value: '1.0.0', group: 'mobile' },
    { key: 'mobile.android_force_update', value: 'false', group: 'mobile' },
    { key: 'mobile.ios_force_update', value: 'false', group: 'mobile' },
    { key: 'mobile.play_store_url', value: '', group: 'mobile' },
    { key: 'mobile.app_store_url', value: '', group: 'mobile' },
    { key: 'mobile.deep_link_scheme', value: 'daronotha', group: 'mobile' },
    { key: 'mobile.universal_link_host', value: 'dar-alunotha.ly', group: 'mobile' },
    { key: 'mobile.maintenance', value: 'false', group: 'mobile' },
    { key: 'mobile.maintenance_message', value: '', group: 'mobile' },
    { key: 'mobile.android_sha256_fingerprints', value: '', group: 'mobile' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: s,
      update: { value: s.value },
    });
  }

  const maleDefault = 15;
  const femaleDefault = 20;
  for (const [i, area] of TRIPOLI_AREAS.entries()) {
    await prisma.deliveryZone.upsert({
      where: { city_area: { city: 'طرابلس', area: area.nameAr } },
      create: {
        city: 'طرابلس',
        area: area.nameAr,
        maleFee: maleDefault,
        femaleFee: femaleDefault,
        sortOrder: i,
        isActive: true,
      },
      update: {},
    });
  }

  await prisma.facebookPage.upsert({
    where: { pageId: 'page-demo-001' },
    create: {
      name: 'دار الأنوثة - الصفحة الرئيسية',
      pageId: 'page-demo-001',
      publicCode: 1025,
      status: 'ACTIVE',
    },
    update: { status: 'ACTIVE', publicCode: 1025 },
  });

  await prisma.codeSequence.upsert({
    where: { key: 'page_public_code' },
    create: { key: 'page_public_code', counter: 1025 },
    update: {},
  });
  await prisma.codeSequence.upsert({
    where: { key: 'agent_public_code' },
    create: { key: 'agent_public_code', counter: 2049 },
    update: {},
  });
  await prisma.codeSequence.upsert({
    where: { key: 'variant_barcode' },
    create: { key: 'variant_barcode', counter: 100000 },
    update: {},
  });

  await prisma.setting.upsert({
    where: { key: 'store.url' },
    create: {
      key: 'store.url',
      value: process.env.STORE_URL || 'http://localhost:5174',
      group: 'store',
    },
    update: production
      ? {}
      : { value: process.env.STORE_URL || 'http://localhost:5174' },
  });

  const existingRule = await prisma.commissionRule.findFirst({
    where: { nameAr: 'عمولة مندوبي فيسبوك الافتراضية' },
  });
  if (!existingRule) {
    await prisma.commissionRule.create({
      data: {
        nameAr: 'عمولة مندوبي فيسبوك الافتراضية',
        type: 'PERCENT',
        ratePercent: 5,
        source: 'FACEBOOK',
        isActive: true,
      },
    });
  }

  const categoryDefs = [
    { nameAr: 'لانجري', nameEn: 'Lingerie', slug: 'lingerie', sortOrder: 1 },
    { nameAr: 'ملابس داخلية نسائية', nameEn: 'Underwear', slug: 'underwear', sortOrder: 2 },
    { nameAr: 'أرواب', nameEn: 'Robes', slug: 'robes', sortOrder: 3 },
    { nameAr: 'باروكات', nameEn: 'Wigs', slug: 'wigs', sortOrder: 4 },
  ];

  for (const c of categoryDefs) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { nameAr: c.nameAr, nameEn: c.nameEn, sortOrder: c.sortOrder, isActive: true },
    });
  }

  const lingerie = await prisma.category.findUnique({ where: { slug: 'lingerie' } });
  const underwear = await prisma.category.findUnique({ where: { slug: 'underwear' } });
  const robes = await prisma.category.findUnique({ where: { slug: 'robes' } });
  const wigs = await prisma.category.findUnique({ where: { slug: 'wigs' } });
  const warehouse = await prisma.warehouse.findUnique({ where: { code: 'MAIN' } });

  const demoProducts = [
    {
      sku: 'LIN-001',
      nameAr: 'طقم لانجري حريري',
      categoryId: lingerie?.id,
      retailPrice: 120,
      basePrice: 150,
      color: 'أسود',
      size: 'M',
      image: '/home/hero-lingerie.jpg',
    },
    {
      sku: 'UND-001',
      nameAr: 'طقم ملابس داخلية قطنية',
      categoryId: underwear?.id,
      retailPrice: 65,
      basePrice: 65,
      color: 'بيج',
      size: 'L',
      image: '/home/product-faraa.jpg',
    },
    {
      sku: 'ROB-001',
      nameAr: 'روب منزلي ناعم',
      categoryId: robes?.id,
      retailPrice: 180,
      basePrice: 210,
      color: 'وردي',
      size: 'One Size',
      image: '/home/product-kaftan.jpg',
    },
    {
      sku: 'WIG-001',
      nameAr: 'باروكة طبيعية مموجة',
      categoryId: wigs?.id,
      retailPrice: 350,
      basePrice: 400,
      color: 'بني',
      size: 'متوسط',
      image: '/home/product-kaftan-34-alt.jpg',
    },
  ];

  for (const p of demoProducts) {
    const existing = await prisma.product.findUnique({
      where: { sku: p.sku },
      include: { images: true, variants: true },
    });

    if (existing) {
      // Replace placeholder picsum/random URLs with brand images
      const primary = existing.images.find((i) => i.isPrimary) || existing.images[0];
      if (primary) {
        const isPlaceholder =
          /picsum\.photos|unsplash\.com|loremflickr|placehold/i.test(primary.url) ||
          !primary.url;
        if (isPlaceholder || primary.url !== p.image) {
          await prisma.productImage.update({
            where: { id: primary.id },
            data: { url: p.image, alt: p.nameAr },
          });
        }
      } else {
        await prisma.productImage.create({
          data: {
            productId: existing.id,
            url: p.image,
            alt: p.nameAr,
            isPrimary: true,
            sortOrder: 0,
          },
        });
      }
      continue;
    }

    const created = await prisma.product.create({
      data: {
        sku: p.sku,
        nameAr: p.nameAr,
        categoryId: p.categoryId,
        retailPrice: p.retailPrice,
        basePrice: p.basePrice,
        status: 'ACTIVE',
        description: `${p.nameAr} — متوفر لدى دار الأنوثة طرابلس`,
        images: {
          create: [
            {
              url: p.image,
              alt: p.nameAr,
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
        variants: {
          create: [
            {
              sku: `${p.sku}-V1`,
              color: p.color,
              size: p.size,
              retailPrice: p.retailPrice,
              price: p.retailPrice,
              nameAr: `${p.color} / ${p.size}`,
            },
          ],
        },
      },
      include: { variants: true },
    });

    if (warehouse && created.variants[0]) {
      await prisma.stockItem.upsert({
        where: {
          warehouseId_variantId: {
            warehouseId: warehouse.id,
            variantId: created.variants[0].id,
          },
        },
        create: {
          warehouseId: warehouse.id,
          variantId: created.variants[0].id,
          branchId: mainBranch.id,
          quantityOnHand: 15,
          quantityReserved: 0,
        },
        update: { quantityOnHand: 15 },
      });
    }
  }

  const year = new Date().getFullYear();
  await prisma.orderSequence.upsert({
    where: { year },
    create: { year, counter: 0 },
    update: {},
  });

  const heroCount = await prisma.banner.count({ where: { placement: 'HERO' } });
  if (heroCount === 0) {
    const uploadsHero = join(process.cwd(), 'uploads', 'banners');
    mkdirSync(uploadsHero, { recursive: true });
    const homeDir = join(process.cwd(), '..', 'storefront', 'public', 'home');
    const heroSlides = [
      { file: 'hero.jpg', title: 'الرئيسية' },
      { file: 'coming-soon.jpg', title: 'وصل حديثاً' },
      { file: 'category.jpg', title: 'التصنيفات' },
    ];
    for (let i = 0; i < heroSlides.length; i += 1) {
      const slide = heroSlides[i];
      const src = join(homeDir, slide.file);
      const destName = `hero-slide-${i + 1}.jpg`;
      let imageUrl = `/home/${slide.file}`;
      if (existsSync(src)) {
        copyFileSync(src, join(uploadsHero, destName));
        imageUrl = `/uploads/banners/${destName}`;
      }
      await prisma.banner.create({
        data: {
          title: slide.title,
          imageUrl,
          placement: 'HERO',
          sortOrder: i,
          active: true,
        },
      });
    }
  }

  console.log('Seed complete.');
  console.log('Super Admin:', admin.email);
  console.log('Password: Admin@12345');
  console.log('Main branch username: main');
  console.log('Main branch password: Branch@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
