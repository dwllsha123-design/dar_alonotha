# Permanent data persistence — Dar Al Onotha

## Production database

- Provider: **PostgreSQL** (Railway Postgres service)
- App `DATABASE_URL` must be `${{Postgres.DATABASE_URL}}` (no SQLite)
- Schema: `backend/prisma/schema.prisma`
- Deploy migrations: `prisma migrate deploy` only (never reset / force-push)

## Media

- Volume: Railway `backend-volume` mounted at `/app/uploads`
- App uses `RAILWAY_VOLUME_MOUNT_PATH` / `UPLOAD_ROOT`
- Public URLs stay under `/uploads/...`

## Backups

1. **Postgres**: Railway Postgres backups / snapshots before risky migrations
2. **Media**: copy `/app/uploads` (exclude public long-term exposure of `_db-backups`)
3. Keep historical SQLite files under `/app/uploads/_db-backups/` temporarily as recovery artifacts — app must not open them

## Cutover checklist

1. Postgres ONLINE with migrated data
2. Volume still at `/app/uploads`
3. Set backend `DATABASE_URL=${{Postgres.DATABASE_URL}}`
4. Deploy backend (entrypoint: generate + migrate deploy)
5. Smoke: login, create product, upload image, restart, redeploy — data remains
