import { describe, expect, it } from 'vitest';
import {
  ANTECEDENCIA_DIAS,
  avaliarPaciente,
  montarFunil,
  vencimentoDe,
  type EntradaPaciente,
} from './recall';

const HOJE = new Date('2026-08-11T12:00:00Z');
const DIA = 86_400_000;
const atras = (dias: number) => new Date(HOJE.getTime() - dias * DIA);

const base = (over: Partial<EntradaPaciente> = {}): EntradaPaciente => ({
  pacienteId: 'p1',
  nome: 'Maria',
  ultimaVisita: atras(200),
  recorrencia: null,
  temAgendamentoFuturo: false,
  naoQuerContato: false,
  temTelefone: true,
  emAbertoCents: 0,
  totalPagoCents: 0,
  visitas: 1,
  faltas: 0,
  ...over,
});

/** Limpeza semestral feita há N dias. */
const limpezaHa = (dias: number) => ({
  procedimento: 'Profilaxia',
  realizadoEm: atras(dias),
  intervaloDias: 180,
  toleranciaDias: 120,
});

describe('estágios', () => {
  it('quem já tem consulta marcada sai do funil', () => {
    // A regra que evita o erro mais irritante: cobrar retorno de quem já marcou.
    const r = avaliarPaciente(
      base({ temAgendamentoFuturo: true, recorrencia: limpezaHa(400), emAbertoCents: 90_000 }),
      HOJE,
    );
    expect(r.estagio).toBe('JA_AGENDADO');
    expect(r.score).toBe(0);
    expect(r.componentes).toEqual([]);
  });

  it('quem pediu para sair nunca entra na fila, nem devendo', () => {
    const r = avaliarPaciente(base({ naoQuerContato: true, emAbertoCents: 500_000 }), HOJE);
    expect(r.estagio).toBe('NAO_CONTATAR');
    expect(r.score).toBe(0);
  });

  it('valor em aberto vem antes de retorno vencido', () => {
    // O paciente já disse sim e o procedimento já foi aprovado: falta cobrar.
    const r = avaliarPaciente(base({ emAbertoCents: 40_000, recorrencia: limpezaHa(400) }), HOJE);
    expect(r.estagio).toBe('DEVENDO');
  });

  it('separa vencido de atrasado pela tolerância do procedimento', () => {
    // Limpeza de 180 dias, tolerância de 120: vence no 180, atrasa no 301.
    expect(avaliarPaciente(base({ recorrencia: limpezaHa(200) }), HOJE).estagio).toBe('VENCIDO');
    expect(avaliarPaciente(base({ recorrencia: limpezaHa(299) }), HOJE).estagio).toBe('VENCIDO');
    expect(avaliarPaciente(base({ recorrencia: limpezaHa(301) }), HOJE).estagio).toBe('ATRASADO');
  });

  it('avisa antes de vencer, com a antecedência configurada', () => {
    const quaseVencendo = 180 - ANTECEDENCIA_DIAS + 1;
    expect(avaliarPaciente(base({ recorrencia: limpezaHa(quaseVencendo) }), HOJE).estagio).toBe(
      'A_VENCER',
    );
    // Longe demais ainda não interessa.
    expect(avaliarPaciente(base({ recorrencia: limpezaHa(10) }), HOJE).estagio).toBe('EM_DIA');
  });

  it('a periodicidade é do procedimento, não fixa', () => {
    // Os mesmos 60 dias desde o procedimento significam coisas opostas.
    // Manutenção de aparelho é mensal: 60 dias = 30 de atraso, o dobro da
    // tolerância de 15.
    const orto = {
      procedimento: 'Manutenção de aparelho',
      realizadoEm: atras(60),
      intervaloDias: 30,
      toleranciaDias: 15,
    };
    expect(avaliarPaciente(base({ recorrencia: orto }), HOJE).estagio).toBe('ATRASADO');
    // Numa limpeza semestral, 60 dias ainda nem chegou perto do vencimento.
    expect(avaliarPaciente(base({ recorrencia: limpezaHa(60) }), HOJE).estagio).toBe('EM_DIA');
  });

  it('sem procedimento recorrente, quem sumiu há mais de um ano é SUMIDO', () => {
    expect(avaliarPaciente(base({ ultimaVisita: atras(400) }), HOJE).estagio).toBe('SUMIDO');
    expect(avaliarPaciente(base({ ultimaVisita: atras(100) }), HOJE).estagio).toBe('EM_DIA');
  });

  it('quem nunca agendou não é "sumido" — é outra lista', () => {
    // A clínica que migrou de sistema tem centenas assim. Misturar essa gente
    // com quem parou de vir enterra os casos reais debaixo de ruído.
    expect(avaliarPaciente(base({ ultimaVisita: null }), HOJE).estagio).toBe('SEM_HISTORICO');
  });
});

describe('pontuação', () => {
  it('atraso maior pontua mais', () => {
    const pouco = avaliarPaciente(base({ recorrencia: limpezaHa(200) }), HOJE);
    const muito = avaliarPaciente(base({ recorrencia: limpezaHa(400) }), HOJE);
    expect(muito.score).toBeGreaterThan(pouco.score);
  });

  it('o atraso é relativo ao intervalo do procedimento', () => {
    // 60 dias de atraso: numa manutenção mensal é o dobro do intervalo; numa
    // limpeza semestral é um terço. A pontuação precisa refletir isso.
    const orto = avaliarPaciente(
      base({
        recorrencia: {
          procedimento: 'Aparelho',
          realizadoEm: atras(90),
          intervaloDias: 30,
          toleranciaDias: 15,
        },
      }),
      HOJE,
    );
    const limpeza = avaliarPaciente(base({ recorrencia: limpezaHa(240) }), HOJE);
    expect(orto.score).toBeGreaterThan(limpeza.score);
  });

  it('quem deve pontua mais que quem não deve, tudo mais igual', () => {
    const devendo = avaliarPaciente(base({ emAbertoCents: 150_000 }), HOJE);
    const quite = avaliarPaciente(base({ emAbertoCents: 0 }), HOJE);
    expect(devendo.score).toBeGreaterThan(quite.score);
  });

  it('falta desconta, e o desconto tem teto', () => {
    const semFalta = avaliarPaciente(base({ recorrencia: limpezaHa(300) }), HOJE);
    const umaFalta = avaliarPaciente(base({ recorrencia: limpezaHa(300), faltas: 1 }), HOJE);
    const dezFaltas = avaliarPaciente(base({ recorrencia: limpezaHa(300), faltas: 10 }), HOJE);
    expect(umaFalta.score).toBeLessThan(semFalta.score);
    expect(dezFaltas.score).toBeLessThan(umaFalta.score);
    // Sem teto, um faltante crônico ficaria com score negativo e sumiria da
    // lista — mas ele ainda deve dinheiro e ainda vale uma ligação.
    expect(dezFaltas.score).toBeGreaterThanOrEqual(0);
  });

  it('sem telefone pontua menos: não dá para chamar quem não tem contato', () => {
    const com = avaliarPaciente(base({ recorrencia: limpezaHa(300) }), HOJE);
    const sem = avaliarPaciente(base({ recorrencia: limpezaHa(300), temTelefone: false }), HOJE);
    expect(sem.score).toBeLessThan(com.score);
  });

  it('a pontuação nunca sai de 0 a 100', () => {
    const maximo = avaliarPaciente(
      base({
        recorrencia: limpezaHa(2000),
        emAbertoCents: 9_999_999,
        totalPagoCents: 9_999_999,
        visitas: 100,
      }),
      HOJE,
    );
    expect(maximo.score).toBeLessThanOrEqual(100);

    const minimo = avaliarPaciente(
      base({ ultimaVisita: null, temTelefone: false, faltas: 99, visitas: 0 }),
      HOJE,
    );
    expect(minimo.score).toBeGreaterThanOrEqual(0);
  });
});

describe('explicação', () => {
  it('todo componente traz uma frase legível', () => {
    const r = avaliarPaciente(
      base({ recorrencia: limpezaHa(225), emAbertoCents: 40_000, totalPagoCents: 120_000, visitas: 4 }),
      HOJE,
    );
    expect(r.componentes.length).toBeGreaterThan(3);
    for (const c of r.componentes) {
      expect(c.rotulo.length).toBeGreaterThan(2);
      expect(c.explicacao.length).toBeGreaterThan(10);
      expect(c.explicacao).toMatch(/[a-záéíóúâêôãõç]/i);
    }
  });

  it('a explicação diz o número que a recepcionista vai repetir no telefone', () => {
    const r = avaliarPaciente(base({ recorrencia: limpezaHa(225), emAbertoCents: 40_000 }), HOJE);
    const texto = r.componentes.map((c) => c.explicacao).join(' ');
    expect(texto).toContain('Profilaxia');
    expect(texto).toContain('45 dias'); // 225 - 180
    expect(texto).toContain('R$');
  });

  it('a soma dos componentes é a pontuação', () => {
    const r = avaliarPaciente(
      base({ recorrencia: limpezaHa(250), emAbertoCents: 80_000, visitas: 3, faltas: 1 }),
      HOJE,
    );
    const soma = r.componentes.reduce((s, c) => s + c.pontos, 0);
    expect(r.score).toBe(Math.min(100, Math.max(0, soma)));
  });
});

describe('montarFunil', () => {
  const gente: EntradaPaciente[] = [
    base({ pacienteId: 'a', nome: 'Devedora', emAbertoCents: 180_000 }),
    base({ pacienteId: 'b', nome: 'Atrasada', recorrencia: limpezaHa(400) }),
    base({ pacienteId: 'c', nome: 'Em dia', recorrencia: limpezaHa(10), ultimaVisita: atras(10) }),
    base({ pacienteId: 'd', nome: 'Já marcou', temAgendamentoFuturo: true, recorrencia: limpezaHa(400) }),
    base({ pacienteId: 'e', nome: 'Saiu', naoQuerContato: true, recorrencia: limpezaHa(400) }),
  ];

  it('a fila traz só quem dá para acionar', () => {
    const { fila } = montarFunil(gente, HOJE);
    const nomes = fila.map((p) => p.nome);
    expect(nomes).toContain('Devedora');
    expect(nomes).toContain('Atrasada');
    expect(nomes).not.toContain('Em dia');
    expect(nomes).not.toContain('Já marcou');
    expect(nomes).not.toContain('Saiu');
  });

  it('ordena do maior para o menor', () => {
    const { fila } = montarFunil(gente, HOJE);
    for (let i = 1; i < fila.length; i++) {
      expect(fila[i - 1].score).toBeGreaterThanOrEqual(fila[i].score);
    }
  });

  it('conta todo mundo por estágio, inclusive quem está fora da fila', () => {
    const { porEstagio } = montarFunil(gente, HOJE);
    expect(porEstagio.JA_AGENDADO).toBe(1);
    expect(porEstagio.NAO_CONTATAR).toBe(1);
    expect(porEstagio.EM_DIA).toBe(1);
    const total = Object.values(porEstagio).reduce((s, n) => s + n, 0);
    expect(total).toBe(gente.length);
  });

  it('soma o dinheiro em aberto só de quem está na fila', () => {
    const { emAbertoTotalCents } = montarFunil(
      [
        base({ pacienteId: 'a', emAbertoCents: 100_00 }),
        // Este deve, mas já marcou: o dinheiro dele não é "a cobrar hoje".
        base({ pacienteId: 'b', emAbertoCents: 900_00, temAgendamentoFuturo: true }),
      ],
      HOJE,
    );
    expect(emAbertoTotalCents).toBe(100_00);
  });

  it('quem nunca agendou fica fora da fila principal, mas continua contado', () => {
    // O caso da clínica que migrou: 419 de 483 pacientes sem agendamento.
    const muitos = Array.from({ length: 50 }, (_, i) =>
      base({ pacienteId: `sem-${i}`, ultimaVisita: null }),
    );
    const r = montarFunil([...muitos, base({ pacienteId: 'x', recorrencia: limpezaHa(400) })], HOJE);
    expect(r.fila).toHaveLength(1);
    expect(r.fila[0].pacienteId).toBe('x');
    expect(r.semHistorico).toHaveLength(50);
    expect(r.porEstagio.SEM_HISTORICO).toBe(50);
  });

  it('lista vazia não quebra', () => {
    const r = montarFunil([], HOJE);
    expect(r.fila).toEqual([]);
    expect(r.semHistorico).toEqual([]);
    expect(r.emAbertoTotalCents).toBe(0);
  });
});

describe('vencimentoDe', () => {
  it('soma o intervalo à data do procedimento', () => {
    const v = vencimentoDe({
      procedimento: 'Profilaxia',
      realizadoEm: new Date('2026-01-01T12:00:00Z'),
      intervaloDias: 180,
      toleranciaDias: 120,
    });
    expect(v.toISOString().slice(0, 10)).toBe('2026-06-30');
  });
});
