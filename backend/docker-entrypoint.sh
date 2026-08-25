#!/bin/sh
set -e
mkdir -p /data /app/uploads/products /app/uploads/banners

# Ensure Query Engine matches this container (debian-openssl-3.0.x)
echo "[api] prisma generate..."
npx prisma generate

echo "[api] prisma migrate deploy..."
npx prisma migrate deploy

# Always remove leftover demo catalog (safe / idempotent) — Railway auto-deploy
if [ -f dist/purge-demo.js ]; then
  echo "[api] Purging demo products if any..."
  node dist/purge-demo.js || echo "[api] purge-demo warning (non-fatal)"
fi

if [ "${ALLOW_SEED:-}" = "true" ]; then
  echo "[api] Running database seed (ALLOW_SEED=true)..."
  node dist/seed.js
fi

exec node dist/main.js
