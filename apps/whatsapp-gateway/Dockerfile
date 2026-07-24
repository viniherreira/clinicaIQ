# Gateway that holds one WhatsApp Web socket per clinic. Long-lived process —
# serverless platforms (Vercel/Lambda) can't host it. Build from the repo root:
#   docker build -f apps/whatsapp-gateway/Dockerfile .
# On Railway this is selected automatically via railway.json.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app

# Copy the whole workspace so pnpm can validate the lockfile, then install only
# the gateway's dependency tree (keeps the image lean — no Next.js, Playwright…).
COPY . .
RUN pnpm install --filter @clinicaiq/whatsapp-gateway --frozen-lockfile

# The gateway talks to Postgres with its own Prisma client, generated from the
# shared schema.
RUN pnpm --filter @clinicaiq/whatsapp-gateway exec \
    prisma generate --schema ../../packages/db/prisma/schema.prisma

ENV NODE_ENV=production
WORKDIR /app/apps/whatsapp-gateway
EXPOSE 8080
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
