/**
 * Roda o funil de retorno contra o banco real e imprime o resultado.
 *
 * Existe porque a tela exige sessão autenticada e a pergunta que importa é
 * anterior a ela: com os dados que a clínica tem hoje, esta fila mostra algo
 * útil ou mostra ruído? Sem responder isso, entregar a tela é chutar.
 *
 *   pnpm --filter @clinicaiq/web exec tsx scripts/conferir-funil.ts
 */
import { PrismaClient } from '@prisma/client';
import { ESTAGIO_LABEL, montarFunil, type EntradaPaciente } from '../lib/recall';

const TENANT = process.argv[2] ?? 'cmqts4z4u0000kv043m23w9ui';
const prisma = new PrismaClient();
const agora = new Date();

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const [pacientes, agendamentos, procedimentos, orcamentos, pagamentos] = await Promise.all([
  prisma.patient.findMany({
    where: { tenantId: TENANT, deletedAt: null, active: true },
    select: { id: true, name: true, phoneEncrypted: true, whatsappOptOut: true },
  }),
  prisma.appointment.findMany({
    where: { tenantId: TENANT },
    select: { patientId: true, procedureId: true, startTime: true, status: true },
  }),
  prisma.procedure.findMany({
    where: { tenantId: TENANT, deletedAt: null },
    select: { id: true, name: true, recurrenceIntervalDays: true, recurrenceGraceDays: true },
  }),
  prisma.quote.findMany({
    where: { tenantId: TENANT, status: 'ACCEPTED' },
    select: { patientId: true, total: true },
  }),
  prisma.payment.findMany({ where: { tenantId: TENANT }, select: { patientId: true, amount: true } }),
]);

const recorrentes = new Map(
  procedimentos
    .filter((p) => p.recurrenceIntervalDays)
    .map((p) => [
      p.id,
      { nome: p.name, intervalo: p.recurrenceIntervalDays!, tolerancia: p.recurrenceGraceDays ?? 120 },
    ]),
);

interface Acc {
  ultimaVisita: Date | null;
  futuro: boolean;
  visitas: number;
  faltas: number;
  ultimoPorProcedimento: Map<string, Date>;
}
const porPaciente = new Map<string, Acc>();
const acc = (id: string) => {
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
  if (ag.startTime >= agora) {
    if (ag.status !== 'CANCELLED') a.futuro = true;
    continue;
  }
  if (ag.status === 'MISSED') { a.faltas += 1; continue; }
  if (ag.status === 'CANCELLED') continue;
  if (ag.status !== 'ATTENDED') semBaixa += 1;
  a.visitas += 1;
  if (!a.ultimaVisita || ag.startTime > a.ultimaVisita) a.ultimaVisita = ag.startTime;
  if (ag.procedureId && recorrentes.has(ag.procedureId)) {
    const ant = a.ultimoPorProcedimento.get(ag.procedureId);
    if (!ant || ag.startTime > ant) a.ultimoPorProcedimento.set(ag.procedureId, ag.startTime);
  }
}

const aprovado = new Map<string, number>();
for (const q of orcamentos) {
  aprovado.set(q.patientId, (aprovado.get(q.patientId) ?? 0) + Math.round(Number(q.total) * 100));
}
const pago = new Map<string, number>();
for (const p of pagamentos) {
  pago.set(p.patientId, (pago.get(p.patientId) ?? 0) + Math.round(Number(p.amount) * 100));
}

const entradas: EntradaPaciente[] = pacientes.map((p) => {
  const a = porPaciente.get(p.id);
  let recorrencia: EntradaPaciente['recorrencia'] = null;
  let pior = -Infinity;
  for (const [procId, quando] of a?.ultimoPorProcedimento ?? []) {
    const r = recorrentes.get(procId)!;
    const atraso = (agora.getTime() - (quando.getTime() + r.intervalo * 86_400_000)) / 86_400_000;
    if (atraso > pior) {
      pior = atraso;
      recorrencia = { procedimento: r.nome, realizadoEm: quando, intervaloDias: r.intervalo, toleranciaDias: r.tolerancia };
    }
  }
  return {
    pacienteId: p.id,
    nome: p.name,
    ultimaVisita: a?.ultimaVisita ?? null,
    recorrencia,
    temAgendamentoFuturo: a?.futuro ?? false,
    naoQuerContato: p.whatsappOptOut,
    temTelefone: Boolean(p.phoneEncrypted),
    emAbertoCents: Math.max(0, (aprovado.get(p.id) ?? 0) - (pago.get(p.id) ?? 0)),
    totalPagoCents: pago.get(p.id) ?? 0,
    visitas: a?.visitas ?? 0,
    faltas: a?.faltas ?? 0,
  };
});

const { fila, semHistorico, porEstagio, emAbertoTotalCents } = montarFunil(entradas, agora);

console.log('pacientes ativos ............', pacientes.length);
console.log('atendimentos sem baixa ......', semBaixa);
console.log('a cobrar ....................', brl(emAbertoTotalCents));
console.log('');
console.log('--- por estágio ---');
for (const [e, n] of Object.entries(porEstagio)) {
  if (n > 0) console.log(String(ESTAGIO_LABEL[e as keyof typeof ESTAGIO_LABEL]).padEnd(16), n);
}
console.log('');
console.log('--- fila acionável:', fila.length, '| nunca agendou:', semHistorico.length, '---');
for (const p of fila.slice(0, 12)) {
  console.log(String(p.score).padStart(3), ESTAGIO_LABEL[p.estagio].padEnd(10), p.nome.slice(0, 28).padEnd(30), p.resumo);
}

await prisma.$disconnect();
