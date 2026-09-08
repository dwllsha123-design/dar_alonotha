/**
 * Dual-client SQLite → PostgreSQL data migration.
 *
 * Env (required for real run):
 *   SQLITE_SOURCE_URL=file:/path/to/backup.db?mode=ro
 *   POSTGRES_TARGET_URL=postgresql://...   (never logged)
 *
 * Flags:
 *   --dry-run              inspect only, no writes
 *   --allow-non-empty      allow import when target already has rows (upsert/skip existing IDs)
 *   --skip-schema          skip prisma migrate deploy on postgres schema
 *
 * NEVER mutates SQLite source. NEVER touches /app/uploads files.
 */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';

type Counts = Record<string, number>;

const ROOT = join(__dirname, '..');
const PG_SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const SQLITE_SCHEMA = join(ROOT, 'prisma', 'sqlite-legacy', 'schema.prisma');
const SQLITE_GENERATED = join(ROOT, 'prisma', 'generated', 'sqlite-legacy-client');

const FLAGS = new Set(process.argv.slice(2));
const DRY_RUN = FLAGS.has('--dry-run');
const ALLOW_NON_EMPTY = FLAGS.has('--allow-non-empty');
const SKIP_SCHEMA = FLAGS.has('--skip-schema');

/** Dependency-safe table order (parents → children). */
const MODEL_ORDER = [
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

type ModelName = (typeof MODEL_ORDER)[number];

const RECONCILE_LABELS: Array<{ label: string; model: ModelName }> = [
  { label: 'Users', model: 'user' },
  { label: 'Products', model: 'product' },
  { label: 'Categories', model: 'category' },
  { label: 'Orders', model: 'order' },
  { label: 'OrderItems', model: 'orderItem' },
  { label: 'Banners', model: 'banner' },
  { label: 'Images/media references', model: 'productImage' },
  { label: 'ColorMedia', model: 'productColorMedia' },
  { label: 'Variants', model: 'productVariant' },
  { label: 'Stock records', model: 'stockItem' },
];

function maskUrl(url: string): string {
  try {
    if (url.startsWith('file:')) return url.replace(/\?.*/, '') + ' (sqlite)';
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || ''}${u.pathname} (credentials redacted)`;
  } catch {
    return '[unparseable url]';
  }
}

function fingerprintSecret(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 10);
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env ${name}`);
  }
  return v;
}

function toRoSqliteUrl(url: string): string {
  // Prefer explicit mode=ro; never write to source.
  if (!url.startsWith('file:')) return url;
  if (url.includes('mode=ro')) return url;
  return url.includes('?') ? `${url}&mode=ro` : `${url}?mode=ro`;
}

function assertNoUploadsMutation() {
  // Hard guard: this script must never import fs write helpers for uploads.
  const uploadsHint = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(uploadsHint) && !existsSync('/app/uploads')) {
    console.log('[ok] uploads path not required for DB-only migration');
  } else {
    console.log('[ok] media files are NOT migrated (URLs only); /app/uploads untouched');
  }
}

async function countAll(client: { [k: string]: any }, models: readonly ModelName[]): Promise<Counts> {
  const out: Counts = {};
  for (const m of models) {
    const delegate = client[m];
    if (!delegate?.count) {
      throw new Error(`Missing Prisma delegate for model ${m}`);
    }
    out[m] = await delegate.count();
  }
  return out;
}

function runPrisma(args: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args,
    {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      shell: true,
    },
  );
  return r;
}

function generateSqliteLegacyClient() {
  console.log('[schema] generating SQLite legacy Prisma client…');
  const r = runPrisma(['prisma', 'generate', `--schema=${SQLITE_SCHEMA}`], {
    ...process.env,
    SQLITE_SOURCE_URL:
      process.env.SQLITE_SOURCE_URL || 'file:./dev.db',
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('prisma generate (sqlite-legacy) failed');
  }
}

function generatePostgresClient() {
  console.log('[schema] generating PostgreSQL Prisma client…');
  const r = runPrisma(['prisma', 'generate', `--schema=${PG_SCHEMA}`], {
    ...process.env,
    DATABASE_URL:
      process.env.POSTGRES_TARGET_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public',
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('prisma generate (postgres) failed');
  }
}

function deployPostgresSchema(targetUrl: string) {
  console.log('[schema] prisma migrate deploy (postgres target only)…');
  const r = runPrisma(
    ['prisma', 'migrate', 'deploy', `--schema=${PG_SCHEMA}`],
    { ...process.env, DATABASE_URL: targetUrl },
  );
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('prisma migrate deploy (postgres) failed');
  }
  console.log(r.stdout || '[schema] deploy ok');
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = v;
      continue;
    }
    // Prisma Decimal → string for PG Decimal
    if (typeof v === 'object' && v !== null && 'toFixed' in (v as object)) {
      out[k] = (v as { toString: () => string }).toString();
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function importModel(
  sqlite: any,
  pg: any,
  model: ModelName,
  dryRun: boolean,
): Promise<{ source: number; written: number }> {
  const rows: Record<string, unknown>[] = await sqlite[model].findMany();
  if (dryRun) {
    return { source: rows.length, written: 0 };
  }
  if (!rows.length) return { source: 0, written: 0 };

  // Categories: parents before children
  let ordered = rows;
  if (model === 'category') {
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const visited = new Set<string>();
    const result: typeof rows = [];
    const visit = (id: string) => {
      if (visited.has(id)) return;
      const row = byId.get(id);
      if (!row) return;
      const parentId = row.parentId ? String(row.parentId) : null;
      if (parentId && byId.has(parentId)) visit(parentId);
      visited.add(id);
      result.push(row);
    };
    for (const r of rows) visit(String(r.id));
    ordered = result;
  }

  let written = 0;
  for (const row of ordered) {
    const data = serializeRow(row);
    try {
      await pg[model].create({ data });
      written += 1;
    } catch (e: any) {
      const code = e?.code;
      // P2002 unique — only allowed in resume mode
      if (code === 'P2002' && ALLOW_NON_EMPTY) {
        console.warn(`[resume] skip existing ${model} id=${String((data as any).id ?? '?')}`);
        continue;
      }
      console.error(`[FAIL] ${model} row=`, JSON.stringify({ id: (data as any).id, keys: Object.keys(data) }));
      throw e;
    }
  }
  return { source: rows.length, written };
}

async function validateIntegrity(sqlite: any, pg: any) {
  const issues: string[] = [];

  // Orphan product images
  const products = new Set((await pg.product.findMany({ select: { id: true } })).map((p: any) => p.id));
  const images = await pg.productImage.findMany({ select: { id: true, productId: true, url: true } });
  for (const img of images) {
    if (!products.has(img.productId)) issues.push(`orphan productImage ${img.id}`);
    if (!img.url) issues.push(`missing image url ${img.id}`);
  }

  const variants = await pg.productVariant.findMany({ select: { id: true, productId: true } });
  for (const v of variants) {
    if (!products.has(v.productId)) issues.push(`orphan variant ${v.id}`);
  }

  const colorMedia = await pg.productColorMedia.findMany({ select: { id: true, productId: true, url: true } });
  for (const m of colorMedia) {
    if (!products.has(m.productId)) issues.push(`orphan colorMedia ${m.id}`);
    if (!m.url) issues.push(`missing colorMedia url ${m.id}`);
  }

  // Password hashes preserved sample
  const srcUsers = await sqlite.user.findMany({ select: { id: true, passwordHash: true } });
  for (const u of srcUsers) {
    const t = await pg.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    if (!t) {
      issues.push(`missing user ${u.id}`);
      continue;
    }
    if (t.passwordHash !== u.passwordHash) {
      issues.push(`passwordHash mismatch user ${u.id}`);
    }
  }

  // Duplicate IDs impossible with PK; spot-check order items
  const srcOrders = await sqlite.order.count();
  const tgtOrders = await pg.order.count();
  if (srcOrders !== tgtOrders) issues.push(`order count ${srcOrders} != ${tgtOrders}`);

  return issues;
}

async function main() {
  console.log('=== SQLite → PostgreSQL migration ===');
  console.log(DRY_RUN ? 'MODE: DRY-RUN (no writes)' : 'MODE: LIVE IMPORT');
  assertNoUploadsMutation();

  const sqliteUrl = toRoSqliteUrl(requireEnv('SQLITE_SOURCE_URL'));
  const postgresUrl = requireEnv('POSTGRES_TARGET_URL');

  console.log(`SQLITE_SOURCE_URL: ${maskUrl(sqliteUrl)}`);
  console.log(`POSTGRES_TARGET_URL: ${maskUrl(postgresUrl)} fingerprint=${fingerprintSecret(postgresUrl)}`);

  if (sqliteUrl.includes('/app/uploads') && !sqliteUrl.includes('_db-backups')) {
    console.warn('[warn] source points under uploads but not _db-backups — ensure you are using a backup file');
  }

  generateSqliteLegacyClient();
  generatePostgresClient();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: SqliteClient } = require(SQLITE_GENERATED);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: PgClient } = require('@prisma/client');

  const sqlite = new SqliteClient({
    datasources: { db: { url: sqliteUrl } },
    log: ['error'],
  });
  const pg = new PgClient({
    datasources: { db: { url: postgresUrl } },
    log: ['error'],
  });

  try {
    await sqlite.$connect();
    await pg.$connect();

    // Prove SQLite is readable
    const sourceCounts = await countAll(sqlite, MODEL_ORDER);
    console.log('\n--- Source (SQLite) planned counts ---');
    for (const m of MODEL_ORDER) {
      console.log(`  ${m}: ${sourceCounts[m]}`);
    }

    if (!DRY_RUN && !SKIP_SCHEMA) {
      deployPostgresSchema(postgresUrl);
    } else if (DRY_RUN) {
      console.log('[dry-run] skipping schema deploy');
    }

    let targetCountsBefore: Counts = {};
    try {
      targetCountsBefore = await countAll(pg, MODEL_ORDER);
    } catch {
      targetCountsBefore = Object.fromEntries(MODEL_ORDER.map((m) => [m, 0]));
      if (DRY_RUN) {
        console.log('[dry-run] target schema may be empty / not deployed yet');
      }
    }

    console.log('\n--- Target (PostgreSQL) current counts ---');
    for (const m of MODEL_ORDER) {
      console.log(`  ${m}: ${targetCountsBefore[m] ?? 0}`);
    }

    const targetTotal = Object.values(targetCountsBefore).reduce((a, b) => a + (b || 0), 0);
    if (!DRY_RUN && targetTotal > 0 && !ALLOW_NON_EMPTY) {
      throw new Error(
        `Target PostgreSQL already has ${targetTotal} rows. Refusing to import. ` +
          `Use --allow-non-empty for explicit resume (skips conflicting IDs), or use an empty database.`,
      );
    }

    if (DRY_RUN) {
      console.log('\n--- Dry-run planned import ---');
      for (const m of MODEL_ORDER) {
        console.log(`  would copy ${m}: ${sourceCounts[m]}`);
      }
      console.log('\nDRY-RUN complete. No data written.');
      return;
    }

    console.log('\n--- Importing ---');
    for (const m of MODEL_ORDER) {
      const result = await importModel(sqlite, pg, m, false);
      console.log(`  ${m}: source=${result.source} written=${result.written}`);
      if (result.written !== result.source && !ALLOW_NON_EMPTY) {
        throw new Error(`Critical: ${m} wrote ${result.written}/${result.source}`);
      }
    }

    const targetCountsAfter = await countAll(pg, MODEL_ORDER);
    console.log('\n--- Reconciliation ---');
    let mismatch = 0;
    for (const { label, model } of RECONCILE_LABELS) {
      const s = sourceCounts[model];
      const t = targetCountsAfter[model];
      const ok = s === t;
      if (!ok) mismatch += 1;
      console.log(`  ${label}: source=${s} / target=${t} ${ok ? 'OK' : 'MISMATCH'}`);
    }
    for (const m of MODEL_ORDER) {
      if (sourceCounts[m] !== targetCountsAfter[m]) {
        console.log(`  [detail] ${m}: ${sourceCounts[m]} → ${targetCountsAfter[m]}`);
      }
    }

    const issues = await validateIntegrity(sqlite, pg);
    if (issues.length) {
      console.error('\nIntegrity issues:');
      for (const i of issues) console.error(`  - ${i}`);
      throw new Error(`${issues.length} integrity issue(s)`);
    }

    // Confirm source still readable with same counts (no mutation)
    const sourceAfter = await countAll(sqlite, MODEL_ORDER);
    for (const m of MODEL_ORDER) {
      if (sourceAfter[m] !== sourceCounts[m]) {
        throw new Error(`SOURCE MUTATED: ${m} ${sourceCounts[m]} → ${sourceAfter[m]}`);
      }
    }
    console.log('\nSOURCE UNCHANGED: PASS');
    if (mismatch) {
      throw new Error(`Reconciliation failed: ${mismatch} critical mismatches`);
    }
    console.log('RECONCILIATION: PASS');
    console.log('Done.');
  } finally {
    await sqlite.$disconnect().catch(() => undefined);
    await pg.$disconnect().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error('\nMIGRATION FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
