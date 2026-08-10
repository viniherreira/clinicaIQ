'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useClerk } from '@clerk/nextjs';
import { Building2, ChevronDown, CreditCard, LogOut, UserRound, Users } from 'lucide-react';

/**
 * Quem está logado, com nome à vista.
 *
 * O avatar do Clerk sozinho não dizia nada: na clínica todo mundo usa o
 * computador da recepção, e sem o nome na tela alguém grava uma evolução na
 * conta de outro sem perceber. Nome e perfil vêm da mesma linha do banco que
 * decide as permissões — assim o que a tela diz e o que a pessoa consegue fazer
 * nunca divergem.
 *
 * Segue o padrão ARIA de menu button: setas andam pelos itens, Home e End vão
 * aos extremos, Esc fecha e devolve o foco ao botão, Tab fecha ao sair.
 */

interface Item {
  label: string;
  href?: string;
  icon: typeof UserRound;
  onSelect?: () => void;
  /** Separado do resto por uma linha — hoje só o "Sair". */
  aparta?: boolean;
}

export function UserMenu({
  userName,
  userEmail,
  roleLabel,
  clinicName,
  canConfig,
  canPlanos,
}: {
  userName: string;
  userEmail: string;
  roleLabel: string;
  clinicName: string;
  canConfig: boolean;
  canPlanos: boolean;
}) {
  const { signOut, openUserProfile } = useClerk();
  const [aberto, setAberto] = useState(false);
  const [focarAoAbrir, setFocarAoAbrir] = useState<'primeiro' | 'ultimo' | null>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const itensRef = useRef<(HTMLElement | null)[]>([]);

  const itens: Item[] = [
    { label: 'Meu perfil', icon: UserRound, onSelect: () => openUserProfile() },
    ...(canConfig
      ? [
          { label: 'Minha clínica', href: '/configuracoes#clinica', icon: Building2 },
          { label: 'Equipe', href: '/configuracoes#equipe', icon: Users },
        ]
      : []),
    ...(canPlanos ? [{ label: 'Plano e cobrança', href: '/planos', icon: CreditCard }] : []),
    { label: 'Sair', icon: LogOut, onSelect: () => signOut({ redirectUrl: '/sign-in' }), aparta: true },
  ];

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  // Focar o item logo depois de `setAberto(true)` não funciona: os itens ainda
  // não existem no DOM. Um efeito roda depois do commit, quando já existem.
  useEffect(() => {
    if (!aberto || focarAoAbrir === null) return;
    itensRef.current[focarAoAbrir === 'primeiro' ? 0 : itens.length - 1]?.focus();
    setFocarAoAbrir(null);
  }, [aberto, focarAoAbrir, itens.length]);

  function abrir(focar: 'primeiro' | 'ultimo' | null) {
    setFocarAoAbrir(focar);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    botaoRef.current?.focus();
  }

  function andar(de: number, passo: number) {
    const total = itens.length;
    itensRef.current[(de + passo + total) % total]?.focus();
  }

  function teclaNoItem(e: React.KeyboardEvent, i: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      andar(i, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      andar(i, -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      itensRef.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      itensRef.current[itens.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      setAberto(false);
    }
  }

  const iniciais =
    userName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <div ref={raizRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        // Sem isto o leitor de tela lê iniciais, nome e perfil soltos, um atrás
        // do outro. O nome visível continua dentro do rótulo, como pede o
        // critério "Label in Name".
        aria-label={`Sua conta — ${userName}, ${roleLabel}`}
        onClick={() => (aberto ? setAberto(false) : abrir(null))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            abrir(e.key === 'ArrowDown' ? 'primeiro' : 'ultimo');
          } else if (e.key === 'Escape' && aberto) {
            e.preventDefault();
            setAberto(false);
          }
        }}
        className="flex h-10 max-w-[15rem] items-center gap-2 rounded-lg pl-1 pr-2 transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-xs font-semibold text-white"
        >
          {iniciais}
        </span>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block truncate text-sm font-medium">{userName}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Sua conta"
          className="absolute right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg animate-fade-in"
        >
          <div className="px-3 pb-2 pt-2.5">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                {roleLabel}
              </span>
              <span className="truncate">{clinicName}</span>
            </p>
          </div>

          <div className="my-1 h-px bg-border" aria-hidden="true" />

          {itens.map((item, i) => {
            const Icon = item.icon;
            const classe =
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-alt focus-visible:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring';
            const conteudo = (
              <>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {item.label}
              </>
            );

            return (
              <div key={item.label}>
                {item.aparta && <div className="my-1 h-px bg-border" aria-hidden="true" />}
                {item.href ? (
                  <Link
                    href={item.href}
                    role="menuitem"
                    ref={(el) => {
                      itensRef.current[i] = el;
                    }}
                    onClick={() => setAberto(false)}
                    onKeyDown={(e) => teclaNoItem(e, i)}
                    className={classe}
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    ref={(el) => {
                      itensRef.current[i] = el;
                    }}
                    onClick={() => {
                      setAberto(false);
                      item.onSelect?.();
                    }}
                    onKeyDown={(e) => teclaNoItem(e, i)}
                    className={classe}
                  >
                    {conteudo}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
