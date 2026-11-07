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

export const SEPARADOR_FIM = '\u0000';

const Pedido = z.object({ pergunta: z.string().trim().min(1).max(2000), conversaId: z.string().optional() });

export function lerPedido(corpo: unknown):
  | { ok: true; pergunta: string; conversaId: string | undefined }
  | { ok: false; erro: string } {
  const r = Pedido.safeParse(corpo);
  if (!r.success) return { ok: false, erro: 'Escreva uma pergunta de até 2000 caracteres.' };
  return { ok: true, pergunta: r.data.pergunta, conversaId: r.data.conversaId };
}

export const ERRO_CONVERSA_ILEGIVEL = 'Não foi possível abrir esta conversa. Comece uma nova.';

const AVISOS = [AVISO_RECUSA, AVISO_LIMITE, AVISO_CORTADA];

/** Se o turno terminou com um dos avisos fixos do loop, devolve o texto; senão, null. */
export function avisoFinal(novas: NovaMensagem[]): string | null {
  const ultima = novas[novas.length - 1];
  if (!ultima || ultima.param.role !== 'assistant') return null;
  const c = ultima.param.content;
  const texto = typeof c === 'string' ? c : c.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return AVISOS.includes(texto) ? texto : null;
}

const PAPEL: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', RECEPTIONIST: 'Recepção', PROFESSIONAL: 'Profissional' };
const DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Uma pergunta inteira: monta o contexto, roda o loop escrevendo em `escrever`, grava e audita. */
export async function rodarTurno(args: {
  tenantId: string;
  userId: string;
  role: Role;
  pergunta: string;
  conversaId?: string;
  escrever: (t: string) => void;
}): Promise<{ conversaId: string; parouPor: string } | { erro: string; status: number }> {
  const { tenantId, userId, role, pergunta, escrever } = args;

  let conversaId = args.conversaId;
  let historico: Param[] = [];
  if (conversaId) {
    let h: Param[] | null;
    try {
      h = await carregarHistorico(tenantId, userId, conversaId);
    } catch (e) {
      reportError(e, { area: 'assistente', tenantId, etapa: 'carregarHistorico' });
      return { erro: ERRO_CONVERSA_ILEGIVEL, status: 409 };
    }
    if (!h) return { erro: 'Conversa não encontrada.', status: 404 };
    historico = h;
  } else {
    conversaId = await criarConversa(tenantId, userId, pergunta);
  }

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

  const ferramentas = ferramentasPara(role);
  let escreveu = false;
  const escreverRastreado = (t: string) => {
    if (t) escreveu = true;
    escrever(t);
  };
  try {
    const r = await responder({
      cliente: claude(),
      historico,
      pergunta: perguntaParam,
      ferramentas,
      ctx: { tenantId, userId, role, hoje, db: getTenantClient(tenantId) },
      aoEscrever: escreverRastreado,
    });
    const aviso = avisoFinal(r.novas);
    if (aviso) escrever(escreveu ? `\n\n${aviso}` : aviso);
    await salvarMensagens(tenantId, conversaId, r.novas);
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
    return { conversaId, parouPor: r.parouPor };
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId });
    const ocupado = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500);
    escrever(ocupado ? 'O assistente está ocupado. Tente de novo em instantes.' : 'Algo deu errado ao responder. Tente de novo.');
    return { conversaId, parouPor: 'erro' };
  }
}
