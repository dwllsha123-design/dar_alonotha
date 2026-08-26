import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CentralInventoryService } from '../inventory/services/central-inventory.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  StoreCheckoutDto,
  StoreRegisterDto,
  UpdateStoreProfileDto,
} from './dto/store.dto';
import {
  DELIVERY_CITIES,
  TRIPOLI_AREAS,
  deliveryGenderLabelAr,
  findDeliveryCity,
  parseDeliveryGender,
} from '../../common/delivery/delivery-zones';
import { resolveVariantImageUrl } from '../../common/variant-image';
import { OrderFulfillmentService } from '../delivery/order-fulfillment.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import { SessionMeta } from '../../common/client-context';

type PublicProduct = {
  id: string;
  nameAr: string;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  category?: { id: string; nameAr: string; slug: string } | null;
  retailPrice: number;
  compareAtPrice: number | null;
  discountPercent: number;
  currency: string;
  images: Array<{ url: string; alt?: string | null; isPrimary: boolean; color?: string | null }>;
      variants: Array<{
        id: string;
        sku: string;
        color?: string | null;
        size?: string | null;
        nameAr?: string | null;
        imageUrl?: string | null;
        retailPrice: number;
        available: number;
        inStock: boolean;
      }>;
  inStock: boolean;
  createdAt: Date;
  soldCount?: number;
};

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: CentralInventoryService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly fulfillment: OrderFulfillmentService,
    private readonly notifications: NotificationsService,
  ) {}

  async company() {
    const keys = [
      'app.name',
      'app.currency',
      'app.currency_symbol',
      'company.city',
      'company.country',
      'company.phone_primary',
      'company.phone_secondary',
      'company.address',
      'store.delivery_fee_tripoli',
      'store.delivery_fee_tripoli_female',
      'store.delivery_fee_external',
    ];
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      name: map['app.name'] || 'دار الأنوثة',
      nameEn: 'Dar Al-Onotha',
      city: map['company.city'] || 'طرابلس',
      country: map['company.country'] || 'ليبيا',
      phones: [
        map['company.phone_primary'] || '0921820999',
        map['company.phone_secondary'] || '0924443839',
      ],
      address: map['company.address'] || 'طرابلس - ليبيا',
      currency: map['app.currency'] || 'LYD',
      currencySymbol: map['app.currency_symbol'] || 'د.ل',
      deliveryFeeTripoli: Number(map['store.delivery_fee_tripoli'] || 15),
      deliveryFeeTripoliMale: Number(map['store.delivery_fee_tripoli'] || 15),
      deliveryFeeTripoliFemale: Number(
        map['store.delivery_fee_tripoli_female'] || 20,
      ),
      deliveryFeeExternal: Number(map['store.delivery_fee_external'] || 35),
    };
  }

  /** قائمة المدن والمناطق للواجهة — السعر يُحسب عبر quote */
  async deliveryOptions() {
    const company = await this.company();
    const dbZones = await this.prisma.deliveryZone.findMany({
      where: { city: 'طرابلس', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { area: 'asc' }],
    });
    const tripoliNames = dbZones.length
      ? dbZones.map((z) => z.area)
      : TRIPOLI_AREAS.map((a) => a.nameAr);
    const tripoliDetails = dbZones.length
      ? dbZones.map((z) => ({
          nameAr: z.area,
          maleFee: Number(z.maleFee),
          femaleFee: Number(z.femaleFee),
        }))
      : TRIPOLI_AREAS.map((a) => ({
          nameAr: a.nameAr,
          maleFee: company.deliveryFeeTripoliMale,
          femaleFee: company.deliveryFeeTripoliFemale,
        }));

    return {
      cities: DELIVERY_CITIES.map((c) => {
        const isInternal = c.mode === 'OWN_AGENTS';
        return {
          nameAr: c.nameAr,
          mode: c.mode,
          deliveryType: isInternal ? 'INTERNAL' : 'EXTERNAL',
          requiresGender: isInternal,
          areas: isInternal ? tripoliNames : c.areas.map((a) => a.nameAr),
          areaDetails: isInternal ? tripoliDetails : undefined,
        };
      }),
      notes: {
        internal: 'سيتم التواصل معكِ لتأكيد موعد التوصيل.',
        external: 'سيتم التواصل معكِ لتأكيد موعد التوصيل.',
      },
    };
  }

  async resolveDelivery(city?: string, area?: string, gender?: string) {
    const company = await this.company();
    const zone = findDeliveryCity(city);
    const areaName = (area || '').trim();
    const isInternal = zone.mode === 'OWN_AGENTS';

    if (!isInternal) {
      return {
        city: zone.nameAr,
        area: areaName || null,
        deliveryType: 'EXTERNAL' as const,
        deliveryFee: company.deliveryFeeExternal,
        mode: zone.mode,
        gender: null,
        requiresGender: false,
        maleFee: null,
        femaleFee: null,
        labelAr: areaName
          ? `رسوم التوصيل (${areaName})`
          : 'رسوم التوصيل خارج طرابلس',
        areas: zone.areas.map((a) => a.nameAr),
        feeSource: 'city',
      };
    }

    const parsed = parseDeliveryGender(gender) || 'FEMALE';
    const row = areaName
      ? await this.prisma.deliveryZone.findFirst({
          where: { city: 'طرابلس', area: areaName, isActive: true },
        })
      : null;
    const maleFee = row ? Number(row.maleFee) : company.deliveryFeeTripoliMale;
    const femaleFee = row
      ? Number(row.femaleFee)
      : company.deliveryFeeTripoliFemale;
    const deliveryFee = parsed === 'FEMALE' ? femaleFee : maleFee;
    const genderLabel = deliveryGenderLabelAr(parsed);

    return {
      city: zone.nameAr,
      area: areaName || null,
      deliveryType: 'INTERNAL' as const,
      deliveryFee,
      mode: zone.mode,
      gender: parsed,
      requiresGender: true,
      maleFee,
      femaleFee,
      labelAr: areaName
        ? `رسوم التوصيل ${genderLabel} (${areaName})`
        : `رسوم التوصيل ${genderLabel}`,
      areas: zone.areas.map((a) => a.nameAr),
      feeSource: row ? 'zone' : 'city',
    };
  }

  async categories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        parentId: true,
        nameAr: true,
        nameEn: true,
        slug: true,
        sortOrder: true,
      },
    });
  }

  private async mapProduct(
    product: {
      id: string;
      nameAr: string;
      description: string | null;
      brand: string | null;
      sku: string | null;
      isTrackStock?: boolean;
      retailPrice: Prisma.Decimal | number;
      basePrice: Prisma.Decimal | number;
      currency: string;
      createdAt: Date;
      category: { id: string; nameAr: string; slug: string } | null;
      images: Array<{
        url: string;
        alt: string | null;
        isPrimary: boolean;
        sortOrder: number;
        color?: string | null;
      }>;
      variants: Array<{
        id: string;
        sku: string;
        color: string | null;
        size: string | null;
        nameAr: string | null;
        imageUrl?: string | null;
        retailPrice: Prisma.Decimal | number;
        price: Prisma.Decimal | number;
        isActive: boolean;
      }>;
    },
  ): Promise<PublicProduct> {
    const trackStock = product.isTrackStock !== false;
    const warehouseId = await this.inventory.defaultWarehouseId();
    const variants = [];
    let anyInStock = false;
    for (const v of product.variants.filter((x) => x.isActive)) {
      const { available: onHand } = await this.inventory.getAvailability(v.id, warehouseId);
      const available = trackStock ? onHand : 99;
      const inStock = available > 0;
      if (inStock) anyInStock = true;
      variants.push({
        id: v.id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        nameAr: v.nameAr,
        imageUrl: v.imageUrl || null,
        retailPrice: Number(v.retailPrice || v.price),
        available,
        inStock,
      });
    }

    const retail = Number(product.retailPrice);
    const compare = Number(product.basePrice);
    const compareAtPrice = compare > retail ? compare : null;
    const discountPercent =
      compareAtPrice && compareAtPrice > 0
        ? Math.round(((compareAtPrice - retail) / compareAtPrice) * 100)
        : 0;

    return {
      id: product.id,
      nameAr: product.nameAr,
      description: product.description,
      brand: product.brand,
      sku: product.sku,
      category: product.category,
      retailPrice: retail,
      compareAtPrice,
      discountPercent,
      currency: product.currency || 'LYD',
      images: product.images
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          url: i.url,
          alt: i.alt,
          isPrimary: i.isPrimary,
          color: i.color || null,
        })),
      variants,
      inStock: anyInStock,
      createdAt: product.createdAt,
    };
  }

  private productInclude() {
    return {
      category: { select: { id: true, nameAr: true, slug: true } },
      images: true,
      variants: { where: { isActive: true } },
    } as const;
  }

  async listProducts(filters?: {
    q?: string;
    category?: string;
    collection?: string;
  }) {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

    if (filters?.q) {
      where.OR = [
        { nameAr: { contains: filters.q } },
        { brand: { contains: filters.q } },
        { sku: { contains: filters.q } },
      ];
    }

    if (filters?.category) {
      where.category = { slug: filters.category };
    }

    if (filters?.collection === 'offers') {
      // basePrice used as compare-at when higher than retail
      where.AND = [{ NOT: { basePrice: 0 } }];
    }

    let products = await this.prisma.product.findMany({
      where,
      include: this.productInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (filters?.collection === 'offers') {
      products = products.filter(
        (p) => Number(p.basePrice) > Number(p.retailPrice),
      );
    }
    if (filters?.collection === 'new') {
      products = products.slice(0, 24);
    }
    if (filters?.collection === 'bestseller') {
      const top = await this.prisma.orderItem.groupBy({
        by: ['variantId'],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 40,
      });
      const variantIds = top
        .map((t) => t.variantId)
        .filter((id): id is string => !!id);
      const productIds = (
        await this.prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { productId: true },
        })
      ).map((v) => v.productId);
      const orderMap = new Map(productIds.map((id, idx) => [id, idx]));
      products = products
        .filter((p) => orderMap.has(p.id))
        .sort(
          (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999),
        );
      if (!products.length) {
        products = await this.prisma.product.findMany({
          where: { status: 'ACTIVE' },
          include: this.productInclude(),
          orderBy: { updatedAt: 'desc' },
          take: 12,
        });
      }
    }

    const variantToProduct = new Map<string, string>();
    for (const p of products) {
      for (const v of p.variants) variantToProduct.set(v.id, p.id);
    }
    const soldRows = variantToProduct.size
      ? await this.prisma.orderItem.groupBy({
          by: ['variantId'],
          where: { variantId: { in: [...variantToProduct.keys()] } },
          _sum: { quantity: true },
        })
      : [];
    const soldByProduct = new Map<string, number>();
    for (const row of soldRows) {
      if (!row.variantId) continue;
      const productId = variantToProduct.get(row.variantId);
      if (!productId) continue;
      soldByProduct.set(
        productId,
        (soldByProduct.get(productId) || 0) + (row._sum.quantity || 0),
      );
    }

    return Promise.all(
      products.map(async (p) => ({
        ...(await this.mapProduct(p)),
        soldCount: soldByProduct.get(p.id) || 0,
      })),
    );
  }

  async variantStock(ids: string[]) {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 60);
    const result: Record<string, { available: number; inStock: boolean }> = {};
    const warehouseId = unique.length ? await this.inventory.defaultWarehouseId() : '';
    for (const id of unique) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id },
        include: { product: { select: { status: true, isTrackStock: true } } },
      });
      if (!variant?.isActive || variant.product.status !== 'ACTIVE') {
        result[id] = { available: 0, inStock: false };
        continue;
      }
      if (variant.product.isTrackStock === false) {
        result[id] = { available: 99, inStock: true };
        continue;
      }
      const { available } = await this.inventory.getAvailability(id, warehouseId);
      result[id] = { available, inStock: available > 0 };
    }
    return result;
  }

  async productById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: 'ACTIVE' },
      include: this.productInclude(),
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    const mapped = await this.mapProduct(product);

    const related = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: id },
        categoryId: product.categoryId || undefined,
      },
      include: this.productInclude(),
      take: 8,
    });

    return {
      ...mapped,
      related: await Promise.all(related.map((p) => this.mapProduct(p))),
      suggested: await this.listProducts({ collection: 'new' }).then((list) =>
        list.filter((p) => p.id !== id).slice(0, 8),
      ),
    };
  }

  async register(dto: StoreRegisterDto, meta?: SessionMeta) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          dto.email ? { email: dto.email } : undefined,
        ].filter(Boolean) as Array<{ phone?: string; email?: string }>,
      },
    });
    if (existingUser) {
      throw new BadRequestException('الحساب موجود مسبقاً، سجّلي الدخول');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: 'customer' },
    });
    if (!role) {
      throw new BadRequestException('دور العميل غير مهيأ في النظام');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          locale: 'ar',
          roles: { create: [{ roleId: role.id }] },
        },
      });

      await tx.customer.upsert({
        where: { phone: dto.phone },
        create: {
          name: dto.name,
          phone: dto.phone,
          city: dto.city,
          area: dto.area,
          address: dto.address,
        },
        update: {
          name: dto.name,
          city: dto.city,
          area: dto.area,
          address: dto.address,
        },
      });

      return created;
    });

    return this.authService.issueForUser(user.id, meta);
  }

  async profile(user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new UnauthorizedException();
    const customer = dbUser.phone
      ? await this.prisma.customer.findUnique({ where: { phone: dbUser.phone } })
      : null;
    return {
      id: dbUser.id,
      name: dbUser.name,
      phone: dbUser.phone,
      email: dbUser.email,
      customer,
    };
  }

  async updateProfile(user: AuthUser, dto: UpdateStoreProfileDto) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.phone) throw new BadRequestException('رقم الهاتف مطلوب');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { name: dto.name || dbUser.name },
    });

    const customer = await this.prisma.customer.upsert({
      where: { phone: dbUser.phone },
      create: {
        name: dto.name || dbUser.name,
        phone: dbUser.phone,
        city: dto.city,
        area: dto.area,
        address: dto.address,
        landmark: dto.landmark,
        whatsapp: dto.whatsapp,
      },
      update: {
        name: dto.name || dbUser.name,
        city: dto.city,
        area: dto.area,
        address: dto.address,
        landmark: dto.landmark,
        whatsapp: dto.whatsapp,
      },
    });

    return { user: { id: dbUser.id, name: dto.name || dbUser.name }, customer };
  }

  async myOrders(user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.phone) return [];
    const customer = await this.prisma.customer.findUnique({
      where: { phone: dbUser.phone },
    });
    if (!customer) return [];

    return this.prisma.order.findMany({
      where: { customerId: customer.id, source: 'WEBSITE' },
      include: { items: true, deliveries: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async myOrder(user: AuthUser, id: string) {
    const orders = await this.myOrders(user);
    const order = orders.find((o) => o.id === id);
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return order;
  }

  async track(orderNumber: string, phone: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        orderNumber: orderNumber.trim().toUpperCase(),
        OR: [
          { shippingPhone: phone },
          { customer: { phone } },
        ],
      },
      include: {
        items: true,
        deliveries: true,
        customer: true,
      },
    });
    if (!order) throw new NotFoundException('لم يتم العثور على الطلب');

    const timeline = [
      'NEW',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'ASSIGNED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      totalAmount: order.totalAmount,
      currency: order.currency,
      customer: {
        name: order.shippingName,
        phone: order.shippingPhone,
        city: order.city,
        area: order.area,
        address: order.address,
      },
      items: order.items,
      deliveries: order.deliveries,
      timeline: timeline.map((s) => ({
        status: s,
        reached: timeline.indexOf(s) <= timeline.indexOf(order.status) ||
          ['DELIVERED'].includes(order.status) && timeline.indexOf(s) <= timeline.indexOf('DELIVERED'),
        current: s === order.status,
      })),
      cancelled: order.status === 'CANCELLED',
      failed: order.deliveries.some((d) => d.status === 'FAILED'),
      returned: order.status === 'RETURNED',
    };
  }

  async checkout(dto: StoreCheckoutDto, user?: AuthUser) {
    if (!dto.items?.length) {
      throw new BadRequestException('السلة فارغة');
    }

    const delivery = await this.resolveDelivery(
      dto.city,
      dto.area,
      dto.deliveryGender,
    );

    let pagePublicCode: number | undefined;
    let agentPublicCode: number | undefined;
    let referralVisitId: string | undefined;
    let facebookPageId: string | undefined;
    let salesAgentId: string | undefined;
    let attributionSource = 'WEBSITE';

    if (dto.attributionToken) {
      const visit = await this.prisma.referralVisit.findUnique({
        where: { attributionToken: dto.attributionToken },
      });
      if (visit && visit.expiresAt > new Date()) {
        facebookPageId = visit.pageId;
        pagePublicCode = visit.pageCode;
        agentPublicCode = visit.agentCode ?? undefined;
        referralVisitId = visit.id;
        salesAgentId = visit.agentUserId ?? undefined;
        attributionSource =
          visit.agentCode != null ? 'REFERRAL_AGENT' : 'REFERRAL_PAGE';
      }
    }

    // ربط مباشر برمز الصفحة من الرابط ?page= حتى بدون token
    if (!facebookPageId && dto.pagePublicCode) {
      const page = await this.prisma.facebookPage.findFirst({
        where: { publicCode: dto.pagePublicCode, status: 'ACTIVE' },
      });
      if (page) {
        facebookPageId = page.id;
        pagePublicCode = page.publicCode;
        attributionSource = attributionSource === 'WEBSITE' ? 'STORE_PAGE_LINK' : attributionSource;
        if (dto.agentPublicCode) {
          const member = await this.prisma.facebookPageEmployee.findFirst({
            where: {
              pageId: page.id,
              agentCode: dto.agentPublicCode,
              role: 'AGENT',
            },
          });
          if (member) {
            agentPublicCode = member.agentCode ?? undefined;
            salesAgentId = member.userId;
            attributionSource = 'STORE_AGENT_LINK';
          }
        }
      }
    }

    return this.inventory.withTransaction(async (tx) => {
      const warehouseId = await this.inventory.defaultWarehouseId(tx);

      let customer = await tx.customer.findUnique({
        where: { phone: dto.phone },
      });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: dto.name,
            phone: dto.phone,
            city: dto.city,
            area: dto.area,
            address: dto.address,
            landmark: dto.landmark,
          },
        });
      } else {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: dto.name,
            city: dto.city,
            area: dto.area,
            address: dto.address,
            landmark: dto.landmark,
          },
        });
      }

      const items = [];
      for (const line of dto.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          include: {
            product: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
          },
        });
        if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE') {
          throw new NotFoundException('منتج غير متوفر');
        }
        const trackStock = variant.product.isTrackStock !== false;
        if (trackStock) {
          const { available } = await this.inventory.getAvailability(
            variant.id,
            warehouseId,
          );
          if (available <= 0) {
            throw new BadRequestException(
              `غير متوفر حالياً: ${variant.product.nameAr}`,
            );
          }
          if (available < line.quantity) {
            throw new BadRequestException(
              `الكمية المتاحة من «${variant.product.nameAr}» هي ${available} فقط`,
            );
          }
        }

        const unitPrice = Number(variant.retailPrice || variant.price);
        items.push({
          variantId: variant.id,
          productName: variant.product.nameAr,
          variantName:
            variant.nameAr ||
            [variant.color, variant.size].filter(Boolean).join(' / ') ||
            null,
          sku: variant.sku,
          imageUrl: resolveVariantImageUrl(variant),
          quantity: line.quantity,
          unitPrice,
          discount: 0,
          lineTotal: unitPrice * line.quantity,
          trackStock: variant.product.isTrackStock,
        });
      }

      const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
      let discountAmount = 0;
      let promoCodeId: string | undefined;
      let promoCodeStr: string | undefined;

      if (dto.promoCode) {
        const promo = await tx.promoCode.findFirst({
          where: { code: dto.promoCode.trim().toUpperCase() },
        });
        if (!promo || !promo.active) {
          throw new BadRequestException('كود الخصم غير صالح');
        }
        const now = new Date();
        if (promo.startsAt && promo.startsAt > now) {
          throw new BadRequestException('كود الخصم لم يبدأ بعد');
        }
        if (promo.endsAt && promo.endsAt < now) {
          throw new BadRequestException('كود الخصم منتهي');
        }
        if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
          throw new BadRequestException('تم استنفاد استخدامات كود الخصم');
        }
        if (subtotal < Number(promo.minOrder || 0)) {
          throw new BadRequestException(
            `الحد الأدنى للطلب لهذا الكود ${promo.minOrder} د.ل`,
          );
        }
        discountAmount =
          promo.type === 'PERCENT'
            ? Math.min(subtotal, (subtotal * Number(promo.value)) / 100)
            : Math.min(subtotal, Number(promo.value));
        promoCodeId = promo.id;
        promoCodeStr = promo.code;
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      const deliveryFee = delivery.deliveryFee;
      const totalAmount = Math.max(0, subtotal - discountAmount) + deliveryFee;

      const year = new Date().getFullYear();
      const seq = await tx.orderSequence.upsert({
        where: { year },
        create: { year, counter: 1 },
        update: { counter: { increment: 1 } },
      });
      const orderNumber = `ORD-${year}-${String(seq.counter).padStart(6, '0')}`;

      const order = await tx.order.create({
        data: {
          orderNumber,
          orderBarcode: orderNumber,
          source: 'WEBSITE',
          status: 'NEW',
          paymentMethod: (dto.paymentMethod as never) || 'COD',
          paymentStatus: 'UNPAID',
          deliveryType: delivery.deliveryType as never,
          fulfillmentType:
            delivery.deliveryType === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL',
          localStatus: delivery.deliveryType === 'INTERNAL' ? 'PENDING' : undefined,
          customerId: customer.id,
          salesAgentId,
          facebookPageId,
          warehouseId,
          pagePublicCode,
          agentPublicCode,
          referralVisitId,
          attributionSource,
          pageSource: facebookPageId
            ? undefined
            : pagePublicCode
              ? `صفحة #${pagePublicCode}`
              : attributionSource,
          subtotal,
          discountAmount,
          promoCodeId,
          promoCode: promoCodeStr,
          deliveryFee,
          totalAmount,
          currency: 'LYD',
          shippingName: dto.name,
          shippingPhone: dto.phone,
          city: dto.city,
          area: dto.area,
          deliveryGender: delivery.gender || undefined,
          address: dto.address,
          landmark: dto.landmark,
          notes: [dto.notes?.trim(), delivery.gender
            ? `توصيل ${deliveryGenderLabelAr(delivery.gender)}`
            : '']
            .filter(Boolean)
            .join(' | ') || undefined,
          items: {
            create: items.map(({ trackStock: _t, ...rest }) => rest),
          },
        },
        include: { items: true, customer: true, facebookPage: true },
      });

      if (order.facebookPage?.name && !order.pageSource) {
        await tx.order.update({
          where: { id: order.id },
          data: { pageSource: order.facebookPage.name },
        });
      }

      // المخزون يُخصم عند تأكيد الطلب من لوحة الإدارة
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalPurchases: { increment: totalAmount },
          lastOrderAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id,
          action: 'store.checkout',
          entityType: 'Order',
          entityId: order.id,
          meta: {
            orderNumber,
            attributionSource,
            facebookPageId,
            pagePublicCode,
            promoCode: promoCodeStr,
          },
        },
      });

      return {
        orderNumber: order.orderNumber,
        orderBarcode: order.orderBarcode,
        status: order.status,
        deliveryType: order.deliveryType,
        deliveryFee: order.deliveryFee,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        promoCode: order.promoCode,
        totalAmount: order.totalAmount,
        currency: order.currency,
        attributionSource,
        pagePublicCode: order.pagePublicCode,
        sourcePage: order.facebookPage
          ? {
              id: order.facebookPage.id,
              name: order.facebookPage.name,
              publicCode: order.facebookPage.publicCode,
            }
          : null,
        customer: {
          name: order.shippingName,
          phone: order.shippingPhone,
          city: order.city,
          area: order.area,
          address: order.address,
        },
        items: order.items,
        id: order.id,
      };
    }).then(async (created) => {
      try {
        await this.notifications.notifyOrderStakeholders(
          {
            id: created.id,
            orderNumber: created.orderNumber,
            shippingName: created.customer?.name,
            facebookPageId: created.sourcePage?.id || facebookPageId,
            salesAgentId,
            facebookPage: created.sourcePage
              ? { name: created.sourcePage.name }
              : null,
          },
          {
            titleAr: `طلب جديد من الموقع ${created.orderNumber}`,
            bodyAr: [
              created.customer?.name,
              created.customer?.city,
              `المبلغ ${created.totalAmount} د.ل`,
            ]
              .filter(Boolean)
              .join(' — '),
            type: 'ORDER_CREATED',
          },
        );
      } catch {
        /* لا نُفشل الطلب إذا تعثر الإشعار */
      }

      try {
        const routed = await this.fulfillment.routeOrder(created.id);
        return {
          ...created,
          fulfillmentType: routed.fulfillmentType,
          localStatus:
            'localStatus' in routed ? routed.localStatus : undefined,
          fulfillmentError:
            'error' in routed ? routed.error : undefined,
          externalTrackingNumber:
            routed.order.externalTrackingNumber || undefined,
        };
      } catch {
        return created;
      }
    });
  }
}
