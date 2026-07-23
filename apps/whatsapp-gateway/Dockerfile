# Gateway that holds one WhatsApp Web socket per clinic. It must run as a
# long-lived process — serverless platforms (Vercel/Lambda) cannot host it.
# Build from the repo root:  docker build -f apps/whatsapp-gateway/Dockerfile .
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/whatsapp-gateway/package.json apps/whatsapp-gateway/
COPY packages/db/package.json packages/db/
RUN pnpm install --filter @clinicaiq/whatsapp-gateway --frozen-lockfile

# The gateway reads whatsapp_sessions / whatsapp_auth_keys through its own
# Prisma client, so it needs the schema to generate against.
COPY packages/db/prisma packages/db/prisma
COPY apps/whatsapp-gateway apps/whatsapp-gateway
RUN pnpm --filter @clinicaiq/whatsapp-gateway exec prisma generate --schema ../../packages/db/prisma/schema.prisma

ENV NODE_ENV=production
WORKDIR /app/apps/whatsapp-gateway
EXPOSE 8080
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
