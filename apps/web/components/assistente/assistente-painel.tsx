'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, X, Plus, Send } from 'lucide-react';
import { bolhas, type Bolha } from './mensagens';

/** O mesmo separador de assistente/turno.ts (aquele arquivo não pode vir para o client). */
const SEPARADOR_FIM = '\u0000';
const SUGESTOES = [
  'Quantos agendamentos temos amanhã?',
  'Me passe os dados dos últimos 5 pacientes atendidos.',
  'Quais pacientes estão com pagamento pendente?',
  'Qual foi nosso faturamento no mês passado?',
];

export function AssistentePainel() {
  const [aberto, setAberto] = useState(false);
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [lista, setLista] = useState<Bolha[]>([]);
  const [recentes, setRecentes] = useState<{ id: string; titulo: string }[]>([]);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => fimRef.current?.scrollIntoView({ block: 'end' }), [lista]);
  useEffect(() => {
    if (!aberto) return;
    fetch('/api/assistente/conversas')
      .then((r) => (r.ok ? r.json() : { conversas: [] }))
      .then((d) => setRecentes(d.conversas ?? []))
      .catch(() => setRecentes([]));
  }, [aberto, conversaId]);

  async function abrirConversa(id: string) {
    try {
      const r = await fetch(`/api/assistente/conversas?id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setConversaId(undefined);
        setLista([{ autor: 'assistente', texto: d.erro ?? 'Não foi possível abrir essa conversa.' }]);
        return;
      }
      const d = await r.json();
      setConversaId(id);
      setLista(bolhas(d.mensagens ?? []));
    } catch {
      setLista([{ autor: 'assistente', texto: 'Não foi possível abrir essa conversa.' }]);
    }
  }

  async function perguntar(pergunta: string) {
    if (!pergunta.trim() || ocupado) return;
    setTexto('');
    setOcupado(true);
    setLista((l) => [...l, { autor: 'voce', texto: pergunta }, { autor: 'assistente', texto: '' }]);
    try {
      const r = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, conversaId }),
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.erro ?? 'Não foi possível responder agora.');
      }
      const leitor = r.body.getReader();
      const dec = new TextDecoder();
      let tudo = '';
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        tudo += dec.decode(value, { stream: true });
        const visivel = tudo.split(SEPARADOR_FIM)[0].replace(/\n$/, '');
        setLista((l) => [...l.slice(0, -1), { autor: 'assistente', texto: visivel }]);
      }
      const fim = tudo.split(SEPARADOR_FIM)[1];
      if (fim) {
        try {
          const meta = JSON.parse(fim) as { conversaId?: string; erro?: string };
          // O id pode faltar quando o turno falhou antes de criar a conversa: fica o atual.
          if (meta.conversaId) setConversaId(meta.conversaId);
          if (meta.erro) {
            const aviso = meta.erro;
            setLista((l) => {
              const ultima = l[l.length - 1];
              const completo = ultima.texto ? `${ultima.texto}\n\n${aviso}` : aviso;
              return [...l.slice(0, -1), { autor: 'assistente', texto: completo }];
            });
          }
        } catch {
          // Linha final ilegível: a resposta já está na tela.
        }
      }
    } catch (e) {
      setLista((l) => [...l.slice(0, -1), { autor: 'assistente', texto: (e as Error).message }]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="btn-primary btn-md fixed bottom-5 right-5 z-30 gap-2 rounded-full shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Assistente
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl focus:outline-none"
          aria-describedby="assistente-descricao"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-base font-semibold">Assistente</Dialog.Title>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setConversaId(undefined);
                  setLista([]);
                }}
                disabled={ocupado}
                className="rounded-lg p-2 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                aria-label="Nova conversa"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
              <Dialog.Close
                className="rounded-lg p-2 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="Fechar o assistente"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </header>
          <Dialog.Description id="assistente-descricao" className="sr-only">
            Pergunte sobre a agenda, os pacientes e o financeiro. O assistente só consulta, não altera nada.
          </Dialog.Description>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite" aria-busy={ocupado}>
            {lista.length === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Pergunte sobre a agenda, os pacientes e o financeiro. O assistente só consulta, não altera nada.
                </p>
                <ul className="space-y-2">
                  {SUGESTOES.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => perguntar(s)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
                {recentes.length > 0 && (
                  <nav aria-label="Conversas recentes">
                    <h2 className="mb-1 text-xs font-medium text-muted-foreground">Recentes</h2>
                    <ul className="space-y-1">
                      {recentes.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => abrirConversa(c.id)}
                            className="w-full truncate rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {c.titulo}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </div>
            )}
            {lista.map((b, i) => (
              <div
                key={i}
                className={
                  b.autor === 'voce'
                    ? 'ml-8 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm'
                    : 'mr-4 whitespace-pre-wrap text-sm'
                }
              >
                <span className="sr-only">{b.autor === 'voce' ? 'Você: ' : 'Assistente: '}</span>
                {b.texto || (ocupado && i === lista.length - 1 ? 'Consultando…' : '')}
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              perguntar(texto);
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <label htmlFor="assistente-pergunta" className="sr-only">
              Sua pergunta
            </label>
            <input
              id="assistente-pergunta"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={2000}
              placeholder="Ex.: quem não volta há 6 meses?"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={ocupado}
            />
            <button
              type="submit"
              disabled={ocupado || !texto.trim()}
              className="btn-primary btn-md disabled:opacity-50"
              aria-label="Enviar pergunta"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
