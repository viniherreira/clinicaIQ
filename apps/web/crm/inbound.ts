import { decrypt, getTenantClient, prisma } from '@clinicaiq/db';
import { readCrmPrefs } from './crm-prefs';
import { runBotOnInbound } from './bot';
import { distributeConversation } from './assignment';
import { applyOrigin, originOf, readAd } from './ad-origin';
import { applyCapture } from './capture';
import { acceptConversation, classifyConversation } from './conversations';

/**
 * O que acontece no CRM depois de gravada uma mensagem do contato que chegou
 * pela API oficial (webhook da Meta): ligar a conversa, registrar o pedido de sair, a captação
 * (palavras da primeira mensagem viram lead com tag), o lead automático do
 * número novo (em Novo, sem Aceitar), dar um responsável (distribuição) e
 * deixar o robô responder.
 */

export const OPT_OUT = /^\s*(sair|parar|descadastrar|remover|stop)\b/i;

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

export async function afterInbound(
  tenantId: string,
  conversationId: string,
  messageId: string | null,
  opts: { skipBot?: boolean } = {},
): Promise<void> {
  const db = getTenantClient(tenantId);
  await classifyConversation(db, tenantId, conversationId);
  if (!messageId) return;

  const msg = await db.chatMessage.findFirst({
    where: { id: messageId, origin: 'CONTACT' },
    select: { id: true, textEncrypted: true, ad: true },
  });
  if (!msg) return;

  let text = '';
  try {
    text = msg.textEncrypted ? decrypt(msg.textEncrypted, masterKey(), tenantId) : '';
  } catch {
    text = '';
  }

  // "SAIR": transmissões e automações param de mandar para esse negócio.
  if (OPT_OUT.test(text)) {
    const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: { leadId: true, patientId: true } });
    if (conv?.leadId) await db.lead.updateMany({ where: { id: conv.leadId }, data: { whatsappOptOut: true } });
    if (conv?.patientId) await db.patient.updateMany({ where: { id: conv.patientId }, data: { whatsappOptOut: true } });
    await db.conversation.updateMany({
      where: { id: conversationId },
      data: { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0, botWakeAt: null },
    });
    return;
  }

  // Primeira mensagem deste número? A captação roda antes do robô e pode criar
  // o lead (a conversa sai da Entrada) — o robô de contato novo continua valendo.
  const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: { status: true } });
  const first = (await db.chatMessage.count({ where: { conversationId, origin: 'CONTACT' } })) === 1;
  const novo = first && conv?.status === 'INBOX';
  if (first) {
    try {
      await applyCapture(db, tenantId, conversationId, text);
    } catch (e) {
      console.error('[crm] captação falhou', e instanceof Error ? e.message : e);
    }
  }

  // Número novo cai sozinho no funil, em Novo, como no Kommo: ninguém precisa
  // tocar em Aceitar. A captação pode já ter criado (com tags e funil); aí nada muda.
  // Vale também para a conversa que ficou na antiga Entrada e voltou a escrever.
  const prefs = readCrmPrefs((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings);
  // De onde veio: anúncio (a Meta manda junto) ou a frase do site na 1ª mensagem.
  const ad = readAd(msg.ad);
  const origem = originOf(ad, first ? text : '');
  if (conv?.status === 'INBOX' && prefs.autoLead) {
    try {
      const ainda = await db.conversation.findFirst({ where: { id: conversationId }, select: { status: true } });
      if (ainda?.status === 'INBOX') await acceptConversation(db, { tenantId, userId: null }, conversationId, origem ? { source: origem } : {});
    } catch (e) {
      console.error('[crm] lead automático falhou', e instanceof Error ? e.message : e);
    }
  }

  // O negócio aberto (novo, da captação ou que já existia) ganha a origem e a tag.
  if (origem) {
    try {
      const c = await db.conversation.findFirst({
        where: { id: conversationId },
        select: { lead: { select: { id: true, wonAt: true, lostAt: true, deletedAt: true } } },
      });
      const lead = c?.lead && !c.lead.wonAt && !c.lead.lostAt && !c.lead.deletedAt ? c.lead : null;
      if (lead) await applyOrigin(db, tenantId, lead.id, origem, ad);
    } catch (e) {
      console.error('[crm] origem do anúncio falhou', e instanceof Error ? e.message : e);
    }
  }

  // Alguém da equipe para atender: o responsável que já atendia, senão a
  // distribuição (rodízio ou menos ocupado), se a clínica ligou.
  try {
    await distributeConversation(tenantId, conversationId);
  } catch (e) {
    console.error('[crm] distribuição falhou', e instanceof Error ? e.message : e);
  }

  // Resposta pelos botões de um aviso da agenda: a agenda já tratou, o robô fica quieto.
  if (opts.skipBot) return;
  try {
    await runBotOnInbound(tenantId, conversationId, msg.id, new Date(), { newContact: novo });
  } catch (e) {
    console.error('[crm] robô falhou', e instanceof Error ? e.message : e);
  }
}
