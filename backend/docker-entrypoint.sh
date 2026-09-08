#!/bin/sh
set -e

# Persistent media root (Railway volume mount). Never use /tmp or ephemeral paths.
UPLOAD_ROOT="${RAILWAY_VOLUME_MOUNT_PATH:-/app/uploads}"
export UPLOAD_ROOT

mkdir -p \
  "$UPLOAD_ROOT/products" \
  "$UPLOAD_ROOT/products/color-media" \
  "$UPLOAD_ROOT/products/color-media/videos" \
  "$UPLOAD_ROOT/banners" \
  "$UPLOAD_ROOT/categories"

# Fail fast: production must not silently create SQLite
case "${DATABASE_URL:-}" in
  "")
    echo "[api] FATAL: DATABASE_URL is required"
    exit 1
    ;;
  file:*)
    echo "[api] FATAL: SQLite DATABASE_URL is forbidden in this image. Use Railway PostgreSQL."
    exit 1
    ;;
esac

echo "[api] prisma generate..."
npx prisma generate

echo "[api] prisma migrate deploy (additive only — never reset)..."
npx prisma migrate deploy

# Destructive demo purge is OPT-IN only (never default)
if [ "${ALLOW_PURGE_DEMO:-}" = "true" ] && [ -f dist/purge-demo.js ]; then
  echo "[api] ALLOW_PURGE_DEMO=true — running purge-demo..."
  node dist/purge-demo.js || echo "[api] purge-demo warning (non-fatal)"
fi

# Seed is OPT-IN only and must be idempotent / non-destructive
if [ "${ALLOW_SEED:-}" = "true" ]; then
  echo "[api] ALLOW_SEED=true — running seed..."
  node dist/seed.js
fi

exec node dist/main.js
