'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bot, Settings } from 'lucide-react';
import { botOptionsAction, startBotAction, type BotOption } from '@/app/(crm)/crm/conversas/actions';

export const MENU_ITEM =
  'flex cursor-pointer select-none items-start gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt data-[disabled]:cursor-default data-[disabled]:opacity-60';
export const MENU_CONTENT = 'z-[60] max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 text-foreground shadow-xl';

/**
 * "Executar robô" na conversa, como o Salesbot do Kommo: a equipe escolhe um
 * dos robôs ligados e ele começa do primeiro passo com esta pessoa.
 */
export function BotMenu({
  conversationId,
  disabled,
  canManage,
  onDone,
}: {
  conversationId: string;
  disabled?: boolean;
  canManage?: boolean;
  /** Começou (ou falhou): o aviso para a tela. */
  onDone: (r: { ok: true; name: string } | { ok: false; message: string }) => void;
}) {
  const [bots, setBots] = useState<BotOption[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [rodando, setRodando] = useState(false);

  return (
    <DropdownMenu.Root
      modal={false}
      onOpenChange={(aberto) => {
        if (!aberto) return;
        setFalhou(false);
        botOptionsAction()
          .then((r) => {
            setBots(r.ok ? r.bots : []);
            setFalhou(!r.ok);
          })
          .catch(() => {
            setBots([]);
            setFalhou(true);
          });
      }}
    >
      <DropdownMenu.Trigger
        disabled={disabled || rodando}
        className="btn-ghost h-10 w-10 shrink-0 p-0"
        aria-label="Executar robô nesta conversa"
        title="Executar robô"
      >
        <Bot className="h-4 w-4" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={6} className={MENU_CONTENT}>
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">Executar robô</DropdownMenu.Label>
          {bots === null ? (
            <DropdownMenu.Item disabled className={MENU_ITEM}>
              Carregando…
            </DropdownMenu.Item>
          ) : bots.length === 0 ? (
            <DropdownMenu.Item disabled className={MENU_ITEM}>
              {falhou ? 'Não foi possível carregar os robôs. Tente de novo.' : 'Nenhum robô ligado.'}
            </DropdownMenu.Item>
          ) : (
            bots.map((b) => (
              <DropdownMenu.Item
                key={b.id}
                className={MENU_ITEM}
                onSelect={async () => {
                  setRodando(true);
                  const r = await startBotAction(conversationId, b.id).catch(() => ({ ok: false as const, message: 'Não foi possível começar o robô. Tente de novo.' }));
                  setRodando(false);
                  onDone(r);
                }}
              >
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">{b.name}</span>
              </DropdownMenu.Item>
            ))
          )}
          {canManage && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild className={MENU_ITEM}>
                <Link href="/crm/automacoes/bots">
                  <Settings className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> Gerenciar robôs
                </Link>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
