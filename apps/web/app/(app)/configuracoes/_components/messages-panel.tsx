'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMessageSettings, type MessageSettings } from '../actions';

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
          <span className="opacity-80">({v.o})</span>
        </span>
      ))}
    </p>
  );
}

interface Campo {
  id: 'created' | 'reminder' | 'birthday';
  titulo: string;
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

  const campos: Campo[] = [
    {
      id: 'created',
      titulo: 'Ao marcar a consulta',
      quando: 'Sai na hora em que a recepção salva o agendamento.',
      ligado: estado.created.on,
      texto: estado.created.texto,
      variaveis: VARIAVEIS_AGENDAMENTO,
    },
    {
      id: 'reminder',
      titulo: 'Lembrete do dia anterior',
      quando:
        'Sai uma vez por dia, de manhã, para as consultas do dia seguinte. Quem marcou em cima da hora recebe só a mensagem acima.',
      ligado: estado.reminder.on,
      texto: estado.reminder.texto,
      variaveis: VARIAVEIS_AGENDAMENTO,
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
    startTransition(async () => {
      const r = await saveMessageSettings({
        notifyOnCreate: estado.created.on,
        notifyReminder: estado.reminder.on,
        notifyBirthday: estado.birthday.on,
        createdMessage: estado.created.texto,
        reminderMessage: estado.reminder.texto,
        birthdayMessage: estado.birthday.texto,
      });
      if (!r.ok) setErro(r.message ?? 'Não foi possível salvar.');
      else {
        setSalvo(true);
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
              <div className="mt-3">
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
                {c.id !== 'birthday' && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    O convite para responder <strong>1</strong> ou <strong>2</strong> é o que faz a
                    confirmação do paciente cair na agenda. Se tirar do texto, ninguém confirma.
                  </p>
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
          {salvo && '✓ Salvo'}
        </span>
      </div>
    </section>
  );
}
