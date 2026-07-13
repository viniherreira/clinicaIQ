import Anthropic from '@anthropic-ai/sdk';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { CLINIC_TZ, clinicToday, wallClockTime } from '@/lib/tz';

/**
 * The ClinicaIQ assistant ("o IQ"): answers natural-language questions about
 * the clinic by calling read-only, tenant-scoped tools — never invented
 * numbers. Runs on Claude Haiku (cheap, fast); inert unless ANTHROPIC_API_KEY
 * is set. Tools intentionally expose no CPF/phone (LGPD).
 */

const MODEL = 'claude-haiku-4-5';
const MAX_TOOL_ROUNDS = 6;

export function assistantEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── Wall-clock helpers (appointments are stored as wall-clock-in-UTC) ────────

function dayRange(date: string) {
  return {
    gte: new Date(`${date}T00:00:00.000Z`),
    lte: new Date(`${date}T23:59:59.999Z`),
  };
}

function rangeFromTo(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T23:59:59.999Z`),
  };
}

/** Current clinic wall-clock time expressed in the storage convention (UTC). */
function clinicNowAsUTC(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00.000Z`);
}

const STATUS_PT: Record<string, string> = {
  SCHEDULED: 'agendado',
  CONFIRMED: 'confirmado',
  RESCHEDULED: 'remarcado',
  CANCELLED: 'cancelado',
  ATTENDED: 'compareceu',
  MISSED: 'faltou',
};

const QUOTE_STATUS_PT: Record<string, string> = {
  DRAFT: 'rascunho',
  SENT: 'enviado',
  VIEWED: 'visualizado',
  ACCEPTED: 'aceito',
  REJECTED: 'recusado',
  EXPIRED: 'expirado',
};

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_agenda',
    description:
      'Lista os agendamentos de um dia específico: horário, paciente, profissional, procedimento e status (agendado/confirmado/compareceu/faltou/cancelado). Use para qualquer pergunta sobre a agenda de um dia (quem vem, horários, faltas do dia).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'resumo_financeiro',
    description:
      'Resumo financeiro de um período: total recebido (com detalhe por forma de pagamento), valores a receber de orçamentos aceitos (com a parte vencida) e produção (atendimentos realizados valorados pelo preço do procedimento). Use para perguntas sobre faturamento, recebimentos, dinheiro, inadimplência.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string', description: 'Início do período, YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Fim do período, YYYY-MM-DD' },
      },
      required: ['data_inicio', 'data_fim'],
    },
  },
  {
    name: 'buscar_paciente',
    description:
      'Busca pacientes pelo nome e retorna, para cada um: número de prontuário, total de atendimentos, próximo agendamento, último atendimento, total pago e saldo em aberto de orçamentos aceitos. Não retorna CPF nem telefone.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome (ou parte do nome) do paciente' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'estatisticas',
    description:
      'Estatísticas de um período: agendamentos por status (faltas, comparecimentos, cancelamentos), atendimentos por profissional, e orçamentos criados/aceitos com taxa de conversão. Use para perguntas do tipo "quantas faltas", "qual profissional atendeu mais", "quantos orçamentos fechamos".',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string', description: 'Início do período, YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Fim do período, YYYY-MM-DD' },
      },
      required: ['data_inicio', 'data_fim'],
    },
  },
];

// ─── Tool execution (tenant-scoped, read-only) ────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function execTool(tenantId: string, name: string, input: Record<string, unknown>): Promise<string> {
  const db = getTenantClient(tenantId);

  if (name === 'consultar_agenda') {
    const date = String(input.date ?? '');
    if (!DATE_RE.test(date)) return JSON.stringify({ erro: 'data inválida, use YYYY-MM-DD' });
    const appts = await db.appointment.findMany({
      where: { startTime: dayRange(date) },
      include: {
        patient: { select: { name: true } },
        professional: { select: { name: true } },
        procedure: { select: { name: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    return JSON.stringify({
      data: date,
      total: appts.length,
      agendamentos: appts.map((a) => ({
        horario: wallClockTime(a.startTime),
        paciente: a.patient.name,
        profissional: a.professional.name,
        procedimento: a.procedure?.name ?? null,
        status: STATUS_PT[a.status] ?? a.status,
      })),
    });
  }

  if (name === 'resumo_financeiro') {
    const from = String(input.data_inicio ?? '');
    const to = String(input.data_fim ?? '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return JSON.stringify({ erro: 'datas inválidas, use YYYY-MM-DD' });

    const [payments, acceptedQuotes, attended] = await Promise.all([
      db.payment.findMany({
        where: { paidAt: rangeFromTo(from, to) },
        select: { amount: true, method: true },
      }),
      db.quote.findMany({
        where: { status: 'ACCEPTED' },
        select: { total: true, validUntil: true, payments: { select: { amount: true } } },
      }),
      db.appointment.findMany({
        where: { startTime: rangeFromTo(from, to), status: 'ATTENDED' },
        select: { procedure: { select: { basePrice: true } } },
      }),
    ]);

    const recebido = payments.reduce((s, p) => s + Number(p.amount), 0);
    const porForma: Record<string, number> = {};
    for (const p of payments) {
      const m = p.method || 'não informado';
      porForma[m] = (porForma[m] ?? 0) + Number(p.amount);
    }

    const now = clinicNowAsUTC();
    let aReceber = 0;
    let vencido = 0;
    for (const q of acceptedQuotes) {
      const paid = q.payments.reduce((s, p) => s + Number(p.amount), 0);
      const open = Math.max(0, Number(q.total) - paid);
      aReceber += open;
      if (q.validUntil < now) vencido += open;
    }

    const producao = attended.reduce((s, a) => s + Number(a.procedure?.basePrice ?? 0), 0);

    return JSON.stringify({
      periodo: { de: from, ate: to },
      recebido_no_periodo: recebido,
      recebido_por_forma: porForma,
      a_receber_total: aReceber,
      dos_quais_vencidos: vencido,
      producao_no_periodo: producao,
      observacao: 'valores em reais (BRL)',
    });
  }

  if (name === 'buscar_paciente') {
    const nome = String(input.nome ?? '').trim();
    if (nome.length < 2) return JSON.stringify({ erro: 'informe ao menos 2 letras do nome' });
    const words = nome.split(/\s+/).slice(0, 6);
    const patients = await db.patient.findMany({
      where: {
        deletedAt: null,
        active: true,
        AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })),
      },
      select: { id: true, name: true, controlNumber: true },
      take: 5,
      orderBy: { name: 'asc' },
    });
    if (patients.length === 0) return JSON.stringify({ resultado: 'nenhum paciente encontrado com esse nome' });

    const now = clinicNowAsUTC();
    const result = [];
    for (const p of patients) {
      const [total, next, last, quotes, pays] = await Promise.all([
        db.appointment.count({ where: { patientId: p.id, status: 'ATTENDED' } }),
        db.appointment.findFirst({
          where: { patientId: p.id, startTime: { gte: now }, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] } },
          orderBy: { startTime: 'asc' },
          select: { startTime: true, professional: { select: { name: true } } },
        }),
        db.appointment.findFirst({
          where: { patientId: p.id, status: 'ATTENDED' },
          orderBy: { startTime: 'desc' },
          select: { startTime: true },
        }),
        db.quote.findMany({
          where: { patientId: p.id, status: 'ACCEPTED' },
          select: { total: true, payments: { select: { amount: true } } },
        }),
        db.payment.findMany({ where: { patientId: p.id }, select: { amount: true } }),
      ]);
      const totalPago = pays.reduce((s, x) => s + Number(x.amount), 0);
      const emAberto = quotes.reduce((s, q) => {
        const paid = q.payments.reduce((a, x) => a + Number(x.amount), 0);
        return s + Math.max(0, Number(q.total) - paid);
      }, 0);
      result.push({
        nome: p.name,
        prontuario: p.controlNumber,
        atendimentos_realizados: total,
        proximo_agendamento: next
          ? `${next.startTime.toISOString().slice(0, 10)} ${wallClockTime(next.startTime)} com ${next.professional.name}`
          : null,
        ultimo_atendimento: last ? last.startTime.toISOString().slice(0, 10) : null,
        total_pago: totalPago,
        saldo_em_aberto: emAberto,
      });
    }
    return JSON.stringify({ pacientes: result, observacao: 'valores em reais (BRL)' });
  }

  if (name === 'estatisticas') {
    const from = String(input.data_inicio ?? '');
    const to = String(input.data_fim ?? '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return JSON.stringify({ erro: 'datas inválidas, use YYYY-MM-DD' });

    const [appts, quotes] = await Promise.all([
      db.appointment.findMany({
        where: { startTime: rangeFromTo(from, to) },
        select: { status: true, professional: { select: { name: true } } },
      }),
      db.quote.findMany({
        where: { createdAt: rangeFromTo(from, to) },
        select: { status: true, total: true },
      }),
    ]);

    const porStatus: Record<string, number> = {};
    const porProfissional: Record<string, number> = {};
    for (const a of appts) {
      const s = STATUS_PT[a.status] ?? a.status;
      porStatus[s] = (porStatus[s] ?? 0) + 1;
      if (a.status === 'ATTENDED') {
        porProfissional[a.professional.name] = (porProfissional[a.professional.name] ?? 0) + 1;
      }
    }

    const quotesPorStatus: Record<string, number> = {};
    let aceitoValor = 0;
    for (const q of quotes) {
      const s = QUOTE_STATUS_PT[q.status] ?? q.status;
      quotesPorStatus[s] = (quotesPorStatus[s] ?? 0) + 1;
      if (q.status === 'ACCEPTED') aceitoValor += Number(q.total);
    }
    const enviados = quotes.filter((q) => q.status !== 'DRAFT').length;
    const aceitos = quotesPorStatus['aceito'] ?? 0;

    return JSON.stringify({
      periodo: { de: from, ate: to },
      agendamentos_total: appts.length,
      agendamentos_por_status: porStatus,
      atendimentos_por_profissional: porProfissional,
      orcamentos_por_status: quotesPorStatus,
      orcamentos_conversao_pct: enviados > 0 ? Math.round((aceitos / enviados) * 100) : null,
      orcamentos_valor_aceito: aceitoValor,
    });
  }

  return JSON.stringify({ erro: `ferramenta desconhecida: ${name}` });
}

// ─── Assistant loop ───────────────────────────────────────────────────────────

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  text: string;
  toolsUsed: string[];
}

function systemPrompt(clinicName: string): string {
  const hoje = clinicToday();
  const diaSemana = new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TZ, weekday: 'long' }).format(new Date());
  return `Você é o Assistente ClinicaIQ da clínica "${clinicName}". Você ajuda a equipe (recepção, profissionais e gestão) respondendo perguntas sobre a agenda, os pacientes e o financeiro da clínica.

Hoje é ${hoje} (${diaSemana}), fuso de São Paulo.

Regras:
- SEMPRE use as ferramentas para responder perguntas sobre dados da clínica. Nunca invente números, nomes, horários ou valores.
- Converta datas relativas ("hoje", "ontem", "amanhã", "esta semana", "este mês") usando a data atual acima antes de chamar a ferramenta.
- Se a ferramenta não retornar dados, diga isso claramente em vez de supor.
- Responda em português do Brasil, direto e curto: 1 a 5 frases ou uma lista enxuta. Formate valores como R$ 1.234,56.
- Nunca mencione CPF, telefone ou dados que não vieram das ferramentas.
- Perguntas fora do contexto da clínica (política, receitas, etc.): recuse com uma frase simpática e volte ao tema.
- Você tem acesso somente leitura: não é possível criar, alterar ou cancelar nada. Se pedirem, explique como fazer no sistema (Agenda, Pacientes, Orçamentos, Financeiro, Configurações).`;
}

/** Runs one assistant turn (with an internal tool loop) for a tenant. */
export async function runAssistant(
  tenantId: string,
  history: ChatTurn[],
): Promise<AssistantReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: 'O assistente ainda não foi configurado nesta instalação.', toolsUsed: [] };

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const toolsUsed = new Set<string>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(tenant?.name ?? 'clínica'),
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        toolsUsed.add(block.name);
        let output: string;
        try {
          output = await execTool(tenantId, block.name, block.input as Record<string, unknown>);
        } catch {
          output = JSON.stringify({ erro: 'falha ao consultar os dados' });
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: output });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { text: text || 'Não consegui elaborar uma resposta. Tente reformular a pergunta.', toolsUsed: [...toolsUsed] };
  }

  return { text: 'A consulta ficou complexa demais. Tente uma pergunta mais específica.', toolsUsed: [...toolsUsed] };
}
