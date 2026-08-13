'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@clinicaiq/db';
import {
  montarFunil,
  type EntradaPaciente,
  type Estagio,
  type Prioridade,
} from '@/lib/recall';
import { capabilityBlocked } from '@/lib/access';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId, active: true } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  return { tenantId: tenant.id };
}

export interface FunilData {
  fila: Prioridade[];
  /** Cadastrados que nunca agendaram. Lista à parte, não polui a fila. */
  semHistorico: Prioridade[];
  porEstagio: Record<Estagio, number>;
  emAbertoTotalCents: number;
  /**
   * Atendimentos passados que ninguém marcou como comparecido ou faltado.
   *
   * É o número mais importante desta tela e não tem nada a ver com o funil: é a
   * qualidade do dado que alimenta o funil. Enquanto ele for alto, tudo aqui é
   * estimativa.
   */
  semBaixa: number;
  /** Quantos procedimentos ainda não têm periodicidade configurada. */
  semRecorrencia: number;
  totalPacientes: number;
}

/**
 * Monta o funil de retorno.
 *
 * ## Uma decisão que precisa ficar registrada
 *
 * O ideal seria contar como "veio" só o agendamento marcado `ATTENDED`. Na base
 * real isso são 2 de 125 — a clínica agenda, atende e nunca dá baixa. Um funil
 * lendo só `ATTENDED` mostraria uma tela vazia e seria descartado na primeira
 * semana.
 *
 * Então aqui um agendamento **no passado que não foi cancelado** conta como
 * visita. É uma inferência, não um fato, e a tela diz isso: mostra quantos
 * atendimentos estão sem baixa e convida a resolver. Conforme a clínica passar a
 * marcar comparecimento, o mesmo cálculo vai ficando exato sem precisar mudar.
 */
export async function getFunil(): Promise<FunilData> {
  const { tenantId } = await requireTenant();

  const semAcesso = await capabilityBlocked(tenantId, 'pacientes');
  if (semAcesso) {
    return {
      fila: [],
      semHistorico: [],
      porEstagio: {} as Record<Estagio, number>,
      emAbertoTotalCents: 0,
      semBaixa: 0,
      semRecorrencia: 0,
      totalPacientes: 0,
    };
  }

  const agora = new Date();

  const [pacientes, agendamentos, procedimentos, orcamentos, pagamentos] = await Promise.all([
    prisma.patient.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { id: true, name: true, phoneEncrypted: true, whatsappOptOut: true },
    }),
    prisma.appointment.findMany({
      where: { tenantId },
      select: { patientId: true, procedureId: true, startTime: true, status: true },
    }),
    prisma.procedure.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        recurrenceIntervalDays: true,
        recurrenceGraceDays: true,
      },
    }),
    prisma.quote.findMany({
      where: { tenantId, status: 'ACCEPTED' },
      select: { id: true, patientId: true, total: true },
    }),
    prisma.payment.findMany({
      where: { tenantId },
      select: { patientId: true, amount: true },
    }),
  ]);

  const recorrentes = new Map(
    procedimentos
      .filter((p) => p.recurrenceIntervalDays && p.recurrenceIntervalDays > 0)
      .map((p) => [
        p.id,
        {
          nome: p.name,
          intervalo: p.recurrenceIntervalDays!,
          tolerancia: p.recurrenceGraceDays ?? 120,
        },
      ]),
  );

  // ── Agrega por paciente numa passada só ───────────────────────────────────
  interface Acc {
    ultimaVisita: Date | null;
    futuro: boolean;
    visitas: number;
    faltas: number;
    /** procedureId -> data mais recente em que foi feito */
    ultimoPorProcedimento: Map<string, Date>;
  }
  const porPaciente = new Map<string, Acc>();
  const acc = (id: string): Acc => {
    let a = porPaciente.get(id);
    if (!a) {
      a = { ultimaVisita: null, futuro: false, visitas: 0, faltas: 0, ultimoPorProcedimento: new Map() };
      porPaciente.set(id, a);
    }
    return a;
  };

  let semBaixa = 0;

  for (const ag of agendamentos) {
    const a = acc(ag.patientId);
    const passado = ag.startTime < agora;

    if (!passado) {
      if (ag.status !== 'CANCELLED') a.futuro = true;
      continue;
    }

    if (ag.status === 'MISSED') {
      a.faltas += 1;
      continue;
    }
    if (ag.status === 'CANCELLED') continue;

    // Passou da data e continua como agendado/confirmado: ninguém deu baixa.
    if (ag.status !== 'ATTENDED') semBaixa += 1;

    a.visitas += 1;
    if (!a.ultimaVisita || ag.startTime > a.ultimaVisita) a.ultimaVisita = ag.startTime;

    if (ag.procedureId && recorrentes.has(ag.procedureId)) {
      const anterior = a.ultimoPorProcedimento.get(ag.procedureId);
      if (!anterior || ag.startTime > anterior) {
        a.ultimoPorProcedimento.set(ag.procedureId, ag.startTime);
      }
    }
  }

  // ── Dinheiro ──────────────────────────────────────────────────────────────
  const aprovadoPorPaciente = new Map<string, number>();
  for (const q of orcamentos) {
    const cents = Math.round(Number(q.total) * 100);
    aprovadoPorPaciente.set(q.patientId, (aprovadoPorPaciente.get(q.patientId) ?? 0) + cents);
  }
  const pagoPorPaciente = new Map<string, number>();
  for (const p of pagamentos) {
    const cents = Math.round(Number(p.amount) * 100);
    pagoPorPaciente.set(p.patientId, (pagoPorPaciente.get(p.patientId) ?? 0) + cents);
  }

  const entradas: EntradaPaciente[] = pacientes.map((p) => {
    const a = porPaciente.get(p.id);

    // Entre vários procedimentos recorrentes, vale o mais atrasado — é o que a
    // clínica precisa resolver primeiro.
    let recorrencia: EntradaPaciente['recorrencia'] = null;
    let piorAtraso = -Infinity;
    for (const [procId, quando] of a?.ultimoPorProcedimento ?? []) {
      const r = recorrentes.get(procId);
      if (!r) continue;
      const venceEm = quando.getTime() + r.intervalo * 86_400_000;
      const atraso = (agora.getTime() - venceEm) / 86_400_000;
      if (atraso > piorAtraso) {
        piorAtraso = atraso;
        recorrencia = {
          procedimento: r.nome,
          realizadoEm: quando,
          intervaloDias: r.intervalo,
          toleranciaDias: r.tolerancia,
        };
      }
    }

    const aprovado = aprovadoPorPaciente.get(p.id) ?? 0;
    const pago = pagoPorPaciente.get(p.id) ?? 0;

    return {
      pacienteId: p.id,
      nome: p.name,
      ultimaVisita: a?.ultimaVisita ?? null,
      recorrencia,
      temAgendamentoFuturo: a?.futuro ?? false,
      naoQuerContato: p.whatsappOptOut,
      temTelefone: Boolean(p.phoneEncrypted),
      // Nunca negativo: quem pagou adiantado não "deve" menos que zero.
      emAbertoCents: Math.max(0, aprovado - pago),
      totalPagoCents: pago,
      visitas: a?.visitas ?? 0,
      faltas: a?.faltas ?? 0,
    };
  });

  const { fila, semHistorico, porEstagio, emAbertoTotalCents } = montarFunil(entradas, agora);

  return {
    // Teto por causa do payload: a fila é para trabalhar hoje, não para
    // exportar a base inteira para o navegador.
    fila: fila.slice(0, 200),
    semHistorico: semHistorico.slice(0, 200),
    porEstagio,
    emAbertoTotalCents,
    semBaixa,
    semRecorrencia: procedimentos.filter((p) => !p.recurrenceIntervalDays).length,
    totalPacientes: pacientes.length,
  };
}
