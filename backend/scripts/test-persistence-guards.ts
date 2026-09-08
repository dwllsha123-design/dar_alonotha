/**
 * Persistence / deploy-safety regression guards (no live DB required).
 * Run: npm run test:persistence
 */
import { patchOptionalImageUrl } from '../src/common/patch-semantics';
import { assertSafeUploadRoot, uploadRoot } from '../src/common/upload-paths';
import { assertProductionEnv } from '../src/common/production-env';
import { readFileSync } from 'fs';
import { join } from 'path';

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

function expectThrow(name: string, fn: () => void) {
  try {
    fn();
    ok(name, false, 'expected throw');
  } catch {
    ok(name, true);
  }
}

// Upload root
process.env.RAILWAY_VOLUME_MOUNT_PATH = '/app/uploads';
ok('upload root uses railway volume', uploadRoot() === '/app/uploads');
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.UPLOAD_ROOT = '/app/uploads';
ok('upload root uses UPLOAD_ROOT', uploadRoot() === '/app/uploads');
delete process.env.UPLOAD_ROOT;

process.env.UPLOAD_ROOT = '/tmp/uploads';
expectThrow('reject /tmp upload root', () => assertSafeUploadRoot());
delete process.env.UPLOAD_ROOT;

// Production env fail-fast
const prev = { ...process.env };
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.CORS_ORIGINS = 'https://daralonotha.com';
process.env.APP_URL = 'https://api.example.com';
process.env.STORE_URL = 'https://daralonotha.com';

delete process.env.DATABASE_URL;
expectThrow('production missing DATABASE_URL fails', () => assertProductionEnv());

process.env.DATABASE_URL = 'file:/data/app.db';
expectThrow('production SQLite DATABASE_URL fails', () => assertProductionEnv());

process.env.DATABASE_URL = 'postgresql://u:p@host:5432/db';
ok('production postgres DATABASE_URL accepted', (() => {
  assertProductionEnv();
  return true;
})());

Object.assign(process.env, prev);
process.env.NODE_ENV = prev.NODE_ENV || 'development';

// PATCH semantics
ok('omitted field preserves image', patchOptionalImageUrl(undefined) === undefined);
ok('empty imageUrl preserves', patchOptionalImageUrl('') === undefined);
ok('null imageUrl preserves on PATCH', patchOptionalImageUrl(null) === undefined);

// Entrypoint must not auto-purge / auto-seed
const entry = readFileSync(join(__dirname, '..', 'docker-entrypoint.sh'), 'utf8');
ok('entrypoint never runs migrate reset', !/migrate reset/.test(entry));
ok('entrypoint never force-reset', !/force-reset/.test(entry));
ok('entrypoint uses migrate deploy', /prisma migrate deploy/.test(entry));
ok('purge-demo gated by ALLOW_PURGE_DEMO', entry.includes('ALLOW_PURGE_DEMO'));
ok('purge-demo not unconditional', !/node dist\/purge-demo\.js/.test(entry.split('ALLOW_PURGE_DEMO')[0]));
ok('seed is opt-in ALLOW_SEED', /ALLOW_SEED/.test(entry));
ok('entrypoint rejects file: DATABASE_URL', /file:\*/.test(entry));

// Schema provider
const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
ok('primary schema is postgresql', /provider\s*=\s*"postgresql"/.test(schema));
ok('primary schema uses DATABASE_URL', /env\("DATABASE_URL"\)/.test(schema));
ok('no sqlite provider in primary schema', !/provider\s*=\s*"sqlite"/.test(schema));

const lock = readFileSync(
  join(__dirname, '..', 'prisma', 'migrations', 'migration_lock.toml'),
  'utf8',
);
ok('migration lock is postgresql', /provider\s*=\s*"postgresql"/.test(lock));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
