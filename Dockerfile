# Self-hosted Hare: Node server build + owner sign-in (access key + authenticator).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server \
    VITE_AUTH_ENABLED=false \
    VITE_HARE_OWNER_AUTH=true
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund pg@^8.16.3 \
    && addgroup -S hare && adduser -S hare -G hare
COPY --from=build /app/.output ./.output
COPY migrations ./migrations
COPY scripts/migrate.mjs scripts/migration-plan.mjs ./scripts/
USER hare
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node .output/server/index.mjs"]
