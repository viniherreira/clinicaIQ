'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@clinicaiq/db';
import { guardCrmAction } from '@/crm/guard';
import {
  createImportFields,
  IMPORT_BATCH,
  importBatch,
  MAX_IMPORT,
  previewImport,
  type ImportPreview,
  type ImportSummary,
} from '@/crm/import';

/**
 * Importar leads de planilha, em três passos: a prévia, os campos novos e os
 * lotes. Só dono e administrador (`crm_config`). Regras em `crm/import.ts`;
 * o navegador já leu o arquivo e montou os leads (`crm/import-map.ts`), e
 * tudo é conferido de novo aqui.
 */

const texto = (max: number) => z.string().trim().max(max);

const previewSchema = z.object({
  phones: z.array(z.string().regex(/^55\d{10,11}$/)).max(MAX_IMPORT),
  stages: z.array(z.object({ pipeline: texto(40).nullable(), stage: texto(40).nullable() })).max(MAX_IMPORT),
  tags: z.array(texto(30)).max(MAX_IMPORT),
  responsibles: z.array(texto(120)).max(MAX_IMPORT),
  pipelineId: z.string().nullable(),
});

export async function previewImportAction(
  input: z.input<typeof previewSchema>,
): Promise<{ ok: true; preview: ImportPreview } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm_config', { write: false });
  if (!g.ok) return g;
  const p = previewSchema.safeParse(input);
  if (!p.success) return { ok: false, message: 'A planilha tem dados que não dá para ler.' };
  const { pipelineId, ...resto } = p.data;
  return { ok: true, preview: await previewImport(g, resto, pipelineId) };
}

const fieldsSchema = z
  .array(
    z.object({
      key: z.string().regex(/^new:\d+$/),
      name: texto(60).min(1),
      type: z.enum(['TEXT', 'SELECT']),
      options: z.array(texto(60)).max(30),
    }),
  )
  .max(40);

export async function createImportFieldsAction(
  input: z.input<typeof fieldsSchema>,
): Promise<{ ok: true; keys: Record<string, string> } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const p = fieldsSchema.safeParse(input);
  if (!p.success) return { ok: false, message: 'Confira os nomes dos campos novos.' };
  return createImportFields(g, p.data);
}

const iso = z.string().datetime().nullable();

const recordSchema = z.object({
  line: z.number().int().min(2),
  title: texto(120).nullable(),
  name: texto(120).min(1),
  phone: z.string().regex(/^55\d{10,11}$/),
  email: texto(200).nullable(),
  valueCents: z.number().int().min(0).max(10_000_000_000).nullable(),
  pipeline: texto(40).nullable(),
  stage: texto(40).nullable(),
  outcome: z.enum(['open', 'won', 'lost']),
  responsible: texto(120).nullable(),
  tags: z.array(texto(30).min(1)).max(20),
  createdAt: iso,
  closedAt: iso,
  source: z.enum(['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO']).nullable(),
  notes: z.array(texto(2000)).max(20),
  lostReason: texto(60).nullable(),
  fields: z.record(z.string().regex(/^field:/), texto(2000)),
});

const batchSchema = z.object({
  records: z.array(recordSchema).min(1).max(IMPORT_BATCH),
  options: z.object({
    duplicates: z.enum(['skip', 'update', 'create']),
    pipelineId: z.string().nullable(),
    createMissing: z.boolean(),
  }),
  fileName: texto(200),
});

export async function importBatchAction(
  input: z.input<typeof batchSchema>,
): Promise<{ ok: true; summary: ImportSummary } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const p = batchSchema.safeParse(input);
  if (!p.success) return { ok: false, message: `Linha com dado inválido: ${p.error.issues[0]?.path.join('.') ?? ''}` };
  const { records, options, fileName } = p.data;

  const summary = await importBatch(g, records, options);
  await prisma.auditLog.create({
    data: {
      tenantId: g.tenantId,
      userId: g.userId,
      action: 'LEADS_IMPORTED',
      entity: 'Lead',
      entityId: 'import',
      metadata: {
        fileName,
        lines: [records[0]!.line, records[records.length - 1]!.line],
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
        problems: summary.problems.length,
      },
    },
  });
  revalidatePath('/crm');
  revalidatePath('/crm/leads');
  return { ok: true, summary };
}
