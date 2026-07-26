# Gateway that holds one WhatsApp Web socket per clinic. Long-lived process —
# serverless platforms (Vercel/Lambda) can't host it. Build from the repo root:
#   docker build -f apps/whatsapp-gateway/Dockerfile .
# On Railway this is selected automatically via railway.json.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app

# Copy the whole workspace so pnpm can validate the lockfile. Install the gateway
# AND @clinicaiq/db (which owns the Prisma schema and the Prisma CLI). Keeps the
# image lean — no Next.js/Playwright. NODE_ENV=development so devDependencies
# (the Prisma CLI) install: Railway builds with NODE_ENV=production, which skips
# them by default.
COPY . .
RUN NODE_ENV=development pnpm install \
    --filter @clinicaiq/whatsapp-gateway --filter @clinicaiq/db --frozen-lockfile

# Generate the Prisma client from the db package, where the schema and the CLI
# live together. Running it from the gateway (with an external --schema) made
# Prisma try to auto-install its CLI and fail. This is the same command the
# Vercel build uses, so it's known-good. The generated client is shared through
# the pnpm store, so the gateway picks it up.
RUN pnpm --filter @clinicaiq/db run generate

ENV NODE_ENV=production
WORKDIR /app/apps/whatsapp-gateway
EXPOSE 8080
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
