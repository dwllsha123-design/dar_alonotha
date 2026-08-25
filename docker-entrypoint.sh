#!/bin/sh
set -e
mkdir -p /data /app/uploads/products /app/uploads/banners

# Ensure Query Engine matches this container (debian-openssl-3.0.x)
echo "[api] prisma generate..."
npx prisma generate

echo "[api] prisma migrate deploy..."
npx prisma migrate deploy

if [ "${ALLOW_SEED:-}" = "true" ]; then
  echo "[api] Running database seed (ALLOW_SEED=true)..."
  node dist/seed.js
fi

exec node dist/main.js
