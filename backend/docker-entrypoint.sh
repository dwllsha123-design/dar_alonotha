#!/bin/sh
# Production entrypoint for Nest API (Docker Compose + Railway Dockerfile/Railpack).
set -eu

# Resolve app root: Docker WORKDIR is /app; Railpack/local may run from backend/
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$APP_DIR"

mkdir -p /data "$APP_DIR/uploads/products" "$APP_DIR/uploads/banners" 2>/dev/null || \
  mkdir -p "$APP_DIR/uploads/products" "$APP_DIR/uploads/banners"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[api] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/dist/main.js" ]; then
  echo "[api] ERROR: dist/main.js missing — build the API before start" >&2
  exit 1
fi

# Ensure Query Engine matches this container (debian-openssl-3.0.x / bookworm)
echo "[api] prisma generate..."
npx prisma generate

echo "[api] prisma migrate deploy..."
npx prisma migrate deploy

if [ "${ALLOW_SEED:-}" = "true" ]; then
  echo "[api] Running database seed (ALLOW_SEED=true)..."
  node dist/seed.js
fi

# Railway injects PORT; Nest reads it via ConfigService (default 3000)
echo "[api] starting on PORT=${PORT:-3000}..."
exec node dist/main.js
