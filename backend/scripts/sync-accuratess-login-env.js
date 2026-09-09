/**
 * Sync Accuratess username/password into Railway from deploy/.env.
 * Unsets broken ACCURATESS_TOKEN. Never prints secrets.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function runRailway(args) {
  const r = spawnSync('railway', args, {
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim();
    throw new Error(`railway ${args[0]} failed: ${err.slice(0, 300)}`);
  }
  return r.stdout || '';
}

const root = path.resolve(__dirname, '..', '..');
const local = parseEnvFile(path.join(root, 'deploy', '.env'));
const username = (local.ACCURATESS_USERNAME || '').trim();
const password = local.ACCURATESS_PASSWORD || '';

if (!username || !password) {
  console.error('MISSING_LOCAL_CREDS deploy/.env must have ACCURATESS_USERNAME/PASSWORD');
  process.exit(1);
}

console.log(
  JSON.stringify({
    usernamePresent: true,
    usernameLen: username.length,
    passwordPresent: true,
    passwordLen: password.length,
  }),
);

const svc = ['--service', 'backend', '--skip-deploys'];

runRailway(['variable', 'set', `ACCURATESS_ENABLED=true`, ...svc]);
runRailway(['variable', 'set', `ACCURATESS_WEBHOOK_ENABLED=false`, ...svc]);
runRailway(['variable', 'set', `ACCURATESS_USERNAME=${username}`, ...svc]);
runRailway(['variable', 'set', `ACCURATESS_PASSWORD=${password}`, ...svc]);

try {
  runRailway(['variable', 'delete', 'ACCURATESS_TOKEN', ...svc]);
  console.log('ACCURATESS_TOKEN: deleted');
} catch {
  console.log('ACCURATESS_TOKEN: delete skipped/failed (may already be absent)');
}

console.log('RAILWAY_SYNC_OK');
