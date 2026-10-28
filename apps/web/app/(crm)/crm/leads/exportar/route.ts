import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { effectiveStatus, leadWhere, parseFilters, parseListParams, statusWhere } from '@/crm/board-data';
import { toCsv, type Cell } from '@/crm/csv';
import { formatFieldValue, readFieldValues } from '@/crm/custom-fields';
import { formatCents, SOURCE_LABEL } from '@/crm/format';
import { guardCrmAction } from '@/crm/guard';
import { listFieldDefs } from '@/crm/lead-fields';
import { decryptPhone } from '@/crm/phone';
import { formatPhoneBR } from '@/lib/document-content';
import { clinicToday, instantDateBR } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITE = 20_000;

/**
 * Exporta a lista de leads (os filtros e a situação da tela) como planilha
 * CSV para o Excel, com todas as colunas e os campos personalizados.
 *
 * Só quem tem "Exportar" no quadro de permissões (o Gestor, por padrão): sai o
 * telefone completo. Cada exportação vai para a auditoria (LGPD).
 */
export async function GET(req: Request) {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return new NextResponse(g.message, { status: 403 });
  if (g.rights.leads.export !== 'all') return new NextResponse('Seu cargo no CRM não permite exportar.', { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseFilters(sp);
  const status = effectiveStatus(parseListParams(sp).status, filters);

  const [leads, fields, pipelines] = await Promise.all([
    g.db.lead.findMany({
      where: { ...leadWhere(g, filters), ...statusWhere(status) },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: LIMITE,
      include: {
        stage: { select: { name: true, pipelineId: true } },
        assignedTo: { select: { name: true } },
        interestProcedure: { select: { name: true } },
        lostReason: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    }),
    listFieldDefs(g.db, { activeOnly: true }),
    g.db.pipeline.findMany({ select: { id: true, name: true } }),
  ]);
  const funil = new Map(pipelines.map((p) => [p.id, p.name]));

  const header = [
    'Negócio', 'Pessoa', 'Telefone', 'E-mail', 'Funil', 'Etapa', 'Situação', 'Responsável', 'Valor', 'Origem', 'Interesse', 'Tags',
    'Criado em', 'Fechado em', 'Motivo da perda',
    ...fields.map((f) => f.name),
  ];
  const rows: Cell[][] = leads.map((l) => {
    const valores = readFieldValues(l.fields);
    const fechado = l.wonAt ?? l.lostAt;
    return [
      l.title ?? '',
      l.name,
      formatPhoneBR(decryptPhone(l.phoneEncrypted, g.tenantId)) ?? '',
      l.email ?? '',
      funil.get(l.stage.pipelineId) ?? '',
      l.stage.name,
      l.wonAt ? 'Ganho' : l.lostAt ? 'Perdido' : 'Aberto',
      l.assignedTo?.name ?? '',
      l.estimatedValueCents != null ? formatCents(l.estimatedValueCents) : '',
      SOURCE_LABEL[l.source] ?? l.source,
      l.interestProcedure?.name ?? '',
      l.tags.map((t) => t.tag.name).join(', '),
      instantDateBR(l.createdAt.toISOString()),
      fechado ? instantDateBR(fechado.toISOString()) : '',
      l.lostReason?.name ?? '',
      ...fields.map((f) => formatFieldValue(f, valores[f.id])),
    ];
  });

  await prisma.auditLog.create({
    data: {
      tenantId: g.tenantId,
      userId: g.userId,
      action: 'LEADS_EXPORTED',
      entity: 'Lead',
      entityId: 'export',
      metadata: { count: rows.length, status, filters: sp },
    },
  });

  return new NextResponse(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-dreamclin-${clinicToday()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
