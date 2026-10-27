FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 has no prebuilt binary for Alpine (musl), so npm compiles it from source.
# The toolchain only exists in this stage; the runtime image just receives the compiled module.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# `docker compose --profile test run --rm --build web-test` runs type check, lint and tests.
FROM deps AS test
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["sh", "-c", "npm run typecheck && npm run lint && npm test"]

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/nexo-assist.db
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
