import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const MODELS_WITHOUT_TENANT = new Set(['Tenant', 'ProfessionalSchedule']);

export function getTenantClient(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async findFirst({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async findUnique({ model, args, query }: { model: string; args: any; query: any }) {
          const result = await query(args);
          if (
            !MODELS_WITHOUT_TENANT.has(model) &&
            result &&
            'tenantId' in result &&
            result.tenantId !== tenantId
          ) {
            return null;
          }
          return result;
        },
        async create({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.data.tenantId = tenantId;
          }
          return query(args);
        },
        async createMany({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            const data = Array.isArray(args.data) ? args.data : [args.data];
            args.data = data.map((d: Record<string, unknown>) => ({ ...d, tenantId }));
          }
          return query(args);
        },
        async update({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async updateMany({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async delete({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async deleteMany({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async count({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async aggregate({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof getTenantClient>;
