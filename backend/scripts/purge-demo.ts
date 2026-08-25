/**
 * Purge demo catalog rows from any environment database.
 * Usage (from backend/):
 *   DATABASE_URL=file:./prod.db npx ts-node --transpile-only scripts/purge-demo.ts
 * Docker:
 *   docker compose exec api npx ts-node --transpile-only scripts/purge-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_SKUS = ['LIN-001', 'UND-001', 'ROB-001', 'WIG-001'];

async function main() {
  console.log('Purging demo catalog…');

  for (const sku of DEMO_SKUS) {
    const product = await prisma.product.findUnique({
      where: { sku },
      include: { variants: { select: { id: true } } },
    });
    if (!product) {
      console.log(`- ${sku}: not found`);
      continue;
    }
    const variantIds = product.variants.map((v) => v.id);
    if (variantIds.length) {
      await prisma.stockItem.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.inventoryMovement.deleteMany({
        where: { variantId: { in: variantIds } },
      });
    }
    try {
      await prisma.product.delete({ where: { id: product.id } });
      console.log(`- ${sku}: deleted`);
    } catch {
      await prisma.product.update({
        where: { id: product.id },
        data: { status: 'INACTIVE' },
      });
      console.log(`- ${sku}: deactivated (linked records)`);
    }
  }

  const placeholders = await prisma.productImage.deleteMany({
    where: {
      OR: [
        { url: { contains: 'picsum.photos' } },
        { url: { contains: 'unsplash.com' } },
        { url: { contains: 'loremflickr' } },
        { url: { contains: 'placehold' } },
      ],
    },
  });
  console.log(`- placeholder images removed: ${placeholders.count}`);

  try {
    const pages = await prisma.facebookPage.deleteMany({
      where: { pageId: 'page-demo-001' },
    });
    console.log(`- demo facebook pages removed: ${pages.count}`);
  } catch {
    await prisma.facebookPage.updateMany({
      where: { pageId: 'page-demo-001' },
      data: { status: 'INACTIVE' },
    });
    console.log('- demo facebook page deactivated');
  }

  await prisma.deliveryCompany.deleteMany({
    where: {
      OR: [
        { nameAr: 'شركة توصيل خارجية (قيد الربط)' },
        { nameEn: 'External courier (API pending)' },
      ],
    },
  });

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
