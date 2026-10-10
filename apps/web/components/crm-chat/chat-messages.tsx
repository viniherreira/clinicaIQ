'use client';

import { Fragment, useEffect, useRef } from 'react';
import {
  AlertCircle, Bot, Check, CheckCheck, Clock, FileText, Image as ImageIcon, MapPin, Mic, RotateCw, Smartphone, Sticker, User, Video,
} from 'lucide-react';
import type { ChatLine } from '@/crm/conversations';
import { chatDayLabel, chatTime, sameClinicDay } from '@/crm/format';

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
  if (m.origin === 'PHONE') return { label: 'Pelo celular', icon: Smartphone };
  return { label: m.sentBy ?? 'Equipe' };
}

/**
 * As mensagens de uma conversa, mais antigas em cima, com separador por dia.
 * Quem está lendo lá embaixo acompanha as novas; quem subiu para ler o
 * passado não é puxado de volta.
 */
export function ChatMessages({
  messages,
  truncated,
  contactName,
  onRetry,
  retrying,
}: {
  messages: ChatLine[];
  truncated: boolean;
  contactName: string;
  onRetry?: (id: string) => void;
  retrying?: string | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);
  const ultimo = messages.at(-1)?.id;

  useEffect(() => {
    const box = boxRef.current;
    if (box && grudado.current) box.scrollTop = box.scrollHeight;
  }, [ultimo, messages.length]);

  return (
    <div
      ref={boxRef}
      onScroll={(e) => {
        const b = e.currentTarget;
        grudado.current = b.scrollHeight - b.scrollTop - b.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto bg-surface-alt/40 px-4 py-4 sm:px-6"
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
      {messages.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nenhuma mensagem ainda. O que for conversado a partir de agora aparece aqui.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {messages.map((m, i) => {
            const at = new Date(m.at);
            const novoDia = i === 0 || !sameClinicDay(new Date(messages[i - 1].at), at);
            const saida = m.direction === 'OUTBOUND';
            const quem = whoOf(m, contactName);
            const status = statusOf(m);
            const media = m.kind !== 'TEXT' ? MEDIA[m.kind] ?? MEDIA.OTHER : null;
            const auto = m.origin === 'AUTOMATION';
            return (
              <Fragment key={m.id}>
                {novoDia && (
                  <li aria-hidden="true" className="flex justify-center py-2">
                    <span className="rounded-full bg-surface px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                      {chatDayLabel(at)}
                    </span>
                  </li>
                )}
                <li className={`flex ${saida ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={[
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]',
                      saida
                        ? auto
                          ? 'rounded-br-md border border-dashed border-border bg-surface text-foreground'
                          : 'rounded-br-md bg-primary/10 text-foreground'
                        : 'rounded-bl-md border border-border bg-surface text-foreground',
                      m.status === 'FAILED' ? 'ring-1 ring-destructive/50' : '',
                    ].join(' ')}
                  >
                    <span className="sr-only">{`${quem.label}, ${chatDayLabel(at)} às ${chatTime(at)}: `}</span>
                    {media && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <media.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {media.label}
                          {!saida && <span className="text-xs"> — abra no celular para ver</span>}
                        </span>
                      </p>
                    )}
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    <p className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground`} aria-hidden={status ? undefined : true}>
                      {(saida || auto) && (
                        <span className="inline-flex items-center gap-1" aria-hidden="true">
                          {quem.icon && <quem.icon className="h-3 w-3" />}
                          {quem.label} ·
                        </span>
                      )}
                      <span aria-hidden="true">{chatTime(at)}</span>
                      {status && (
                        <span className={`inline-flex items-center gap-0.5 ${status.tone}`}>
                          <status.icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className={m.status === 'FAILED' ? '' : 'sr-only'}>{status.label}</span>
                        </span>
                      )}
                    </p>
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
