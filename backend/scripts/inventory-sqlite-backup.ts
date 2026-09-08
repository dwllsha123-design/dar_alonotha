/**
 * Read-only SQLite backup verification + inventory.
 * Never writes to the source DB.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

const MODELS = [
  'setting',
  'permission',
  'role',
  'user',
  'userRole',
  'rolePermission',
  'category',
  'warehouse',
  'codeSequence',
  'orderSequence',
  'deliveryZone',
  'deliveryCompany',
  'promoCode',
  'banner',
  'commissionRule',
  'product',
  'productVariant',
  'productImage',
  'productColorMedia',
  'branch',
  'customer',
  'facebookPage',
  'facebookPageEmployee',
  'referralVisit',
  'externalShippingAccount',
  'courier',
  'stockItem',
  'stockTransfer',
  'stockTransferItem',
  'inventoryMovement',
  'stockReservation',
  'order',
  'orderItem',
  'delivery',
  'invoice',
  'commissionEntry',
  'salaryPayment',
  'auditLog',
  'notification',
  'authSession',
  'device',
] as const;

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) throw new Error('Usage: ts-node scripts/inventory-sqlite-backup.ts <path-to.db>');
  const abs = resolve(fileArg);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const st = statSync(abs);
  console.log(`File: ${abs}`);
  console.log(`Bytes: ${st.size}`);

  // file: URL with mode=ro (Windows path → forward slashes)
  const fileUrl = `file:${abs.replace(/\\/g, '/')}?mode=ro`;
  const prisma = new PrismaClient({
    datasources: { db: { url: fileUrl } },
    log: ['error'],
  });

  try {
    await prisma.$connect();
    const integrity = await prisma.$queryRawUnsafe<Array<{ integrity_check: string }>>(
      'PRAGMA integrity_check;',
    );
    const result = integrity.map((r) => r.integrity_check).join(', ');
    console.log(`PRAGMA integrity_check: ${result}`);
    if (result !== 'ok') {
      throw new Error(`Integrity check failed: ${result}`);
    }

    console.log('\n--- Source row counts ---');
    let total = 0;
    const counts: Record<string, number> = {};
    for (const m of MODELS) {
      const n = await (prisma as any)[m].count();
      counts[m] = n;
      total += n;
      console.log(`${m}: ${n}`);
    }
    console.log(`TOTAL_ROWS: ${total}`);

    // Sample image URL inventory (URLs only — no file reads under uploads)
    const images = await prisma.productImage.findMany({ select: { id: true, url: true } });
    const missingUrl = images.filter((i) => !i.url).length;
    const urlFingerprint = createHash('sha256')
      .update(images.map((i) => `${i.id}|${i.url}`).sort().join('\n'))
      .digest('hex')
      .slice(0, 16);
    console.log(`\nproductImage rows: ${images.length}`);
    console.log(`productImage missing url: ${missingUrl}`);
    console.log(`productImage url fingerprint: ${urlFingerprint}`);

    const categories = await prisma.category.findMany({ select: { id: true, imageUrl: true } });
    console.log(`category rows with imageUrl: ${categories.filter((c) => c.imageUrl).length}/${categories.length}`);

    const users = await prisma.user.findMany({ select: { id: true, passwordHash: true } });
    const emptyHash = users.filter((u) => !u.passwordHash).length;
    console.log(`users: ${users.length}, empty passwordHash: ${emptyHash}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
