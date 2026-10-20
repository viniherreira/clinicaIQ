import type { Prisma } from '@clinicaiq/db';
import { normalize } from './bot-engine';
import { parseFieldInput, type FieldDef } from './custom-fields';
import { CRM_COLORS } from './defaults';
import type { CrmContext } from './guard';
import type { ImportRecord } from './import-map';
import { listFieldDefs, saveField, setLeadFields } from './lead-fields';
import { createLead, moveLead, OPEN_LEAD, renumberStage, type Actor } from './leads';
import { mainPipeline } from './pipeline';
import { phoneHash } from './phone';
import { createPipeline, createStage } from './settings';

/**
 * Grava a importação de planilha (regras puras em `import-map.ts`). O
 * navegador manda os leads em lotes de 200; cada lote resolve funil, etapa,
 * tags, responsável e campos pelo nome e cria (ou atualiza) os leads.
 *
 * Importar não dispara automação de etapa nem robô: são negócios antigos.
 * Quem chama já passou por `guardCrmAction('crm_config')`.
 */

export const IMPORT_BATCH = 200;
export const MAX_IMPORT = 20_000;

export type DuplicateMode = 'skip' | 'update' | 'create';

export interface ImportOptions {
  duplicates: DuplicateMode;
  /** Funil para quem não diz o funil (ou diz um que não existe e não é para criar). */
  pipelineId: string | null;
  /** Cria funis e etapas que a planilha cita e ainda não existem. */
  createMissing: boolean;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  problems: { line: number; message: string }[];
}

const chave = (s: string) => normalize(s);

// ─── Antes de importar ───────────────────────────────────────────────────────

export interface PreviewInput {
  phones: string[];
  stages: { pipeline: string | null; stage: string | null }[];
  tags: string[];
  responsibles: string[];
}

export interface ImportPreview {
  /** Telefones da planilha que já têm lead aberto. */
  duplicates: number;
  newPipelines: string[];
  newStages: { pipeline: string; stage: string }[];
  newTags: string[];
  unknownResponsibles: string[];
}

/** O que vai acontecer: duplicados, funis/etapas/tags novos e responsáveis que não existem. */
export async function previewImport(ctx: CrmContext, input: PreviewInput, defaultPipelineId: string | null): Promise<ImportPreview> {
  const { db, tenantId } = ctx;
  const hashes = [...new Set(input.phones)].map((p) => phoneHash(p, tenantId));
  const [abertos, funis, etapas, tags, users] = await Promise.all([
    hashes.length
      ? db.lead.findMany({ where: { phoneHash: { in: hashes }, ...OPEN_LEAD }, select: { phoneHash: true }, distinct: ['phoneHash'] })
      : [],
    db.pipeline.findMany({ select: { id: true, name: true, order: true, createdAt: true } }),
    db.pipelineStage.findMany({ select: { name: true, pipelineId: true } }),
    db.leadTag.findMany({ select: { name: true } }),
    db.user.findMany({ where: { active: true }, select: { name: true, email: true } }),
  ]);
  const padrao = funis.find((p) => p.id === defaultPipelineId) ?? mainPipeline(funis);

  const newPipelines = new Map<string, string>();
  const newStages = new Map<string, { pipeline: string; stage: string }>();
  for (const s of input.stages) {
    const funil = s.pipeline ? funis.find((p) => chave(p.name) === chave(s.pipeline!)) : padrao;
    if (s.pipeline && !funil) newPipelines.set(chave(s.pipeline), s.pipeline);
    if (!s.stage) continue;
    const existe = funil && etapas.some((e) => e.pipelineId === funil.id && chave(e.name) === chave(s.stage!));
    const nomeFunil = funil?.name ?? s.pipeline ?? padrao?.name ?? '';
    if (!existe) newStages.set(`${chave(nomeFunil)}|${chave(s.stage)}`, { pipeline: nomeFunil, stage: s.stage });
  }
  const tagsExistem = new Set(tags.map((t) => t.name));
  const quem = new Set(users.flatMap((u) => [chave(u.name), u.email.toLowerCase()]));
  return {
    duplicates: abertos.length,
    newPipelines: [...newPipelines.values()],
    newStages: [...newStages.values()],
    newTags: [...new Set(input.tags)].filter((t) => !tagsExistem.has(t)),
    unknownResponsibles: [...new Set(input.responsibles)].filter((r) => !quem.has(chave(r)) && !quem.has(r.toLowerCase())),
  };
}

// ─── Campos novos ────────────────────────────────────────────────────────────

export interface NewFieldSpec {
  /** `new:<coluna>`, como em `ImportRecord.fields`. */
  key: string;
  name: string;
  type: 'TEXT' | 'SELECT';
  options: string[];
}

/** Cria os campos das colunas novas (ou reaproveita o de mesmo nome). Devolve `new:<coluna>` → `field:<id>`. */
export async function createImportFields(
  ctx: CrmContext,
  specs: NewFieldSpec[],
): Promise<{ ok: true; keys: Record<string, string> } | { ok: false; message: string }> {
  const keys: Record<string, string> = {};
  const atuais = await listFieldDefs(ctx.db);
  for (const spec of specs) {
    const igual = atuais.find((f) => chave(f.name) === chave(spec.name));
    if (igual) {
      keys[spec.key] = `field:${igual.id}`;
      continue;
    }
    const r = await saveField(ctx.db, ctx.tenantId, {
      name: spec.name,
      type: spec.type,
      options: spec.options,
      showOnCard: false,
      active: true,
    });
    if (!r.ok) return { ok: false, message: `Campo "${spec.name}": ${r.message}` };
    keys[spec.key] = `field:${r.id}`;
  }
  return { ok: true, keys };
}

// ─── Importar um lote ────────────────────────────────────────────────────────

type Stage = { id: string; name: string; pipelineId: string; role: string | null; order: number };

export async function importBatch(ctx: CrmContext, records: ImportRecord[], options: ImportOptions): Promise<ImportSummary> {
  const { db, tenantId } = ctx;
  const actor: Actor = { tenantId, userId: ctx.userId };
  const resumo: ImportSummary = { created: 0, updated: 0, skipped: 0, problems: [] };

  let funis = await db.pipeline.findMany({ select: { id: true, name: true, order: true, createdAt: true } });
  let etapas: Stage[] = await db.pipelineStage.findMany({ select: { id: true, name: true, pipelineId: true, role: true, order: true } });
  const tags = new Map((await db.leadTag.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]));
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } });
  const motivos = await db.lostReason.findMany({ select: { id: true, name: true, order: true } });
  const defs = new Map((await listFieldDefs(db, { activeOnly: true })).map((d) => [d.id, d]));
  const padrao = funis.find((p) => p.id === options.pipelineId) ?? mainPipeline(funis);
  if (!padrao) return { ...resumo, problems: records.map((r) => ({ line: r.line, message: 'a clínica não tem funil' })) };
  const mexidas = new Set<string>();

  const recarregar = async () => {
    funis = await db.pipeline.findMany({ select: { id: true, name: true, order: true, createdAt: true } });
    etapas = await db.pipelineStage.findMany({ select: { id: true, name: true, pipelineId: true, role: true, order: true } });
  };

  async function funilDe(nome: string | null) {
    if (!nome) return padrao!;
    const achou = funis.find((p) => chave(p.name) === chave(nome));
    if (achou || !options.createMissing) return achou ?? padrao!;
    const r = await createPipeline(db, tenantId, nome);
    if (!r.ok) return padrao!;
    await recarregar();
    return funis.find((p) => p.id === r.id) ?? padrao!;
  }

  async function etapaDe(funilId: string, nome: string | null): Promise<Stage | undefined> {
    const doFunil = () => etapas.filter((e) => e.pipelineId === funilId);
    if (nome) {
      const achou = doFunil().find((e) => chave(e.name) === chave(nome));
      if (achou) return achou;
      if (options.createMissing) {
        const cor = CRM_COLORS[doFunil().length % CRM_COLORS.length];
        const r = await createStage(db, tenantId, nome, cor, funilId);
        if (r.ok) {
          await recarregar();
          const nova = doFunil().find((e) => chave(e.name) === chave(nome.trim().replace(/\s+/g, ' ')));
          if (nova) return nova;
        }
      }
    }
    return doFunil().find((e) => e.role === 'NEW');
  }

  async function motivoDe(nome: string | null) {
    const n = (nome ?? 'Importado').trim().slice(0, 60) || 'Importado';
    const achou = motivos.find((m) => chave(m.name) === chave(n));
    if (achou) return achou.id;
    const novo = await db.lostReason.create({
      data: { tenantId, name: n, order: Math.max(0, ...motivos.map((m) => m.order)) + 1 },
      select: { id: true, name: true, order: true },
    });
    motivos.push(novo);
    return novo.id;
  }

  async function tagIds(nomes: string[]) {
    const ids: string[] = [];
    for (const nome of nomes) {
      let id = tags.get(nome);
      if (!id) {
        const cor = CRM_COLORS[tags.size % CRM_COLORS.length];
        id = (await db.leadTag.create({ data: { tenantId, name: nome, color: cor }, select: { id: true } })).id;
        tags.set(nome, id);
      }
      ids.push(id);
    }
    return ids;
  }

  const responsavel = (r: string | null) => {
    if (!r) return null;
    const k = chave(r);
    return users.find((u) => chave(u.name) === k || u.email.toLowerCase() === r.trim().toLowerCase())?.id ?? null;
  };

  /** Campos válidos para gravar; o que não serve vira aviso e não impede o lead. */
  function camposDe(rec: ImportRecord) {
    const valores: Record<string, unknown> = {};
    const avisos: string[] = [];
    for (const [k, v] of Object.entries(rec.fields)) {
      if (!k.startsWith('field:')) continue;
      const def: FieldDef | undefined = defs.get(k.slice(6));
      if (!def) continue;
      const bruto = def.type === 'MULTISELECT' ? v.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : v;
      const p = parseFieldInput(def, bruto);
      if (p.ok) valores[def.id] = p.value;
      else avisos.push(`${def.name}: ${p.message}`);
    }
    return { valores, avisos };
  }

  async function completar(leadId: string, rec: ImportRecord) {
    const ids = await tagIds(rec.tags);
    if (ids.length) {
      await db.leadTagOnLead.createMany({ data: ids.map((tagId) => ({ tenantId, leadId, tagId })), skipDuplicates: true });
    }
    if (rec.notes.length) {
      await db.leadActivity.createMany({
        data: rec.notes.map((text) => ({ tenantId, leadId, type: 'NOTE' as const, actorId: ctx.userId, data: { text, imported: true } })),
      });
    }
    const { valores, avisos } = camposDe(rec);
    const r = await setLeadFields(db, actor, leadId, valores, { history: false });
    if (!r.ok) avisos.push(r.message);
    for (const a of avisos) resumo.problems.push({ line: rec.line, message: `importado, mas ${a}` });
  }

  for (const rec of records) {
    try {
      const funil = await funilDe(rec.pipeline);
      const etapa = rec.outcome === 'open' ? await etapaDe(funil.id, rec.stage) : undefined;
      // Etapa que já é a de ganho/perda no funil também fecha o lead.
      const outcome = etapa?.role === 'WON' ? 'won' : etapa?.role === 'LOST' ? 'lost' : rec.outcome;
      const destino =
        outcome === 'won'
          ? etapas.find((e) => e.pipelineId === funil.id && e.role === 'WON')
          : outcome === 'lost'
            ? etapas.find((e) => e.pipelineId === funil.id && e.role === 'LOST')
            : etapa;
      if (!destino) {
        resumo.problems.push({ line: rec.line, message: `o funil "${funil.name}" está sem etapa de entrada, ganho ou perda` });
        continue;
      }
      const assignedToId = responsavel(rec.responsible);
      const hash = phoneHash(rec.phone, tenantId);

      // Duplicado: lead aberto com o mesmo telefone; para negócio fechado, o mesmo negócio já fechado.
      if (options.duplicates !== 'create') {
        const existente = await db.lead.findFirst({
          where:
            outcome === 'open'
              ? { phoneHash: hash, ...OPEN_LEAD }
              : {
                  phoneHash: hash,
                  deletedAt: null,
                  title: rec.title,
                  stageId: destino.id,
                },
          orderBy: { createdAt: 'desc' },
          select: { id: true, stageId: true, email: true },
        });
        if (existente && options.duplicates === 'skip') {
          resumo.skipped++;
          continue;
        }
        if (existente) {
          await db.lead.updateMany({
            where: { id: existente.id },
            data: {
              ...(rec.title ? { title: rec.title } : {}),
              ...(rec.email && !existente.email ? { email: rec.email } : {}),
              ...(rec.valueCents !== null ? { estimatedValueCents: rec.valueCents } : {}),
              ...(assignedToId ? { assignedToId } : {}),
              updatedById: ctx.userId,
            },
          });
          if (outcome === 'open' && destino.id !== existente.stageId) {
            await moveLead(db, actor, existente.id, { stageId: destino.id, automations: false, renumber: false, origin: { reason: 'import' } });
            mexidas.add(destino.id);
          }
          await completar(existente.id, rec);
          resumo.updated++;
          continue;
        }
      }

      const entrada = etapas.find((e) => e.pipelineId === funil.id && e.role === 'NEW');
      const criado = await createLead(db, actor, {
        name: rec.name,
        phone: rec.phone,
        title: rec.title,
        email: rec.email,
        source: rec.source ?? 'MANUAL',
        estimatedValueCents: rec.valueCents,
        assignedToId,
        stageId: outcome === 'open' ? destino.id : entrada?.id,
        pipelineId: funil.id,
        automations: false,
      });
      if (!criado.ok) {
        resumo.problems.push({ line: rec.line, message: criado.message });
        continue;
      }
      const criadoEm = rec.createdAt ? new Date(rec.createdAt) : null;
      const fechadoEm = rec.closedAt ? new Date(rec.closedAt) : (criadoEm ?? new Date());
      const data: Prisma.LeadUncheckedUpdateManyInput = {
        ...(criadoEm ? { createdAt: criadoEm, stageEnteredAt: criadoEm } : {}),
        ...(outcome === 'won' ? { stageId: destino.id, wonAt: fechadoEm, stageEnteredAt: fechadoEm } : {}),
        ...(outcome === 'lost'
          ? { stageId: destino.id, lostAt: fechadoEm, stageEnteredAt: fechadoEm, lostReasonId: await motivoDe(rec.lostReason) }
          : {}),
      };
      if (Object.keys(data).length) await db.lead.updateMany({ where: { id: criado.leadId }, data });
      if (criadoEm) await db.leadActivity.updateMany({ where: { leadId: criado.leadId, type: 'CREATED' }, data: { createdAt: criadoEm } });
      await completar(criado.leadId, rec);
      resumo.created++;
    } catch (e) {
      console.error('[crm/import] linha', rec.line, e instanceof Error ? e.message : 'erro');
      resumo.problems.push({ line: rec.line, message: 'não foi possível gravar' });
    }
  }

  for (const stageId of mexidas) await renumberStage(db, tenantId, stageId);
  return resumo;
}
