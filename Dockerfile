FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=768
# OpenSSL needed so prisma generate picks debian-openssl-3.0.x correctly
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json ./
COPY backend/src ./src
RUN npm run build \
  && npx --yes esbuild@0.25.0 prisma/seed.ts \
    --bundle --platform=node --target=node20 \
    --outfile=dist/seed.js \
    --external:@prisma/client \
    --external:bcrypt

# Keep prisma CLI for migrate/generate in the runtime image
RUN npm prune --omit=dev \
  && npm install prisma --omit=dev --no-save \
  && npx prisma generate

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=384
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Final generate on the runtime Linux image (ensures query engine for debian-openssl-3.0.x)
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /data /app/uploads/products /app/uploads/banners \
  && npx prisma generate

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
