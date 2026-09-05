# Railway-friendly multi-stage build.
# Use full bookworm (not slim) so OpenSSL/ca-certificates are already present —
# apt-get on slim images often OOM/kills the build ("runc run failed: container process is already dead").
FROM node:20-bookworm AS build
WORKDIR /app

ENV NODE_ENV=development
ENV NODE_OPTIONS=--max-old-space-size=768
# Match Prisma binaryTargets in schema.prisma (debian-openssl-3.0.x)
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build \
  && npx --yes esbuild@0.25.0 prisma/seed.ts \
    --bundle --platform=node --target=node20 \
    --outfile=dist/seed.js \
    --external:@prisma/client \
    --external:bcrypt \
  && npx --yes esbuild@0.25.0 scripts/purge-demo.ts \
    --bundle --platform=node --target=node20 \
    --outfile=dist/purge-demo.js \
    --external:@prisma/client

# Keep prisma CLI for migrate/generate in the runtime image
RUN npm prune --omit=dev \
  && npm install prisma --omit=dev --no-save \
  && npx prisma generate

FROM node:20-bookworm AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=384
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh start.sh ./

RUN chmod +x /app/docker-entrypoint.sh /app/start.sh \
  && mkdir -p /data /app/uploads/products /app/uploads/banners \
  && npx prisma generate

EXPOSE 3000

# CMD (not ENTRYPOINT) so Railway startCommand can override cleanly if needed.
# Absolute path avoids WORKDIR / PATH quirks on Railway.
CMD ["/bin/sh", "/app/docker-entrypoint.sh"]
