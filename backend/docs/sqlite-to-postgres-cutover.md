# SQLite → PostgreSQL cutover (DO NOT RUN until explicitly approved)

Production today:

- `DATABASE_URL=file:/data/app.db` (SQLite) — **do not change yet**
- Verified backup: `/app/uploads/_db-backups/daralonotha-20260908-210233.db`
- Media stays on `/app/uploads` (Volume) — **never migrate files**

## Dual schema layout

| Path | Role |
|------|------|
| `prisma/schema.prisma` | **Production SQLite** (unchanged provider) |
| `prisma/migrations/*` | SQLite migrations |
| `prisma/postgres/schema.prisma` | **PostgreSQL target** + color media |
| `prisma/postgres/migrations/*` | PG init migration (CREATE only) |
| `prisma/generated/postgres-client` | Generated PG Prisma client (local/CI) |

## Env for migration only

```bash
export SQLITE_SOURCE_URL='file:/app/uploads/_db-backups/daralonotha-20260908-210233.db?mode=ro'
export POSTGRES_TARGET_URL='postgresql://…'   # never commit / never log
```

Do **not** set production `DATABASE_URL` to Postgres until cutover step 5.

## Commands

```bash
# Inspect only
npm run db:migrate:sqlite-to-postgres -- --dry-run

# Live import into EMPTY Postgres (refuses if target has rows)
npm run db:migrate:sqlite-to-postgres

# Resume if a prior partial import left unique conflicts
npm run db:migrate:sqlite-to-postgres -- --allow-non-empty
```

## Production cutover checklist (manual later)

1. Enable temporary maintenance / write lock (store + admin write APIs).
2. Final SQLite snapshot under `/app/uploads/_db-backups/` + integrity check.
3. Set `SQLITE_SOURCE_URL` to that snapshot (`?mode=ro`) and `POSTGRES_TARGET_URL` to Railway Postgres.
4. Run live migration + confirm reconciliation all **OK**.
5. Only then switch Railway `DATABASE_URL` to Postgres URL.
6. Point app Prisma at Postgres schema (or replace main schema provider) and run `prisma migrate deploy` for PG.
7. Deploy backend; keep `/app/uploads` volume mounted unchanged.
8. Smoke test: login (password hashes), product images URLs, place order, stock.
9. Disable maintenance mode.
10. Keep SQLite `/data/app.db` and backups intact for rollback (do not delete).

## Rollback (if needed)

1. Point `DATABASE_URL` back to `file:/data/app.db`.
2. Redeploy previous SQLite-capable build.
3. Do not delete Postgres; investigate offline.

## Safety guarantees of the import script

- Source opened read-only (`mode=ro`)
- No DELETE/TRUNCATE against source
- No writes under `/app/uploads` (URLs only)
- Target refused if non-empty unless `--allow-non-empty`
- Critical count mismatches fail the job
