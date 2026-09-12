import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators/current-user.decorator';
import { ROLE_CODES } from './permissions';

/** Historical message — page-specific shipping accounts are no longer required. */
export const PAGE_SHIPPING_ACCOUNT_REQUIRED =
  'لم يتم ربط حساب المعيار بهذه الصفحة.';

/**
 * New orders may only be attributed to ACTIVE Facebook pages.
 * Historical orders remain readable; this blocks create/checkout only.
 */
export async function assertFacebookPageAcceptsNewOrders(
  prisma: PrismaService,
  facebookPageId: string,
): Promise<void> {
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: { id: true, status: true },
  });
  if (!page) throw new NotFoundException('الصفحة غير موجودة');
  if (page.status !== 'ACTIVE') {
    throw new BadRequestException(
      'هذه الصفحة متوقفة ولا يمكن إنشاء طلبات جديدة عليها',
    );
  }
}

/** Full order visibility (admins). */
export function isOrderAdmin(user: AuthUser): boolean {
  return (
    user.roles.includes(ROLE_CODES.SUPER_ADMIN) ||
    user.roles.includes(ROLE_CODES.ADMIN)
  );
}

/**
 * Facebook Page employee / sales agent whose order visibility must be
 * limited to actively assigned Facebook pages.
 * Does not apply to admins, delivery agents, or branch sessions.
 */
export function isPageScopedAgent(user: AuthUser): boolean {
  if (isOrderAdmin(user)) return false;
  if (user.branch) return false;
  if (user.roles.includes(ROLE_CODES.DELIVERY_AGENT)) return false;
  return user.roles.includes(ROLE_CODES.SALES_AGENT);
}

/** Roles that may access any order (existing warehouse/cashier/delivery flows). */
export function bypassesPageOrderScope(user: AuthUser): boolean {
  return !isPageScopedAgent(user);
}

export async function getAssignedFacebookPageIds(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const rows = await prisma.facebookPageEmployee.findMany({
    where: { userId },
    select: { pageId: true },
  });
  return rows.map((r) => r.pageId);
}

/**
 * Phase 1.5 policy — page membership is the principal boundary.
 *
 * Page-owned orders (facebookPageId set): require active FacebookPageEmployee
 * membership on that page. salesAgentId / createdById alone do NOT grant access
 * (prevents post-removal IDOR on historical page orders).
 *
 * Orders with no facebookPageId (legacy / non-page): allow only if the agent is
 * salesAgentId or createdById (own orphan records).
 */
export function buildPageAgentOrderWhere(
  userId: string,
  pageIds: string[],
): Prisma.OrderWhereInput {
  return {
    OR: [
      { facebookPageId: { in: pageIds } },
      {
        AND: [
          { facebookPageId: null },
          {
            OR: [{ salesAgentId: userId }, { createdById: userId }],
          },
        ],
      },
    ],
  };
}

export function orderMatchesPageAgentScope(
  order: {
    facebookPageId?: string | null;
    salesAgentId?: string | null;
    createdById?: string | null;
  },
  userId: string,
  pageIds: string[],
): boolean {
  if (order.facebookPageId) {
    return pageIds.includes(order.facebookPageId);
  }
  return order.salesAgentId === userId || order.createdById === userId;
}

export async function assertCanAccessOrder(
  prisma: PrismaService,
  user: AuthUser,
  orderId: string,
): Promise<{
  id: string;
  facebookPageId: string | null;
  salesAgentId: string | null;
  createdById: string | null;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      facebookPageId: true,
      salesAgentId: true,
      createdById: true,
    },
  });
  if (!order) throw new NotFoundException('الطلب غير موجود');
  if (bypassesPageOrderScope(user)) return order;

  const pageIds = await getAssignedFacebookPageIds(prisma, user.id);
  if (!orderMatchesPageAgentScope(order, user.id, pageIds)) {
    throw new ForbiddenException('غير مسموح لك بالوصول إلى هذا الطلب');
  }
  return order;
}

export async function assertCanUseFacebookPage(
  prisma: PrismaService,
  user: AuthUser,
  facebookPageId: string | undefined | null,
): Promise<void> {
  if (!facebookPageId) {
    if (isPageScopedAgent(user)) {
      throw new ForbiddenException('يجب اختيار صفحة فيسبوك مُعيَّنة لك');
    }
    return;
  }
  if (!isPageScopedAgent(user) && isOrderAdmin(user)) return;
  if (!isPageScopedAgent(user)) return;

  const link = await prisma.facebookPageEmployee.findUnique({
    where: {
      pageId_userId: { pageId: facebookPageId, userId: user.id },
    },
  });
  if (!link) {
    throw new ForbiddenException('غير مسموح لك بالبيع على هذه الصفحة');
  }
}

export async function pageAgentOrderScope(
  prisma: PrismaService,
  user: AuthUser,
): Promise<Prisma.OrderWhereInput | undefined> {
  if (!isPageScopedAgent(user)) return undefined;
  const pageIds = await getAssignedFacebookPageIds(prisma, user.id);
  return buildPageAgentOrderWhere(user.id, pageIds);
}
