'use client';

import { Fragment, useEffect, useRef } from 'react';
import {
  AlertCircle, Bot, CalendarClock, Check, CircleDot, Megaphone, CheckCheck, Clock, FileText, Image as ImageIcon, MapPin, Mic, RotateCw,
  Smartphone, StickyNote, Sticker, Trophy, User, Video, XCircle,
} from 'lucide-react';
import type { ChatLine } from '@/crm/conversations';
import type { TimelineEntry, TimelineKind } from '@/crm/timeline';
import { chatDayLabel, chatTime, initials, sameClinicDay } from '@/crm/format';

const MEDIA: Record<string, { icon: typeof ImageIcon; label: string }> = {
  IMAGE: { icon: ImageIcon, label: 'Foto' },
  AUDIO: { icon: Mic, label: 'Áudio' },
  VIDEO: { icon: Video, label: 'Vídeo' },
  DOCUMENT: { icon: FileText, label: 'Documento' },
  STICKER: { icon: Sticker, label: 'Figurinha' },
  LOCATION: { icon: MapPin, label: 'Localização' },
  CONTACT: { icon: User, label: 'Contato' },
  OTHER: { icon: FileText, label: 'Mensagem' },
};

/** O status em texto — o ícone sozinho não diz nada a quem usa leitor de tela. */
function statusOf(m: ChatLine): { label: string; icon: typeof Check; tone: string } | null {
  if (m.direction !== 'OUTBOUND') return null;
  if (m.status === 'FAILED') return { label: 'Não enviada', icon: AlertCircle, tone: 'text-destructive' };
  if (m.status === 'READ') return { label: 'Lida', icon: CheckCheck, tone: 'text-sky-700 dark:text-sky-300' };
  if (m.status === 'DELIVERED') return { label: 'Entregue', icon: CheckCheck, tone: 'text-muted-foreground' };
  if (m.status === 'SENT' || m.accepted) return { label: 'Enviada', icon: Check, tone: 'text-muted-foreground' };
  return { label: 'Enviando', icon: Clock, tone: 'text-muted-foreground' };
}

function whoOf(m: ChatLine, contact: string): { label: string; icon?: typeof Bot } {
  if (m.direction === 'INBOUND') return { label: contact };
  if (m.origin === 'AUTOMATION') return { label: 'Automático', icon: Bot };
  if (m.origin === 'BOT') return { label: 'Robô', icon: Bot };
  if (m.origin === 'BROADCAST') return { label: 'Transmissão', icon: Megaphone };
  if (m.origin === 'PHONE') return { label: 'Pelo celular', icon: Smartphone };
  return { label: m.sentBy ?? 'Equipe' };
}

const EVENT_ICON: Record<TimelineKind, typeof CircleDot> = {
  event: CircleDot,
  note: StickyNote,
  task: CalendarClock,
  clinic: FileText,
  won: Trophy,
  lost: XCircle,
};

type Item = { kind: 'msg'; at: Date; m: ChatLine } | { kind: 'ev'; at: Date; e: TimelineEntry };

/**
 * As mensagens de uma conversa, mais antigas em cima, com separador por dia.
 * Na ficha do lead, o histórico vem junto (`events`), na ordem do tempo, como
 * no Kommo: mudou de etapa, nota, tarefa e a conversa num lugar só.
 * Quem está lendo lá embaixo acompanha as novas; quem subiu para ler o
 * passado não é puxado de volta.
 */
export function ChatMessages({
  messages,
  truncated,
  contactName,
  onRetry,
  retrying,
  events,
}: {
  messages: ChatLine[];
  truncated: boolean;
  contactName: string;
  onRetry?: (id: string) => void;
  retrying?: string | null;
  events?: TimelineEntry[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);
  const ultimo = messages.at(-1)?.id;
  const itens: Item[] = [
    ...messages.map((m) => ({ kind: 'msg' as const, at: new Date(m.at), m })),
    ...(events ?? []).map((e) => ({ kind: 'ev' as const, at: new Date(e.at), e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  useEffect(() => {
    const box = boxRef.current;
    if (box && grudado.current) box.scrollTop = box.scrollHeight;
  }, [ultimo, messages.length, events?.length]);

  return (
    <div
      ref={boxRef}
      onScroll={(e) => {
        const b = e.currentTarget;
        grudado.current = b.scrollHeight - b.scrollTop - b.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto bg-board px-4 py-4 sm:px-6"
      // Área que rola precisa receber foco, senão quem usa só o teclado não lê o
      // começo da conversa (axe: scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-label="Mensagens"
    >
      {truncated && (
        <p className="mb-4 text-center text-xs text-muted-foreground">Mostrando as 200 mensagens mais recentes.</p>
      )}
      {itens.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nenhuma mensagem ainda. O que for conversado a partir de agora aparece aqui.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {itens.map((item, i) => {
            const at = item.at;
            const novoDia = i === 0 || !sameClinicDay(itens[i - 1].at, at);
            const separador = novoDia && (
              <li aria-hidden="true" className="flex justify-center py-2">
                <span className="rounded-full bg-surface px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {chatDayLabel(at)}
                </span>
              </li>
            );
            if (item.kind === 'ev') {
              return (
                <Fragment key={`ev-${item.e.id}`}>
                  {separador}
                  <EventLine e={item.e} at={at} />
                </Fragment>
              );
            }
            const m = item.m;
            const saida = m.direction === 'OUTBOUND';
            const quem = whoOf(m, contactName);
            const status = statusOf(m);
            const media = m.kind !== 'TEXT' ? MEDIA[m.kind] ?? MEDIA.OTHER : null;
            const auto = m.origin === 'AUTOMATION' || m.origin === 'BOT' || m.origin === 'BROADCAST';
            return (
              <Fragment key={m.id}>
                {separador}
                <li className={`flex items-end gap-2 ${saida ? 'flex-row-reverse' : ''}`}>
                  {/* Como no Kommo: quem falou ao lado do balão. */}
                  <span
                    aria-hidden="true"
                    className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${saida ? 'bg-primary/15 text-primary' : 'bg-surface-alt text-muted-foreground'}`}
                  >
                    {quem.icon ? <quem.icon className="h-3.5 w-3.5" /> : initials(quem.label)}
                  </span>
                  <div
                    className={[
                      'max-w-[80%] rounded-lg px-3.5 py-2 text-sm shadow-[0_1px_2px_rgba(15,30,60,0.10)] sm:max-w-[68%]',
                      saida
                        ? auto
                          ? 'rounded-br-sm border border-dashed border-border-strong bg-surface text-foreground'
                          : 'rounded-br-sm bg-bubble-out text-foreground'
                        : 'rounded-bl-sm bg-surface text-foreground',
                      m.status === 'FAILED' ? 'ring-1 ring-destructive/50' : '',
                    ].join(' ')}
                  >
                    <span className="sr-only">{`${quem.label}, ${chatDayLabel(at)} às ${chatTime(at)}: `}</span>
                    <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground" aria-hidden={status ? undefined : true}>
                      <span aria-hidden="true">{chatTime(at)}</span>
                      <span aria-hidden="true" className="inline-flex items-center gap-1 font-medium">
                        {quem.label}
                      </span>
                      {status && (
                        <span className={`inline-flex items-center gap-0.5 ${status.tone}`}>
                          <status.icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{status.label}</span>
                        </span>
                      )}
                    </p>
                    {media && m.hasMedia && <MediaView line={m} label={media.label} />}
                    {media && !m.hasMedia && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <media.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {media.label}
                          {!saida && <span className="text-xs">: abra no celular para ver</span>}
                        </span>
                      </p>
                    )}
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    {m.buttons.length > 0 && (
                      <ul aria-label="Botões da mensagem" className="mt-2 flex flex-col gap-1">
                        {m.buttons.map((b, j) => (
                          <li key={j} className="rounded-md border border-border bg-surface-alt px-2 py-1 text-center text-xs font-medium text-primary">
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.status === 'FAILED' && (
                      <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs">
                        {m.error && <span className="text-destructive">{m.error}</span>}
                        {onRetry && m.origin === 'CRM' && (
                          <button
                            type="button"
                            onClick={() => onRetry(m.id)}
                            disabled={retrying === m.id}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                          >
                            <RotateCw className="h-3 w-3" aria-hidden="true" /> Tentar de novo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * Um registro do histórico no meio da conversa: nota num cartão amarelo (como
 * no Kommo), o resto numa linha centralizada com quem fez e a hora.
 */
function EventLine({ e, at }: { e: TimelineEntry; at: Date }) {
  const Icon = e.who === 'Automação' ? Bot : EVENT_ICON[e.kind];
  if (e.kind === 'note') {
    return (
      <li className="flex justify-center py-1">
        <div className="w-full max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Nota de {e.who}</span>
            <span aria-hidden="true">· {chatTime(at)}</span>
            <span className="sr-only">, {chatDayLabel(at)} às {chatTime(at)}</span>
          </p>
          <p className="whitespace-pre-wrap break-words">{e.text}</p>
        </div>
      </li>
    );
  }
  const tom =
    e.kind === 'won'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
      : e.kind === 'lost'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
        : 'bg-surface text-muted-foreground';
  return (
    <li className="flex justify-center py-1">
      <p className={`inline-flex max-w-[90%] items-start gap-1.5 rounded-full px-3 py-1 text-xs shadow-sm ${tom}`}>
        <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">{e.who}</span>
          <span aria-hidden="true"> · {chatTime(at)} · </span>
          <span className="sr-only">, {chatDayLabel(at)} às {chatTime(at)}: </span>
          {e.text}
        </span>
      </p>
    </li>
  );
}

/** Mídia da API oficial: o CRM busca na Meta na hora (nada fica guardado). */
function MediaView({ line, label }: { line: ChatLine; label: string }) {
  const src = `/api/crm/media/${line.id}`;
  if (line.kind === 'IMAGE' || line.kind === 'STICKER') {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-2 focus-visible:outline-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={line.text ? `${label}: ${line.text}` : `${label} recebida`} loading="lazy" className="max-h-64 rounded-lg" />
      </a>
    );
  }
  // Áudio e vídeo mandados pelo contato não vêm com legenda, e uma faixa vazia só
  // fingiria cumprir a regra. A transcrição automática fica para depois.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  if (line.kind === 'AUDIO') return <audio controls preload="none" src={src} aria-label={label} className="w-56 max-w-full" />;
  // eslint-disable-next-line jsx-a11y/media-has-caption
  if (line.kind === 'VIDEO') return <video controls preload="none" src={src} aria-label={label} className="max-h-64 rounded-lg" />;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2">
      <FileText className="h-4 w-4" aria-hidden="true" /> Abrir {label.toLowerCase()}
    </a>
  );
}
