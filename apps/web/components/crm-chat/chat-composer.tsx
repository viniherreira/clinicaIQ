'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, FileText, Film, Image as ImageIcon, MessageSquareText, Mic, Paperclip, SendHorizontal, Settings, X, Zap } from 'lucide-react';
import { fillQuickReply } from '@/crm/quick-replies';
import { CHAT_MEDIA_ACCEPT, checkChatMedia, formatBytes, MEDIA_KIND_LABEL, type ChatMediaKind } from '@/crm/media-rules';

const KIND_ICON: Record<ChatMediaKind, typeof FileText> = { IMAGE: ImageIcon, DOCUMENT: FileText, AUDIO: Mic, VIDEO: Film };

export interface QuickReplyOption {
  id: string;
  title: string;
  body: string;
}

export interface BotChoice {
  id: string;
  name: string;
}

type Result = { ok: true } | { ok: false; message: string };

/** O que o menu da barra mostra: robôs, respostas rápidas e, para quem configura, os atalhos. */
type SlashItem =
  | { kind: 'bot'; key: string; bot: BotChoice }
  | { kind: 'reply'; key: string; reply: QuickReplyOption }
  | { kind: 'manage'; key: string; label: string; href: string };

/** Para buscar sem se importar com acento nem maiúscula. */
const plano = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * A caixa de texto da conversa, no jeito do Kommo. Enter envia, Shift+Enter
 * quebra a linha. Começar com "/" abre um menu só com os **robôs** (como o
 * Salesbot) e as **respostas rápidas**, filtrados pelo que vem depois da
 * barra. Resposta rápida vira o texto; robô vira uma etiqueta "/Nome" e o
 * Enviar executa o robô nesta conversa. O raio ao lado abre o mesmo menu.
 * Com `onSendMedia`, o clipe anexa um arquivo; o texto vira a legenda.
 */
export function ChatComposer({
  onSend,
  onSendMedia,
  quickReplies,
  contactName,
  disabled,
  disabledReason,
  placeholder = 'Escreva uma mensagem…',
  robots,
  canManage = false,
}: {
  onSend: (text: string) => Promise<Result>;
  /** Manda arquivo + legenda. Sem ele, o clipe não aparece. */
  onSendMedia?: (form: FormData) => Promise<Result>;
  quickReplies: QuickReplyOption[];
  contactName: string | null;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  /** Robôs que dá para executar nesta conversa. Sem ele, o menu só tem respostas rápidas. */
  robots?: { load: () => Promise<BotChoice[]>; run: (botId: string) => Promise<Result> };
  /** Pode cadastrar respostas rápidas e robôs (crm_config): atalhos no fim do menu. */
  canManage?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const enviarRef = useRef<HTMLButtonElement>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [fechado, setFechado] = useState(false);
  const [anexo, setAnexo] = useState<{ file: File; kind: ChatMediaKind } | null>(null);
  const [listaRobos, setListaRobos] = useState<BotChoice[] | null>(null);
  const [robo, setRobo] = useState<BotChoice | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const audio = anexo?.kind === 'AUDIO';

  const busca = texto.startsWith('/') && !texto.includes('\n') ? plano(texto.slice(1).trim()) : null;

  // Os robôs vêm na primeira vez que o menu abre (e ficam guardados). Uma busca
  // só por vez, mesmo que a tela redesenhe enquanto ela anda.
  const menuAberto = busca !== null;
  const buscandoRobos = useRef(false);
  const robotsRef = useRef(robots);
  useEffect(() => {
    robotsRef.current = robots;
  }, [robots]);
  useEffect(() => {
    const r = robotsRef.current;
    if (!menuAberto || !r || listaRobos !== null || buscandoRobos.current) return;
    buscandoRobos.current = true;
    r.load()
      .then(setListaRobos)
      .catch(() => setListaRobos([]))
      .finally(() => {
        buscandoRobos.current = false;
      });
  }, [menuAberto, listaRobos]);

  const itens: SlashItem[] =
    busca === null || fechado || anexo
      ? []
      : [
          ...(listaRobos ?? [])
            .filter((b) => plano(b.name).includes(busca))
            .slice(0, 8)
            .map((b) => ({ kind: 'bot' as const, key: `b-${b.id}`, bot: b })),
          ...quickReplies
            .filter((q) => plano(q.title).includes(busca) || plano(q.body).includes(busca))
            .slice(0, 12)
            .map((q) => ({ kind: 'reply' as const, key: `r-${q.id}`, reply: q })),
          ...(canManage && busca === ''
            ? [
                { kind: 'manage' as const, key: 'm-r', label: 'Gerenciar respostas rápidas', href: '/crm/configuracoes?aba=respostas' },
                ...(robots ? [{ kind: 'manage' as const, key: 'm-b', label: 'Gerenciar robôs', href: '/crm/automacoes/bots' }] : []),
              ]
            : []),
        ];
  const aberto = itens.length > 0;
  const listaId = `${id}-menu`;
  const carregandoRobos = Boolean(robots) && busca !== null && listaRobos === null;

  function focarTexto() {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  function escolher(item: SlashItem) {
    setAtivo(0);
    setFechado(true);
    setErro('');
    if (item.kind === 'reply') {
      setTexto(fillQuickReply(item.reply.body, contactName));
      focarTexto();
    } else if (item.kind === 'bot') {
      setTexto('');
      setRobo(item.bot);
      requestAnimationFrame(() => enviarRef.current?.focus());
    } else {
      router.push(item.href);
    }
  }

  function tirarRobo() {
    setRobo(null);
    setFechado(false);
    focarTexto();
  }

  async function enviar() {
    if (enviando || disabled) return;
    if (robo && robots) {
      setEnviando(true);
      setErro('');
      const r = await robots.run(robo.id).catch(() => ({ ok: false as const, message: 'Não foi possível começar o robô. Tente de novo.' }));
      setEnviando(false);
      if (!r.ok) return setErro(r.message);
      tirarRobo();
      return;
    }
    const t = texto.trim();
    if (!t && !anexo) return;
    setEnviando(true);
    setErro('');
    let r: Result;
    if (anexo && onSendMedia) {
      const form = new FormData();
      form.set('arquivo', anexo.file);
      if (!audio) form.set('legenda', t);
      r = await onSendMedia(form);
    } else {
      r = await onSend(t);
    }
    setEnviando(false);
    if (!r.ok) return setErro(r.message);
    setTexto('');
    setAnexo(null);
    setFechado(false);
    ref.current?.focus();
  }

  function escolherArquivo(file: File | undefined) {
    if (arquivoRef.current) arquivoRef.current.value = '';
    if (!file) return;
    const c = checkChatMedia(file);
    if (!c.ok) return setErro(c.message);
    setErro('');
    setAnexo({ file, kind: c.kind });
    ref.current?.focus();
  }

  const IconeAnexo = anexo ? KIND_ICON[anexo.kind] : null;
  const robos = itens.filter((i) => i.kind === 'bot');
  const respostas = itens.filter((i) => i.kind === 'reply');
  const atalhos = itens.filter((i) => i.kind === 'manage');
  const indice = (item: SlashItem) => itens.indexOf(item);

  const opcao = (item: SlashItem, conteudo: React.ReactNode) => {
    const i = indice(item);
    return (
      <li
        key={item.key}
        id={`${listaId}-${i}`}
        role="option"
        aria-selected={i === ativo}
        onMouseDown={(e) => {
          e.preventDefault();
          escolher(item);
        }}
        onMouseEnter={() => setAtivo(i)}
        className={`flex cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-sm ${i === ativo ? 'bg-primary/15' : ''}`}
      >
        {conteudo}
      </li>
    );
  };
  const grupo = (gid: string, titulo: string, lista: SlashItem[], render: (item: SlashItem) => React.ReactNode) =>
    lista.length > 0 && (
      <li role="presentation">
        <p id={`${listaId}-${gid}`} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        <ul role="group" aria-labelledby={`${listaId}-${gid}`}>
          {lista.map((item) => opcao(item, render(item)))}
        </ul>
      </li>
    );

  return (
    <div className="relative border-t border-border bg-surface p-3">
      {aberto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Robôs e respostas rápidas"
          className="absolute bottom-full left-3 right-3 z-30 mb-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl sm:right-auto sm:w-96"
        >
          {grupo('robos', 'Robôs', robos, (item) => (
            <>
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 break-words font-medium">/{item.kind === 'bot' ? item.bot.name : ''}</span>
            </>
          ))}
          {grupo('respostas', 'Respostas rápidas', respostas, (item) =>
            item.kind === 'reply' ? (
              <>
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-medium">/{item.reply.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.reply.body}</span>
                </span>
              </>
            ) : null,
          )}
          {grupo('atalhos', 'Configurar', atalhos, (item) => (
            <>
              <Settings className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{item.kind === 'manage' ? item.label : ''}</span>
            </>
          ))}
        </ul>
      )}

      {anexo && IconeAnexo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
          <IconeAnexo className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="sr-only">{MEDIA_KIND_LABEL[anexo.kind]} anexado: </span>
            {anexo.file.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(anexo.file.size)}</span>
          <button
            type="button"
            onClick={() => {
              setAnexo(null);
              ref.current?.focus();
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Tirar o anexo"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="flex items-end gap-2"
      >
        {onSendMedia && (
          <>
            <input
              ref={arquivoRef}
              type="file"
              accept={CHAT_MEDIA_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => escolherArquivo(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={disabled || enviando || Boolean(robo)}
              onClick={() => arquivoRef.current?.click()}
              className="btn-ghost h-10 w-10 shrink-0 p-0"
              aria-label="Anexar arquivo (foto, PDF, áudio ou vídeo)"
              title="Anexar arquivo"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
        <button
          type="button"
          disabled={disabled || enviando || audio || Boolean(robo)}
          onClick={() => {
            setTexto('/');
            setFechado(false);
            setAtivo(0);
            focarTexto();
          }}
          className="btn-ghost h-10 w-10 shrink-0 p-0"
          aria-label={robots ? 'Robôs e respostas rápidas (atalho: barra)' : 'Respostas rápidas (atalho: barra)'}
          title={robots ? 'Robôs e respostas rápidas ( / )' : 'Respostas rápidas ( / )'}
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
        </button>

        {robo ? (
          <div className="flex min-h-10 flex-1 flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/15 px-2 py-1 font-medium text-foreground">
              <Zap className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">/{robo.name}</span>
              <button
                type="button"
                onClick={tirarRobo}
                className="-mr-1 rounded p-0.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Tirar o robô ${robo.name}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
            <span className="text-xs text-muted-foreground">Enviar executa o robô nesta conversa.</span>
          </div>
        ) : (
          <>
            <label htmlFor={`${id}-texto`} className="sr-only">
              Mensagem
            </label>
            <textarea
              ref={ref}
              id={`${id}-texto`}
              value={texto}
              disabled={disabled || audio}
              onChange={(e) => {
                setTexto(e.target.value);
                setErro('');
                setAtivo(0);
                if (!e.target.value.startsWith('/')) setFechado(false);
              }}
              onBlur={() => setFechado(true)}
              onFocus={() => setFechado(false)}
              onKeyDown={(e) => {
                if (aberto) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    return setAtivo((a) => (a + 1) % itens.length);
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    return setAtivo((a) => (a - 1 + itens.length) % itens.length);
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    return escolher(itens[ativo] ?? itens[0]);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    return setFechado(true);
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={Math.min(6, Math.max(1, texto.split('\n').length))}
              maxLength={4096}
              placeholder={
                disabled
                  ? disabledReason
                  : audio
                    ? 'Áudio vai sem legenda'
                    : anexo
                      ? 'Legenda (opcional)'
                      : `${placeholder} ( / ${robots ? 'robôs e respostas' : 'respostas rápidas'})`
              }
              role="combobox"
              aria-expanded={aberto}
              aria-controls={aberto ? listaId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={aberto ? `${listaId}-${ativo}` : undefined}
              aria-invalid={erro ? true : undefined}
              aria-describedby={`${id}-dica${erro ? ` ${id}-erro` : ''}`}
              className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            />
          </>
        )}
        <button
          ref={enviarRef}
          type="submit"
          disabled={disabled || enviando || (!robo && !texto.trim() && !anexo)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && robo) {
              e.preventDefault();
              tirarRobo();
            }
          }}
          className="btn-primary h-10 shrink-0 px-3"
          aria-label={robo ? `Executar o robô ${robo.name}` : 'Enviar'}
        >
          {robo ? <Zap className="h-4 w-4" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
          {robo && <span className="hidden text-sm sm:inline">Executar</span>}
        </button>
      </form>
      <p id={`${id}-dica`} className="sr-only">
        Enter envia; Shift mais Enter quebra a linha. Comece com barra para escolher {robots ? 'um robô ou ' : ''}uma resposta rápida.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {carregandoRobos ? 'Carregando robôs…' : aberto ? `${itens.length} opções` : ''}
      </p>
      {erro && (
        <p id={`${id}-erro`} role="alert" className="mt-1.5 text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
