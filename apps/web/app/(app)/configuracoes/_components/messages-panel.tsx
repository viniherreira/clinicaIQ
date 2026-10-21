'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMessageSettings, type MessageSettings } from '../actions';
import type { AgendaTemplateView } from '@/lib/agenda-templates-sync';
import {
  AGENDA_BUTTON_MAX,
  AGENDA_BUTTON_OPTIONS,
  REMINDER_DAY_OPTIONS,
  previewAgendaText,
  type AgendaButton,
  type AgendaPayload,
} from '@/lib/agenda-options';

/**
 * A clínica escolhe o que sai e escreve o que sai.
 *
 * Cada mensagem tem um interruptor e um texto. O texto começa pré-preenchido com
 * o padrão do sistema — editar é mudar uma frase, não encarar uma caixa vazia.
 * Deixar em branco volta ao padrão, e isso está escrito na tela, porque senão a
 * pessoa apaga tudo achando que desligou e o paciente recebe o texto de fábrica.
 */

const VARIAVEIS_AGENDAMENTO = [
  { chave: '{nome}', o: 'primeiro nome do paciente' },
  { chave: '{clinica}', o: 'nome da clínica' },
  { chave: '{data}', o: 'quinta-feira, 28/05' },
  { chave: '{hora}', o: '14:30' },
  { chave: '{profissional}', o: 'quem vai atender' },
  { chave: '{procedimento}', o: 'some sozinho se não houver' },
];

const VARIAVEIS_ANIVERSARIO = VARIAVEIS_AGENDAMENTO.slice(0, 2);

function Variaveis({ lista }: { lista: typeof VARIAVEIS_AGENDAMENTO }) {
  return (
    <p className="mt-1.5 text-xs text-muted-foreground">
      Você pode usar:{' '}
      {lista.map((v, i) => (
        <span key={v.chave}>
          {i > 0 && ', '}
          <code className="rounded bg-surface-alt px-1 py-0.5">{v.chave}</code>{' '}
          <span>({v.o})</span>
        </span>
      ))}
    </p>
  );
}

/**
 * O que a Meta disse do texto, na API oficial. A pessoa precisa saber se o que
 * escreveu já está saindo, e o que sai enquanto não está.
 */
function SituacaoMeta({ view }: { view: AgendaTemplateView }) {
  const l = view.latest;
  const antes = view.hasApproved ? 'Enquanto isso, sai o texto aprovado antes.' : 'Enquanto isso, esta mensagem não sai.';
  const [tom, texto] = !l
    ? (['text-muted-foreground', 'Ainda não foi para a Meta. Salve para enviar.'] as const)
    : l.status === 'APPROVED'
      ? (['text-success', '✓ Aprovado pela Meta. É este texto que sai.'] as const)
      : l.status === 'PENDING'
        ? (['text-amber-700 dark:text-amber-300', `Em análise na Meta (costuma levar minutos). ${antes}`] as const)
        : l.status === 'REJECTED'
          ? (['text-destructive', `A Meta recusou este texto${l.rejectedReason ? ` (${l.rejectedReason})` : ''}. Mude o texto e salve de novo. ${antes}`] as const)
          : (['text-destructive', `A Meta pausou este texto. Mude o texto e salve de novo. ${antes}`] as const);
  return <p className={`mt-1.5 text-xs font-medium ${tom}`}>API oficial: {texto}</p>;
}

type Botoes = Record<AgendaPayload, { on: boolean; text: string }>;

/** Os botões salvos como a tela edita: todos os possíveis, ligados ou não. */
function paraEditar(salvos: AgendaButton[]): Botoes {
  return Object.fromEntries(
    AGENDA_BUTTON_OPTIONS.map((o) => {
      const b = salvos.find((x) => x.payload === o.payload);
      return [o.payload, { on: Boolean(b), text: b?.text ?? o.text }];
    }),
  ) as Botoes;
}

const ligados = (b: Botoes): AgendaButton[] =>
  AGENDA_BUTTON_OPTIONS.filter((o) => b[o.payload].on).map((o) => ({ payload: o.payload, text: b[o.payload].text }));

/** *negrito* do WhatsApp na prévia. */
function ComNegrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
        /^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : <span key={i}>{parte}</span>,
      )}
    </>
  );
}

/** Como a mensagem chega no WhatsApp do paciente, com um paciente de exemplo. */
function PreviaWhatsApp({ texto, botoes }: { texto: string; botoes: AgendaButton[] }) {
  return (
    <figure className="rounded-lg bg-board p-3">
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground">Como chega no WhatsApp (paciente de exemplo)</figcaption>
      <div className="overflow-hidden rounded-lg bg-surface text-sm shadow-[0_1px_2px_rgba(15,30,60,0.10)]">
        <p className="whitespace-pre-wrap break-words px-3 py-2">
          <ComNegrito texto={previewAgendaText(texto)} />
        </p>
        {botoes.length > 0 && (
          <ul aria-label="Botões da mensagem" className="divide-y divide-border border-t border-border">
            {botoes.map((b) => (
              <li key={b.payload} className="px-3 py-2 text-center text-sm font-medium text-primary">
                {b.text || '(sem nome)'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </figure>
  );
}

function EditorDeBotoes({
  id,
  botoes,
  mudar,
}: {
  id: string;
  botoes: Botoes;
  mudar: (payload: AgendaPayload, patch: Partial<{ on: boolean; text: string }>) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Botões da mensagem</legend>
      <p className="mt-1 text-xs text-muted-foreground">
        O paciente toca e a resposta cai sozinha na agenda. Até 3 botões; você pode mudar o nome de cada um.
      </p>
      <ul className="mt-2 space-y-2">
        {AGENDA_BUTTON_OPTIONS.map((o) => {
          const b = botoes[o.payload];
          return (
            <li key={o.payload} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex w-28 shrink-0 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={b.on}
                  onChange={(e) => mudar(o.payload, { on: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <span>{o.text}</span>
              </label>
              <label htmlFor={`${id}-btn-${o.payload}`} className="sr-only">
                Nome do botão {o.text}
              </label>
              <input
                id={`${id}-btn-${o.payload}`}
                type="text"
                value={b.text}
                maxLength={AGENDA_BUTTON_MAX}
                disabled={!b.on}
                onChange={(e) => mudar(o.payload, { text: e.target.value })}
                className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              />
              <span className="text-xs text-muted-foreground">{o.faz}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Mudou os botões? Ajuste também a frase do texto que fala deles (por exemplo, &quot;Toque em Confirmar ou Reagendar&quot;).
      </p>
    </fieldset>
  );
}

function DiasDoLembrete({ dias, mudar }: { dias: number[]; mudar: (dias: number[]) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quando mandar</legend>
      <p className="mt-1 text-xs text-muted-foreground">Marque um ou mais. Cada um sai uma vez, por volta das 9h.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REMINDER_DAY_OPTIONS.map((o) => {
          const marcado = dias.includes(o.days);
          return (
            <label
              key={o.days}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
                marcado ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-surface-alt'
              }`}
            >
              <input
                type="checkbox"
                checked={marcado}
                onChange={(e) => mudar(e.target.checked ? [...dias, o.days] : dias.filter((d) => d !== o.days))}
                className="sr-only"
              />
              <span aria-hidden="true">{marcado ? '✓' : '+'}</span>
              {o.label}
            </label>
          );
        })}
      </div>
      {dias.includes(0) && (
        <p className="mt-1.5 text-xs text-muted-foreground">No dia, só sai para as consultas a partir das 10h.</p>
      )}
    </fieldset>
  );
}

interface Campo {
  id: 'created' | 'reminder' | 'birthday';
  titulo: string;
  meta?: AgendaTemplateView;
  quando: string;
  ligado: boolean;
  texto: string;
  variaveis: typeof VARIAVEIS_AGENDAMENTO;
}

export function MessagesPanel({ settings }: { settings: MessageSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const oficial = settings.official;

  const [estado, setEstado] = useState({
    created: {
      on: settings.notifyOnCreate,
      texto: settings.createdMessage ?? settings.defaults.created,
    },
    reminder: {
      on: settings.notifyReminder,
      texto: settings.reminderMessage ?? settings.defaults.reminder,
    },
    birthday: {
      on: settings.notifyBirthday,
      texto: settings.birthdayMessage ?? settings.defaults.birthday,
    },
  });

  const [botoes, setBotoes] = useState({
    created: paraEditar(settings.createdButtons),
    reminder: paraEditar(settings.reminderButtons),
  });
  const [dias, setDias] = useState(settings.reminderDays);
  const mudarBotao = (aviso: 'created' | 'reminder') => (payload: AgendaPayload, patch: Partial<{ on: boolean; text: string }>) =>
    setBotoes((b) => ({ ...b, [aviso]: { ...b[aviso], [payload]: { ...b[aviso][payload], ...patch } } }));

  const campos: Campo[] = [
    {
      id: 'created',
      titulo: 'Ao marcar a consulta',
      quando: 'Sai na hora em que a recepção salva o agendamento.',
      ligado: estado.created.on,
      texto: estado.created.texto,
      variaveis: VARIAVEIS_AGENDAMENTO,
      meta: oficial?.created,
    },
    {
      id: 'reminder',
      titulo: 'Lembrete antes da consulta',
      quando:
        'Sai de manhã nos dias que você escolher. Quem marcou há menos de 12 horas não recebe o lembrete daquele dia: acabou de receber a mensagem acima.',
      ligado: estado.reminder.on,
      texto: estado.reminder.texto,
      variaveis: VARIAVEIS_AGENDAMENTO,
      meta: oficial?.reminder,
    },
    {
      id: 'birthday',
      titulo: 'Aniversário',
      quando: 'Uma vez por ano, no dia. Só sai pelo número da própria clínica.',
      ligado: estado.birthday.on,
      texto: estado.birthday.texto,
      variaveis: VARIAVEIS_ANIVERSARIO,
    },
  ];

  function salvar() {
    setErro(null);
    setSalvo(false);
    setAviso(null);
    startTransition(async () => {
      const r = await saveMessageSettings({
        notifyOnCreate: estado.created.on,
        notifyReminder: estado.reminder.on,
        notifyBirthday: estado.birthday.on,
        createdMessage: estado.created.texto,
        reminderMessage: estado.reminder.texto,
        birthdayMessage: estado.birthday.texto,
        reminderDays: dias,
        createdButtons: ligados(botoes.created),
        reminderButtons: ligados(botoes.reminder),
      });
      if (!r.ok) setErro(r.message ?? 'Não foi possível salvar.');
      else {
        setSalvo(true);
        setAviso(r.message ?? null);
        router.refresh();
      }
    });
  }

  function restaurar(id: Campo['id']) {
    const padrao = settings.defaults[id];
    setEstado((e) => ({ ...e, [id]: { ...e[id], texto: padrao } }));
  }

  return (
    <section
      aria-labelledby="msgs-heading"
      className="rounded-xl border border-border bg-surface shadow-card"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 id="msgs-heading" className="text-base font-semibold">
          Mensagens automáticas
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Escolha o que o paciente recebe e escreva com as suas palavras.
        </p>
      </div>

      {erro && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {erro}
        </p>
      )}

      <div className="divide-y divide-border">
        {campos.map((c) => (
          <div key={c.id} className="px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{c.titulo}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.quando}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.ligado}
                  onChange={(e) =>
                    setEstado((s) => ({ ...s, [c.id]: { ...s[c.id], on: e.target.checked } }))
                  }
                  className="h-4 w-4 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <span>{c.ligado ? 'Enviando' : 'Desligada'}</span>
              </label>
            </div>

            {c.ligado && (
              <div className={c.id === 'birthday' ? 'mt-3' : 'mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]'}>
              <div className="min-w-0">
                <label htmlFor={`msg-${c.id}`} className="sr-only">
                  Texto da mensagem: {c.titulo}
                </label>
                <textarea
                  id={`msg-${c.id}`}
                  rows={6}
                  value={c.texto}
                  onChange={(e) =>
                    setEstado((s) => ({ ...s, [c.id]: { ...s[c.id], texto: e.target.value } }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <Variaveis lista={c.variaveis} />
                  <button
                    type="button"
                    onClick={() => restaurar(c.id)}
                    className="shrink-0 text-xs underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Voltar ao texto padrão
                  </button>
                </div>
                {c.meta && <SituacaoMeta view={c.meta} />}
                {c.id !== 'birthday' && (
                  <>
                    {c.id === 'reminder' && <DiasDoLembrete dias={dias} mudar={setDias} />}
                    <EditorDeBotoes id={`msg-${c.id}`} botoes={botoes[c.id]} mudar={mudarBotao(c.id)} />
                  </>
                )}
              </div>
              {c.id !== 'birthday' && (
                <div className="lg:sticky lg:top-4 lg:self-start">
                  <PreviaWhatsApp texto={c.texto} botoes={ligados(botoes[c.id])} />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {oficial
                      ? 'Cada texto ou botão novo passa pela aprovação da Meta antes de sair.'
                      : 'Os botões só vão com a API oficial da Meta (conecte na página WhatsApp).'}
                  </p>
                </div>
              )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-5 py-4">
        <button type="button" onClick={salvar} disabled={pending} className="btn-primary btn-md">
          {pending ? 'Salvando…' : 'Salvar mensagens'}
        </button>
        <span aria-live="polite" className="text-sm text-success">
          {salvo && (aviso ?? '✓ Salvo')}
        </span>
      </div>
    </section>
  );
}
