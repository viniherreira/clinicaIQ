/**
 * Quem a clínica deveria chamar de volta, e por quê.
 *
 * Módulo puro — sem Prisma, sem Clerk, sem data implícita: o "hoje" entra por
 * parâmetro. É o que permite testar "paciente 45 dias atrasado" sem esperar 45
 * dias, e é por isso que a regra mora aqui e não dentro de uma Server Action.
 *
 * Fica em `apps/web/lib` junto de `permissions` e `subscription`, que seguem a
 * mesma ideia. Um pacote próprio só se justificaria se outro app consumisse
 * isto, e hoje nenhum consome.
 *
 * ## O que a pontuação NÃO é
 *
 * Não é aprendizado de máquina e não deve virar. Uma recepcionista precisa ler
 * na tela por que a Maria está no topo — "a limpeza venceu há 45 dias e ela deve
 * R$ 400" — e discordar quando o sistema errar. Modelo que não explica vira
 * modelo que ninguém usa.
 */

export type Estagio =
  /** Tem consulta marcada. Fora do funil: cobrar quem já agendou irrita. */
  | 'JA_AGENDADO'
  /** Pediu para não receber contato. Fora do funil, sempre. */
  | 'NAO_CONTATAR'
  /** Tem valor em aberto. O dinheiro já foi prometido — é o mais fácil de virar caixa. */
  | 'DEVENDO'
  /** Passou do vencimento e da tolerância. */
  | 'ATRASADO'
  /** Passou do vencimento, ainda dentro da tolerância. */
  | 'VENCIDO'
  /** Vence nos próximos dias. */
  | 'A_VENCER'
  /** Veio antes e parou de vir. */
  | 'SUMIDO'
  /**
   * Está no cadastro e nunca agendou nada aqui.
   *
   * Separado de SUMIDO de propósito. Numa clínica que migrou de sistema, esta é
   * a maioria da base — 419 dos 483 pacientes, na primeira que usou isto. Jogar
   * essa gente na mesma fila enterraria os casos reais debaixo de ruído, e a
   * tela seria abandonada na primeira semana.
   *
   * Continua sendo oportunidade, mas de outro tipo: não é "voltar", é "nunca
   * veio ainda". Vive num filtro próprio.
   */
  | 'SEM_HISTORICO'
  /** Nada a fazer agora. */
  | 'EM_DIA';

export const ESTAGIO_LABEL: Record<Estagio, string> = {
  JA_AGENDADO: 'Já agendado',
  NAO_CONTATAR: 'Não contatar',
  DEVENDO: 'Devendo',
  ATRASADO: 'Atrasado',
  VENCIDO: 'Vencido',
  A_VENCER: 'A vencer',
  SUMIDO: 'Sumido',
  SEM_HISTORICO: 'Nunca agendou',
  EM_DIA: 'Em dia',
};

/** Os estágios que valem uma ligação, na ordem em que a clínica deve atacar. */
export const ESTAGIOS_ACIONAVEIS: Estagio[] = ['DEVENDO', 'ATRASADO', 'VENCIDO', 'A_VENCER', 'SUMIDO'];

/** Dias antes do vencimento em que o paciente já entra no radar. */
export const ANTECEDENCIA_DIAS = 30;
/** Sem procedimento recorrente, é este o tempo que define "sumiu". */
export const SUMIDO_DIAS = 365;

export interface EntradaPaciente {
  pacienteId: string;
  nome: string;
  /** Última vez que esteve na clínica. Nulo quando nunca veio. */
  ultimaVisita: Date | null;
  /** O procedimento recorrente mais atrasado deste paciente. */
  recorrencia: {
    procedimento: string;
    realizadoEm: Date;
    intervaloDias: number;
    toleranciaDias: number;
  } | null;
  /** Tem consulta marcada para o futuro. */
  temAgendamentoFuturo: boolean;
  /** Respondeu SAIR ou nunca autorizou contato. */
  naoQuerContato: boolean;
  temTelefone: boolean;
  /** Aprovado em orçamento e ainda não pago, em centavos. */
  emAbertoCents: number;
  /** Quanto já pagou à clínica, em centavos. */
  totalPagoCents: number;
  /** Quantas vezes compareceu. */
  visitas: number;
  /** Quantas vezes faltou sem avisar. */
  faltas: number;
}

export interface Componente {
  rotulo: string;
  pontos: number;
  /** Uma frase em português, para a recepcionista ler na tela. */
  explicacao: string;
}

export interface Prioridade {
  pacienteId: string;
  nome: string;
  estagio: Estagio;
  /** 0 a 100. Só compara dentro da mesma lista; não é probabilidade. */
  score: number;
  /** Dias além do vencimento. Negativo = ainda não venceu. Nulo = sem recorrência. */
  diasDeAtraso: number | null;
  emAbertoCents: number;
  componentes: Componente[];
  /** A frase que resume o caso, para a linha da lista. */
  resumo: string;
}

const dia = 86_400_000;
const diasEntre = (de: Date, ate: Date) => Math.floor((ate.getTime() - de.getTime()) / dia);
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Quando o retorno vence, a partir do último procedimento. */
export function vencimentoDe(r: NonNullable<EntradaPaciente['recorrencia']>): Date {
  return new Date(r.realizadoEm.getTime() + r.intervaloDias * dia);
}

function estagioDe(p: EntradaPaciente, hoje: Date, atraso: number | null): Estagio {
  // Duas saídas antes de qualquer conta. Ninguém deveria aparecer numa lista de
  // "chamar de volta" tendo consulta marcada, nem depois de pedir para sair.
  if (p.temAgendamentoFuturo) return 'JA_AGENDADO';
  if (p.naoQuerContato) return 'NAO_CONTATAR';

  // Dinheiro prometido vem antes de retorno vencido: o paciente já disse sim, o
  // procedimento já foi aprovado, e falta só a clínica cobrar.
  if (p.emAbertoCents > 0) return 'DEVENDO';

  if (atraso !== null && p.recorrencia) {
    if (atraso > p.recorrencia.toleranciaDias) return 'ATRASADO';
    if (atraso > 0) return 'VENCIDO';
    if (atraso > -ANTECEDENCIA_DIAS) return 'A_VENCER';
    return 'EM_DIA';
  }

  // Sem procedimento recorrente conhecido, resta o tempo desde a última vinda.
  // Quem nunca veio não "sumiu" — a clínica não perdeu essa pessoa, o sistema é
  // que não tem a história dela.
  if (!p.ultimaVisita) return 'SEM_HISTORICO';
  return diasEntre(p.ultimaVisita, hoje) >= SUMIDO_DIAS ? 'SUMIDO' : 'EM_DIA';
}

/**
 * Os pesos, num lugar só.
 *
 * Somam 100 no melhor caso possível. Estão aqui em cima porque a primeira coisa
 * que uma clínica vai querer é mexer neles — e mexer num objeto é mais seguro do
 * que caçar números espalhados por cinco funções.
 */
export const PESOS = {
  atraso: 40,
  dinheiroEmAberto: 25,
  valorHistorico: 15,
  fidelidade: 12,
  contatavel: 8,
  /** Desconto por falta registrada, até o limite. */
  penalidadeFalta: 6,
  maxPenalidadeFaltas: 18,
} as const;

function componentes(p: EntradaPaciente, hoje: Date, atraso: number | null): Componente[] {
  const out: Componente[] = [];

  // ── Atraso ──────────────────────────────────────────────────────────────
  if (atraso !== null && p.recorrencia) {
    const { procedimento, intervaloDias } = p.recorrencia;
    // Relativo ao intervalo: 30 dias de atraso numa manutenção mensal é muito,
    // e numa limpeza semestral é pouco.
    const proporcao = limitar(atraso / intervaloDias, 0, 1.5) / 1.5;
    out.push({
      rotulo: 'Retorno vencido',
      pontos: Math.round(PESOS.atraso * proporcao),
      explicacao:
        atraso > 0
          ? `${procedimento} venceu há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}.`
          : `${procedimento} vence em ${Math.abs(atraso)} ${Math.abs(atraso) === 1 ? 'dia' : 'dias'}.`,
    });
  } else if (p.ultimaVisita) {
    const parado = diasEntre(p.ultimaVisita, hoje);
    out.push({
      rotulo: 'Tempo sem vir',
      pontos: Math.round(PESOS.atraso * limitar(parado / (SUMIDO_DIAS * 1.5), 0, 1)),
      explicacao: `Última vez na clínica há ${parado} dias.`,
    });
  } else {
    out.push({
      rotulo: 'Nunca veio',
      pontos: Math.round(PESOS.atraso * 0.3),
      explicacao: 'Está no cadastro mas nunca compareceu.',
    });
  }

  // ── Dinheiro na mesa ────────────────────────────────────────────────────
  if (p.emAbertoCents > 0) {
    // Satura em R$ 2.000: acima disso a urgência não cresce mais na prática.
    const proporcao = limitar(p.emAbertoCents / 200_000, 0, 1);
    out.push({
      rotulo: 'Valor em aberto',
      pontos: Math.round(PESOS.dinheiroEmAberto * proporcao),
      explicacao: `Aprovou orçamento e ainda deve ${brl(p.emAbertoCents)}.`,
    });
  }

  // ── Quanto vale este paciente ───────────────────────────────────────────
  if (p.totalPagoCents > 0) {
    const proporcao = limitar(p.totalPagoCents / 500_000, 0, 1);
    out.push({
      rotulo: 'Histórico de valor',
      pontos: Math.round(PESOS.valorHistorico * proporcao),
      explicacao: `Já pagou ${brl(p.totalPagoCents)} à clínica.`,
    });
  }

  // ── Fidelidade ──────────────────────────────────────────────────────────
  if (p.visitas > 0) {
    const proporcao = limitar(p.visitas / 8, 0, 1);
    out.push({
      rotulo: 'Frequência',
      pontos: Math.round(PESOS.fidelidade * proporcao),
      explicacao: `Veio ${p.visitas} ${p.visitas === 1 ? 'vez' : 'vezes'}.`,
    });
  }

  // ── Dá para falar com ela? ──────────────────────────────────────────────
  out.push({
    rotulo: 'Contato',
    pontos: p.temTelefone ? PESOS.contatavel : 0,
    explicacao: p.temTelefone
      ? 'Tem telefone no cadastro.'
      : 'Sem telefone no cadastro — não dá para chamar.',
  });

  // ── Penalidade ──────────────────────────────────────────────────────────
  if (p.faltas > 0) {
    const desconto = Math.min(p.faltas * PESOS.penalidadeFalta, PESOS.maxPenalidadeFaltas);
    out.push({
      rotulo: 'Faltas',
      pontos: -desconto,
      explicacao: `Faltou ${p.faltas} ${p.faltas === 1 ? 'vez' : 'vezes'} sem avisar.`,
    });
  }

  return out;
}

function resumoDe(estagio: Estagio, p: EntradaPaciente, atraso: number | null): string {
  switch (estagio) {
    case 'JA_AGENDADO':
      return 'Já tem consulta marcada.';
    case 'NAO_CONTATAR':
      return 'Pediu para não receber contato.';
    case 'DEVENDO':
      return `Deve ${brl(p.emAbertoCents)} de orçamento aprovado.`;
    case 'ATRASADO':
    case 'VENCIDO':
      return `${p.recorrencia?.procedimento} venceu há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}.`;
    case 'A_VENCER':
      return `${p.recorrencia?.procedimento} vence em ${Math.abs(atraso ?? 0)} dias.`;
    case 'SUMIDO':
      return p.ultimaVisita
        ? `Veio pela última vez há ${diasEntre(p.ultimaVisita, new Date())} dias.`
        : 'Sem histórico de visita.';
    case 'SEM_HISTORICO':
      return 'Está no cadastro, mas nunca agendou aqui.';
    case 'EM_DIA':
      return 'Nada pendente.';
  }
}

/**
 * Classifica e pontua um paciente.
 *
 * `hoje` entra por parâmetro para o resultado ser reproduzível: a mesma entrada
 * dá a mesma saída amanhã, e o teste não depende do relógio.
 */
export function avaliarPaciente(p: EntradaPaciente, hoje: Date): Prioridade {
  const atraso = p.recorrencia ? diasEntre(vencimentoDe(p.recorrencia), hoje) : null;
  const estagio = estagioDe(p, hoje, atraso);

  // Fora do funil não recebe pontuação nenhuma. Um número ali sugeriria uma
  // fila onde não existe fila.
  if (estagio === 'JA_AGENDADO' || estagio === 'NAO_CONTATAR') {
    return {
      pacienteId: p.pacienteId,
      nome: p.nome,
      estagio,
      score: 0,
      diasDeAtraso: atraso,
      emAbertoCents: p.emAbertoCents,
      componentes: [],
      resumo: resumoDe(estagio, p, atraso),
    };
  }

  const comps = componentes(p, hoje, atraso);
  const score = limitar(Math.round(comps.reduce((s, c) => s + c.pontos, 0)), 0, 100);

  return {
    pacienteId: p.pacienteId,
    nome: p.nome,
    estagio,
    score,
    diasDeAtraso: atraso,
    emAbertoCents: p.emAbertoCents,
    componentes: comps,
    resumo: resumoDe(estagio, p, atraso),
  };
}

/** A fila, do mais vale-a-pena para o menos. Só quem é acionável. */
export function montarFunil(
  pacientes: EntradaPaciente[],
  hoje: Date,
): {
  fila: Prioridade[];
  /** Quem nunca agendou. Fora da fila principal, disponível por filtro. */
  semHistorico: Prioridade[];
  porEstagio: Record<Estagio, number>;
  emAbertoTotalCents: number;
} {
  const todos = pacientes.map((p) => avaliarPaciente(p, hoje));

  const porEstagio = Object.fromEntries(
    Object.keys(ESTAGIO_LABEL).map((e) => [e, 0]),
  ) as Record<Estagio, number>;
  for (const p of todos) porEstagio[p.estagio] += 1;

  const porPrioridade = (a: Prioridade, b: Prioridade) =>
    b.score - a.score || b.emAbertoCents - a.emAbertoCents;

  const fila = todos.filter((p) => ESTAGIOS_ACIONAVEIS.includes(p.estagio)).sort(porPrioridade);

  return {
    fila,
    semHistorico: todos.filter((p) => p.estagio === 'SEM_HISTORICO').sort(porPrioridade),
    porEstagio,
    emAbertoTotalCents: fila.reduce((s, p) => s + p.emAbertoCents, 0),
  };
}
