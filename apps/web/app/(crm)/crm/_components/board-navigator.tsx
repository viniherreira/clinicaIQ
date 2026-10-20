'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { colorClasses } from '@/crm/colors';

export interface NavColumn {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface Medidas {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  /** Onde cada coluna começa e quanto ocupa, em px do quadro. */
  cols: { left: number; width: number }[];
}

const LARGURA = 200;

/**
 * O mapa do funil no canto, como no Kommo: uma barrinha por etapa (mais cheia
 * quanto mais leads), o retângulo do que está na tela e setas. Clicar ou
 * arrastar no mapa leva o quadro até lá; cada etapa também é um botão (teclado
 * e leitor de tela). Só aparece quando o funil não cabe na tela.
 */
export function BoardNavigator({ target, columns }: { target: React.RefObject<HTMLDivElement | null>; columns: NavColumn[] }) {
  const [m, setM] = useState<Medidas | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);

  const medir = useCallback(() => {
    const el = target.current;
    if (!el) return;
    const filhos = [...el.querySelectorAll<HTMLElement>(':scope > [role="listitem"]')];
    const base = el.getBoundingClientRect().left - el.scrollLeft;
    setM({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      cols: filhos.map((f) => {
        const r = f.getBoundingClientRect();
        return { left: r.left - base, width: r.width };
      }),
    });
  }, [target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    for (const f of el.children) ro.observe(f);
    return () => {
      el.removeEventListener('scroll', medir);
      ro.disconnect();
    };
  }, [target, medir, columns.length]);

  if (!m || m.scrollWidth <= m.clientWidth + 4) return null;

  const escala = LARGURA / m.scrollWidth;
  const max = Math.max(1, ...columns.map((c) => c.count));
  const rolar = (left: number, smooth = true) => target.current?.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  const levarPara = (clientX: number, smooth: boolean) => {
    const r = trilho.current?.getBoundingClientRect();
    if (!r) return;
    rolar((clientX - r.left) / escala - m.clientWidth / 2, smooth);
  };

  return (
    <nav
      aria-label="Navegar pelas etapas do funil"
      className="fixed bottom-4 right-5 z-30 flex items-center gap-1 rounded-xl border border-border-strong bg-popover/95 p-1.5 shadow-2xl backdrop-blur"
    >
      <button
        type="button"
        onClick={() => rolar(m.scrollLeft - m.clientWidth * 0.8)}
        disabled={m.scrollLeft <= 0}
        aria-label="Ver as etapas à esquerda"
        className="flex h-10 w-7 items-center justify-center rounded-md text-foreground hover:bg-surface-alt disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div
        ref={trilho}
        className="relative h-10 cursor-pointer touch-none rounded-md bg-background/60"
        style={{ width: LARGURA }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          arrastando.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          levarPara(e.clientX, false);
        }}
        onPointerMove={(e) => arrastando.current && levarPara(e.clientX, false)}
        onPointerUp={() => {
          arrastando.current = false;
        }}
      >
        {columns.map((c, i) => {
          const pos = m.cols[i];
          if (!pos) return null;
          const altura = c.count === 0 ? 10 : 25 + Math.round((c.count / max) * 75);
          return (
            <button
              key={c.id}
              type="button"
              title={`${c.name} · ${c.count}`}
              aria-label={`Ir para ${c.name}, ${c.count} ${c.count === 1 ? 'lead' : 'leads'}`}
              onClick={() => rolar(pos.left - 16)}
              className="absolute bottom-1 top-1 flex items-end rounded-[3px] bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
              style={{ left: pos.left * escala, width: Math.max(4, pos.width * escala - 2) }}
            >
              <span className={`w-full rounded-[3px] ${colorClasses(c.color).dot}`} style={{ height: `${altura}%` }} aria-hidden="true" />
            </button>
          );
        })}
        {/* O que está na tela agora. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 rounded-md border-2 border-primary bg-primary/10"
          style={{ left: m.scrollLeft * escala, width: m.clientWidth * escala }}
        />
      </div>
      <button
        type="button"
        onClick={() => rolar(m.scrollLeft + m.clientWidth * 0.8)}
        disabled={m.scrollLeft + m.clientWidth >= m.scrollWidth - 2}
        aria-label="Ver as etapas à direita"
        className="flex h-10 w-7 items-center justify-center rounded-md text-foreground hover:bg-surface-alt disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
