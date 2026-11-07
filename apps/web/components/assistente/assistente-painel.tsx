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
  const [anuncio, setAnuncio] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ocupadoRef = useRef(false);

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
    if (!pergunta.trim() || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setTexto('');
    setOcupado(true);
    setAnuncio('Consultando…');
    setLista((l) => [...l, { autor: 'voce', texto: pergunta }, { autor: 'assistente', texto: '' }]);
    // O que está na bolha da resposta; é também o que o leitor de tela ouve no fim.
    let visivel = '';
    const mostrar = (t: string) => {
      visivel = t;
      setLista((l) => [...l.slice(0, -1), { autor: 'assistente', texto: t }]);
    };
    const acrescentar = (aviso: string) => mostrar(visivel.trim() ? `${visivel}\n\n${aviso}` : aviso);
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
      try {
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          tudo += dec.decode(value, { stream: true });
          mostrar(tudo.split(SEPARADOR_FIM)[0].replace(/\n$/, ''));
        }
        tudo += dec.decode();
      } catch (e) {
        // Falha no meio do stream: fica o que já chegou, mais o aviso.
        const aviso = (e as Error).message || 'A resposta foi interrompida. Tente de novo.';
        acrescentar(aviso);
        return;
      }
      const partes = tudo.split(SEPARADOR_FIM);
      mostrar(partes[0].replace(/\n$/, ''));
      if (partes.length < 2) {
        acrescentar('A resposta foi interrompida. Tente de novo.');
        return;
      }
      try {
        const meta = JSON.parse(partes[1]) as { conversaId?: string; erro?: string };
        // O id pode faltar quando o turno falhou antes de criar a conversa: fica o atual.
        if (meta.conversaId) setConversaId(meta.conversaId);
        if (meta.erro) acrescentar(meta.erro);
        else if (!visivel.trim()) mostrar('Sem resposta. Tente de novo.');
      } catch {
        if (!visivel.trim()) mostrar('Sem resposta. Tente de novo.');
      }
    } catch (e) {
      mostrar((e as Error).message);
    } finally {
      setAnuncio(visivel);
      ocupadoRef.current = false;
      setOcupado(false);
      inputRef.current?.focus();
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
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
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

          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            tabIndex={0}
            aria-label="Conversa com o assistente"
          >
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
          <div role="status" aria-live="polite" className="sr-only">
            {anuncio}
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
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={2000}
              placeholder="Ex.: quem não volta há 6 meses?"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              readOnly={ocupado}
              aria-disabled={ocupado}
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
