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
          if (MODELS_WITHOUT_TENANT.has(model) || result == null) return result;
          // findUnique's where only accepts unique fields, so tenantId can't be
          // injected — we verify ownership on the returned row instead. If a
          // restrictive `select` stripped tenantId we cannot verify, so fail
          // closed rather than risk leaking another tenant's record.
          if (!('tenantId' in result)) {
            throw new Error(
              `getTenantClient: findUnique on "${model}" must select tenantId so ownership can be verified.`,
            );
          }
          return result.tenantId === tenantId ? result : null;
        },
        async upsert({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            // upsert's where is a unique selector we can't constrain by tenant,
            // so a cross-tenant unique-key collision could touch another tenant's
            // row. Do upserts on the raw client behind an explicit ownership check.
            throw new Error(
              `getTenantClient: upsert on "${model}" is not tenant-safe; use raw prisma with an explicit tenant guard.`,
            );
          }
          return query(args);
        },
        async groupBy({ model, args, query }: { model: string; args: any; query: any }) {
          if (!MODELS_WITHOUT_TENANT.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
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
