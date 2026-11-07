import 'server-only';
import { decrypt, encrypt, prisma } from '@clinicaiq/db';
import type { NovaMensagem, Param } from './loop';

export const RETENCAO_DIAS = 30;

const chave = () => {
  const k = process.env.ENCRYPTION_MASTER_KEY;
  if (!k) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return k;
};

export async function criarConversa(tenantId: string, userId: string, titulo: string): Promise<string> {
  const c = await prisma.assistantConversation.create({
    data: { tenantId, userId, title: titulo.slice(0, 80) },
    select: { id: true },
  });
  return c.id;
}

/** Null quando a conversa não existe ou é de outra pessoa: cada um vê só as suas. */
export async function carregarHistorico(tenantId: string, userId: string, conversationId: string): Promise<Param[] | null> {
  const conversa = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
    select: { messages: { orderBy: { seq: 'asc' }, select: { content: true } } },
  });
  if (!conversa) return null;
  const k = chave();
  return conversa.messages.map((m) => JSON.parse(decrypt(m.content, k, tenantId)) as Param);
}

export async function salvarMensagens(tenantId: string, conversationId: string, novas: NovaMensagem[]): Promise<void> {
  if (novas.length === 0) return;
  const k = chave();
  await prisma.$transaction(async (tx) => {
    const ultima = await tx.assistantMessage.findFirst({
      where: { conversationId, tenantId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const base = (ultima?.seq ?? -1) + 1;
    await tx.assistantMessage.createMany({
      data: novas.map((n, i) => ({
        tenantId,
        conversationId,
        seq: base + i,
        role: n.param.role,
        content: encrypt(JSON.stringify(n.param), k, tenantId),
        tools: n.tools,
        inputTokens: n.inputTokens,
        outputTokens: n.outputTokens,
      })),
    });
    await tx.assistantConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  });
}

export async function listarConversas(tenantId: string, userId: string) {
  const cs = await prisma.assistantConversation.findMany({
    where: { tenantId, userId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  });
  return cs.map((c) => ({ id: c.id, titulo: c.title, atualizadaEm: c.updatedAt.toISOString() }));
}

/** Chamada pelo cron `reminders`. Apaga conversas paradas há mais de 30 dias (as mensagens vão em cascata). */
export async function apagarAntigas(agora: Date): Promise<number> {
  const corte = new Date(agora.getTime() - RETENCAO_DIAS * 86_400_000);
  const r = await prisma.assistantConversation.deleteMany({ where: { updatedAt: { lt: corte } } });
  return r.count;
}
