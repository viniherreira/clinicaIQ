import 'server-only';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getTenantClient, prisma } from '@clinicaiq/db';
import { clinicToday } from '@/lib/tz';
import { reportError } from '@/lib/observability';
import type { Role } from '@/lib/permissions';
import { claude } from './cliente';
import { blocoContexto } from './prompt';
import { ferramentasPara } from './registro';
import { AVISO_CORTADA, AVISO_LIMITE, AVISO_RECUSA, responder, type NovaMensagem, type Param } from './loop';
import { carregarHistorico, criarConversa, salvarMensagens } from './historico';
import { ERRO_CONVERSA_ILEGIVEL } from './mensagens-erro';

export const SEPARADOR_FIM = '\u0000';

const Pedido = z.object({ pergunta: z.string().trim().min(1).max(2000), conversaId: z.string().max(64).optional() });

export function lerPedido(corpo: unknown):
  | { ok: true; pergunta: string; conversaId: string | undefined }
  | { ok: false; erro: string } {
  const r = Pedido.safeParse(corpo);
  if (!r.success) return { ok: false, erro: 'Escreva uma pergunta de até 2000 caracteres.' };
  return { ok: true, pergunta: r.data.pergunta, conversaId: r.data.conversaId };
}

const AVISOS = [AVISO_RECUSA, AVISO_LIMITE, AVISO_CORTADA];
const CORTES = ['max_tokens', 'model_context_window_exceeded'];

/** Se o turno terminou com um dos avisos fixos do loop, devolve o texto; senão, null. */
export function avisoFinal(novas: NovaMensagem[], parouPor: string): string | null {
  const ultima = novas[novas.length - 1];
  if (!ultima || ultima.param.role !== 'assistant') return null;
  const c = ultima.param.content;
  const texto = typeof c === 'string' ? c : c.map((b) => (b.type === 'text' ? b.text : '')).join('');
  if (AVISOS.includes(texto)) return texto;
  // Resposta cortada sem ferramenta pendente: o loop não acrescenta mensagem (quebraria a alternância), a rota avisa.
  return CORTES.includes(parouPor) ? AVISO_CORTADA : null;
}

const PAPEL: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', RECEPTIONIST: 'Recepção', PROFESSIONAL: 'Profissional' };
const DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Só LÊ a conversa pedida (não cria nada): erros daqui saem como JSON, antes do stream. */
export async function prepararTurno(args: {
  tenantId: string;
  userId: string;
  conversaId?: string;
}): Promise<{ ok: true; historico: Param[]; conversaId?: string } | { ok: false; erro: string; status: number }> {
  const { tenantId, userId, conversaId } = args;
  if (!conversaId) return { ok: true, historico: [] };
  let h: Param[] | null;
  try {
    h = await carregarHistorico(tenantId, userId, conversaId);
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId, etapa: 'carregarHistorico' });
    return { ok: false, erro: ERRO_CONVERSA_ILEGIVEL, status: 409 };
  }
  if (!h) return { ok: false, erro: 'Conversa não encontrada.', status: 404 };
  return { ok: true, historico: h, conversaId };
}

/** Uma pergunta inteira: monta o contexto, roda o loop escrevendo em `escrever`, grava e audita. */
export async function rodarTurno(args: {
  tenantId: string;
  userId: string;
  role: Role;
  pergunta: string;
  historico: Param[];
  conversaId?: string;
  escrever: (t: string) => void;
}): Promise<{ conversaId?: string; parouPor: string }> {
  const { tenantId, userId, role, pergunta, historico, escrever } = args;
  let conversaId = args.conversaId;

  let escreveu = false;
  const escreverRastreado = (t: string) => {
    if (t) escreveu = true;
    escrever(t);
  };
  // Depois de a resposta aparecer, um aviso não pode colar nela.
  const avisar = (t: string) => escrever(escreveu ? `\n\n${t}` : t);

  let r: Awaited<ReturnType<typeof responder>>;
  try {
    const [tenant, user] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.user.findFirst({ where: { id: userId, tenantId }, select: { name: true } }),
    ]);
    const hoje = clinicToday();
    const perguntaParam: Param = {
      role: 'user',
      content: [
        blocoContexto({
          hoje,
          diaSemana: DIA[new Date(`${hoje}T12:00:00Z`).getUTCDay()],
          clinica: tenant?.name ?? 'Clínica',
          usuario: user?.name ?? 'Usuário',
          papel: PAPEL[role] ?? role,
        }),
        { type: 'text', text: pergunta },
      ],
    };
    r = await responder({
      cliente: claude(),
      historico,
      pergunta: perguntaParam,
      ferramentas: ferramentasPara(role),
      ctx: { tenantId, userId, role, hoje, db: getTenantClient(tenantId) },
      aoEscrever: escreverRastreado,
    });
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId });
    const ocupado = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500);
    avisar(ocupado ? 'O assistente está ocupado. Tente de novo em instantes.' : 'Algo deu errado ao responder. Tente de novo.');
    return { conversaId, parouPor: 'erro' };
  }

  const aviso = avisoFinal(r.novas, r.parouPor);
  if (aviso) avisar(aviso);

  try {
    // Conversa nova só nasce aqui, com a resposta em mãos: erro antes disso não deixa conversa vazia.
    if (!conversaId) conversaId = await criarConversa(tenantId, userId, pergunta);
    await salvarMensagens(tenantId, conversaId, r.novas);
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId, etapa: 'salvar' });
    avisar('A resposta não pôde ser salva no histórico.');
    return { conversaId, parouPor: r.parouPor };
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'assistant.query',
        entity: 'AssistantConversation',
        entityId: conversaId,
        metadata: { tools: r.novas.flatMap((n) => n.tools), parouPor: r.parouPor },
      },
    });
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId, etapa: 'auditoria' });
  }
  return { conversaId, parouPor: r.parouPor };
}
