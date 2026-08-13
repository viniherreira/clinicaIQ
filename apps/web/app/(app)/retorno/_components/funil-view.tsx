'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, Info, Phone, Search } from 'lucide-react';
import type { FunilData } from '../actions';
import { ESTAGIO_LABEL, type Estagio, type Prioridade } from '@/lib/recall';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Cada estágio tem cor própria porque a recepcionista lê a coluna, não o texto. */
const TOM: Record<string, string> = {
  DEVENDO: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  ATRASADO: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  VENCIDO: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  A_VENCER: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  SUMIDO: 'bg-surface-alt text-muted-foreground',
};

const ORDEM_FUNIL: Estagio[] = ['DEVENDO', 'ATRASADO', 'VENCIDO', 'A_VENCER', 'SUMIDO'];

export function FunilView({ data }: { data: FunilData }) {
  const [estagio, setEstagio] = useState<Estagio | 'TODOS'>('TODOS');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const fila = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    // "Nunca agendou" é uma lista separada: só aparece quando pedida no filtro.
    const origem = estagio === 'SEM_HISTORICO' ? data.semHistorico : data.fila;
    return origem.filter(
      (p) =>
        (estagio === 'TODOS' || estagio === 'SEM_HISTORICO' || p.estagio === estagio) &&
        (!termo || p.nome.toLowerCase().includes(termo)),
    );
  }, [data.fila, data.semHistorico, estagio, busca]);

  const vazio = data.fila.length === 0 && estagio !== 'SEM_HISTORICO';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Quem chamar de volta</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          A fila é ordenada por quem tem mais chance de virar consulta agora. Cada linha explica o
          motivo — nada aqui é adivinhação, e nenhuma mensagem sai desta tela.
        </p>
      </header>

      {data.semBaixa > 0 && <AvisoBaixa quantos={data.semBaixa} />}

      {/* Funil */}
      <section aria-label="Resumo do funil" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Cartao
          rotulo="A cobrar"
          valor={brl(data.emAbertoTotalCents)}
          hint="orçamento aprovado em aberto"
          destaque
        />
        {ORDEM_FUNIL.map((e) => (
          <Cartao
            key={e}
            rotulo={ESTAGIO_LABEL[e]}
            valor={String(data.porEstagio[e] ?? 0)}
            hint="pacientes"
            ativo={estagio === e}
            onClick={() => setEstagio(estagio === e ? 'TODOS' : e)}
          />
        ))}
        {(data.porEstagio.SEM_HISTORICO ?? 0) > 0 && (
          <Cartao
            rotulo="Nunca agendou"
            valor={String(data.porEstagio.SEM_HISTORICO)}
            hint="cadastrados sem consulta"
            ativo={estagio === 'SEM_HISTORICO'}
            onClick={() => setEstagio(estagio === 'SEM_HISTORICO' ? 'TODOS' : 'SEM_HISTORICO')}
          />
        )}
        {(data.porEstagio.JA_AGENDADO ?? 0) > 0 && (
          <Cartao
            rotulo="Já agendado"
            valor={String(data.porEstagio.JA_AGENDADO)}
            hint="fora da fila, tudo certo"
          />
        )}
      </section>

      {estagio === 'SEM_HISTORICO' && (
        <p className="rounded-xl border border-border bg-surface-alt/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">Estes não sumiram.</strong> São pacientes
          do cadastro que nunca tiveram consulta marcada aqui — quase sempre vieram de uma
          importação, com a história antiga fora do sistema. É uma lista de primeira consulta, não
          de retorno, e por isso fica separada.
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente na fila"
            aria-label="Buscar paciente na fila"
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        {estagio !== 'TODOS' && (
          <button
            type="button"
            onClick={() => setEstagio('TODOS')}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Ver todos os estágios
          </button>
        )}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {fila.length} {fila.length === 1 ? 'paciente' : 'pacientes'}
        </p>
      </div>

      {vazio ? (
        <Vazio
          semRecorrencia={data.semRecorrencia}
          totalPacientes={data.totalPacientes}
          nuncaAgendaram={data.porEstagio.SEM_HISTORICO ?? 0}
          emDia={data.porEstagio.EM_DIA ?? 0}
          onVerNuncaAgendaram={() => setEstagio('SEM_HISTORICO')}
        />
      ) : (
        <ul className="space-y-2">
          {fila.map((p) => (
            <Linha
              key={p.pacienteId}
              p={p}
              aberto={aberto === p.pacienteId}
              onToggle={() => setAberto(aberto === p.pacienteId ? null : p.pacienteId)}
            />
          ))}
          {fila.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ninguém neste filtro.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  hint,
  destaque,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: string;
  hint: string;
  destaque?: boolean;
  ativo?: boolean;
  onClick?: () => void;
}) {
  const conteudo = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 font-semibold tracking-tight ${destaque ? 'text-xl' : 'text-2xl'}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </>
  );
  const base = 'rounded-xl border bg-surface p-4 text-left shadow-card transition-colors';

  if (!onClick) {
    return <div className={`${base} border-border`}>{conteudo}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`${base} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        ativo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      {conteudo}
    </button>
  );
}

function Linha({ p, aberto, onToggle }: { p: Prioridade; aberto: boolean; onToggle: () => void }) {
  const painelId = `motivo-${p.pacienteId}`;
  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        {/* A pontuação é comparativa, não probabilidade — por isso sem "%" */}
        <span
          aria-label={`Prioridade ${p.score} de 100`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-semibold tabular-nums text-primary"
        >
          {p.score}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <Link
              href={`/pacientes/${p.pacienteId}`}
              className="truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {p.nome}
            </Link>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TOM[p.estagio] ?? ''}`}>
              {ESTAGIO_LABEL[p.estagio]}
            </span>
            {p.emAbertoCents > 0 && (
              <span className="text-xs font-medium tabular-nums text-amber-700 dark:text-amber-300">
                {brl(p.emAbertoCents)} em aberto
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{p.resumo}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/agenda?paciente=${p.pacienteId}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            Agendar
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Por quê
            <ChevronDown
              className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {aberto && (
        <div id={painelId} className="border-t border-border bg-surface-alt/40 px-4 py-3">
          <ul className="space-y-1.5">
            {p.componentes.map((c) => (
              <li key={c.rotulo} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  <strong className="font-medium text-foreground">{c.rotulo}:</strong>{' '}
                  {c.explicacao}
                </span>
                <span
                  className={`shrink-0 tabular-nums font-medium ${
                    c.pontos < 0 ? 'text-destructive' : 'text-foreground'
                  }`}
                >
                  {c.pontos > 0 ? '+' : ''}
                  {c.pontos}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-right text-sm font-semibold tabular-nums">
            Prioridade {p.score}
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * O aviso mais importante da tela.
 *
 * Enquanto a clínica não marcar quem compareceu, este funil trabalha com
 * inferência. Esconder isso seria vender precisão que não existe.
 */
function AvisoBaixa({ quantos }: { quantos: number }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          {quantos} {quantos === 1 ? 'atendimento passado está' : 'atendimentos passados estão'} sem
          baixa
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
          A data já passou e ninguém marcou se o paciente compareceu ou faltou. Enquanto isso, esta
          tela assume que quem tinha horário marcado veio — o que é quase sempre verdade, mas é
          estimativa. Dar baixa na agenda deixa o cálculo exato e ainda corrige o número de faltas.
        </p>
        <Link
          href="/agenda"
          className="mt-2 inline-flex text-sm font-medium text-amber-900 underline dark:text-amber-100"
        >
          Abrir a agenda para dar baixa
        </Link>
      </div>
    </div>
  );
}

/**
 * O estado vazio faz mais trabalho do que parece.
 *
 * Numa clínica que acabou de entrar, a fila de retorno *vai* estar vazia: a
 * recorrência mais curta é mensal e a maioria é semestral, então nada venceu
 * ainda. Uma tela dizendo só "nada aqui" seria lida como "não funciona" e nunca
 * mais seria aberta.
 *
 * Então ela explica por que está vazia e aponta para o que é acionável hoje.
 */
function Vazio({
  semRecorrencia,
  totalPacientes,
  nuncaAgendaram,
  emDia,
  onVerNuncaAgendaram,
}: {
  semRecorrencia: number;
  totalPacientes: number;
  nuncaAgendaram: number;
  emDia: number;
  onVerNuncaAgendaram: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">
        <Info className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>

      <h2 className="mt-4 font-semibold">
        {totalPacientes === 0 ? 'Nenhum paciente cadastrado' : 'Nenhum retorno vencido hoje'}
      </h2>

      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        {totalPacientes === 0 ? (
          'Cadastre pacientes para o funil começar a trabalhar.'
        ) : emDia > 0 ? (
          <>
            {emDia} {emDia === 1 ? 'paciente está' : 'pacientes estão'} em dia. Retorno leva tempo
            para amadurecer: uma limpeza feita hoje só vence daqui a seis meses, e uma manutenção de
            aparelho daqui a um mês.
          </>
        ) : (
          'Ninguém venceu, ninguém está devendo e ninguém sumiu.'
        )}
      </p>

      {nuncaAgendaram > 0 && (
        <div className="mx-auto mt-6 max-w-lg rounded-lg border border-border bg-surface-alt/50 p-4 text-left">
          <p className="text-sm leading-relaxed">
            <strong className="font-medium">
              Mas {nuncaAgendaram} pacientes do cadastro nunca agendaram aqui.
            </strong>{' '}
            É a maior oportunidade parada na sua base hoje — gente que já confiou o telefone à
            clínica e nunca marcou nada.
          </p>
          <button type="button" onClick={onVerNuncaAgendaram} className="btn-primary btn-md mt-3">
            Ver esses {nuncaAgendaram} pacientes
          </button>
        </div>
      )}

      {semRecorrencia > 0 && (
        <p className="mx-auto mt-5 max-w-lg text-xs leading-relaxed text-muted-foreground">
          {semRecorrencia}{' '}
          {semRecorrencia === 1 ? 'procedimento está' : 'procedimentos estão'} sem periodicidade
          configurada. É ela que faz o paciente aparecer nesta fila quando vencer.{' '}
          <Link href="/configuracoes#atendimento" className="underline">
            Configurar agora
          </Link>
        </p>
      )}
    </div>
  );
}
