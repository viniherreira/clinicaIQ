'use client';

import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, CircleAlert, CircleCheck, ImageOff, TriangleAlert } from 'lucide-react';
import { formatCount, formatMoney, formatRoas, type AdLine, type CampaignLine, type ReportLine, type RoasStatus } from '@/crm/ads-rules';
import { formatCents } from '@/crm/format';

/**
 * A tabela por campanha: ordena por qualquer coluna e abre os anúncios de cada
 * campanha, com a miniatura. A barrinha embaixo do gasto mostra a fatia da campanha
 * no gasto total. O retorno vem com ícone e palavra, não só cor.
 */

type Key = 'name' | 'spendCents' | 'conversations' | 'costPerConversationCents' | 'scheduled' | 'won' | 'revenueCents' | 'roas';

// No celular a tabela tem largura fixa: o nome ocupa o que sobra e encurta com reticências.
const COLS: { key: Key; label: string; hideOnMobile?: boolean; width?: string }[] = [
  { key: 'name', label: 'Campanha' },
  { key: 'spendCents', label: 'Gasto', width: 'w-[6.25rem] md:w-auto' },
  { key: 'conversations', label: 'Conversas', hideOnMobile: true },
  { key: 'costPerConversationCents', label: 'Custo por conversa', hideOnMobile: true },
  { key: 'scheduled', label: 'Agendou', hideOnMobile: true },
  { key: 'won', label: 'Fechou', hideOnMobile: true },
  { key: 'revenueCents', label: 'Faturou', hideOnMobile: true },
  { key: 'roas', label: 'Retorno', width: 'w-[4.75rem] md:w-auto' },
];

const STATUS: Record<RoasStatus, { cls: string; Icon: typeof CircleCheck; fala: string } | null> = {
  good: { cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200', Icon: CircleCheck, fala: 'bom retorno' },
  warn: { cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200', Icon: TriangleAlert, fala: 'retorno baixo' },
  bad: { cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200', Icon: CircleAlert, fala: 'não se pagou' },
  none: null,
};

function Roas({ line }: { line: ReportLine }) {
  const s = STATUS[line.status];
  if (!s) return <span className="text-muted-foreground">–</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${s.cls}`}>
      <s.Icon className="h-3 w-3" aria-hidden="true" />
      {line.won === 0 ? (
        <>
          <span className="sm:hidden">0x</span>
          <span className="hidden sm:inline">Sem retorno</span>
        </>
      ) : (
        formatRoas(line.roas ?? 0)
      )}
      <span className="sr-only"> ({s.fala})</span>
    </span>
  );
}

const hide = (c: { hideOnMobile?: boolean }) => (c.hideOnMobile ? 'hidden md:table-cell' : '');

const NUM = 'viz-num whitespace-nowrap text-[12px] sm:text-[13px]';

function Cells({ l, share }: { l: ReportLine; share?: number }) {
  return (
    <>
      <td className="px-2 py-3 text-right align-middle sm:px-3">
        <span className={NUM}>{formatMoney(l.spendCents)}</span>
        {share !== undefined && (
          <span className="viz-track ml-auto mt-1.5 block h-1 w-16 overflow-hidden rounded-full" aria-hidden="true">
            <span className="viz-grow-x block h-full rounded-full" style={{ width: `${Math.max(3, share * 100)}%`, background: 'var(--viz-meta)' }} />
          </span>
        )}
        {share !== undefined && <span className="sr-only"> ({Math.round(share * 100)}% do gasto)</span>}
      </td>
      <td className={`hidden px-3 py-3 text-right md:table-cell ${NUM}`}>{formatCount(l.conversations)}</td>
      <td className={`hidden px-3 py-3 text-right md:table-cell ${NUM}`}>
        {l.costPerConversationCents == null ? <span className="text-muted-foreground">–</span> : formatMoney(l.costPerConversationCents)}
      </td>
      <td className={`hidden px-3 py-3 text-right md:table-cell ${NUM}`}>{formatCount(l.scheduled)}</td>
      <td className={`hidden px-3 py-3 text-right md:table-cell ${NUM}`}>{formatCount(l.won)}</td>
      <td className={`hidden px-3 py-3 text-right md:table-cell ${NUM}`}>{formatCents(l.revenueCents)}</td>
      <td className="whitespace-nowrap py-3 pl-2 text-right sm:pl-3">
        <Roas line={l} />
      </td>
    </>
  );
}

/** O nome: no celular quebra em até duas linhas; em tela larga fica numa linha só. */
function Nome({ texto }: { texto: string }) {
  return (
    <>
      <span className="line-clamp-2 break-words leading-snug md:hidden">{texto}</span>
      <span className="hidden truncate md:block">{texto}</span>
    </>
  );
}

function Thumb({ ad }: { ad: AdLine }) {
  const [quebrou, setQuebrou] = useState(false);
  if (!ad.thumbnailUrl || quebrou) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.08]" aria-hidden="true">
        <ImageOff className="h-4 w-4" />
      </span>
    );
  }
  // Miniatura servida pela Meta; o endereço muda a cada busca, então não passa pelo otimizador de imagens.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ad.thumbnailUrl} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" onError={() => setQuebrou(true)} className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-foreground/10" />;
}

export function CampaignTable({ lines }: { lines: CampaignLine[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: 'asc' | 'desc' }>({ key: 'spendCents', dir: 'desc' });
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const ordenadas = [...lines].sort((a, b) => {
    const [x, y] = [a[sort.key], b[sort.key]];
    const cmp = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'pt-BR') : (x ?? -1) - (y ?? -1);
    return sort.dir === 'asc' ? cmp : -cmp;
  });
  const ordenar = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const gastoTotal = lines.reduce((t, l) => t + l.spendCents, 0);
  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  if (lines.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha com resultado neste período.</p>;

  return (
    <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="w-full table-fixed text-sm md:table-auto">
        <caption className="sr-only">Resultado por campanha. Abra uma campanha para ver os anúncios dela.</caption>
        <thead>
          <tr className="border-b border-border/70 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {COLS.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={`pb-2.5 font-medium ${i === 0 ? 'text-left' : 'px-2 text-right last:pr-0 sm:px-3'} ${c.width ?? ''} ${hide(c)}`}
              >
                <button
                  type="button"
                  onClick={() => ordenar(c.key)}
                  className={`inline-flex items-center gap-1 rounded uppercase tracking-[0.12em] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${sort.key === c.key ? 'text-foreground' : ''}`}
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => {
            const aberta = abertas.has(l.id);
            return (
              <Fragment key={l.id}>
                <tr className="border-b border-border/50 transition-colors hover:bg-foreground/[0.03]">
                  <th scope="row" className="py-3 pr-2 text-left font-medium md:max-w-[16rem] md:pr-3">
                    <button
                      type="button"
                      onClick={() => alternar(l.id)}
                      aria-expanded={aberta}
                      disabled={l.ads.length === 0}
                      className="flex w-full items-center gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${aberta ? 'rotate-90' : ''} ${l.ads.length === 0 ? 'opacity-0' : ''}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <Nome texto={l.name} />
                        <span className="block text-xs font-normal text-muted-foreground">
                          {l.ads.length} {l.ads.length === 1 ? 'anúncio' : 'anúncios'}
                        </span>
                      </span>
                    </button>
                  </th>
                  <Cells l={l} share={gastoTotal > 0 ? l.spendCents / gastoTotal : 0} />
                </tr>
                {aberta &&
                  l.ads.map((ad) => (
                    <tr key={ad.id} className="border-b border-border/30 bg-foreground/[0.025]">
                      <th scope="row" className="py-2 pl-1 pr-2 text-left font-normal md:max-w-[16rem] md:pl-6 md:pr-3">
                        <span className="flex items-center gap-2.5">
                          <span className="hidden md:block">
                            <Thumb ad={ad} />
                          </span>
                          <span className="min-w-0"><Nome texto={ad.name} /></span>
                        </span>
                      </th>
                      <Cells l={ad} />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
