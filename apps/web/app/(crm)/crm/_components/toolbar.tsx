'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, KanbanSquare, List, Megaphone, MoreHorizontal, Pencil, Plus, Tags, Upload, Zap } from 'lucide-react';
import type { BoardFilters, BoardPerson, BoardPipeline } from '@/crm/types';
import { formatCents } from '@/crm/format';
import { NewLeadModal } from './new-lead-modal';
import { PipelineMenu } from './pipeline-menu';
import { FilterSearch, type TagWithCount } from './filter-panel';
import { isFilterable, type FieldDef } from '@/crm/custom-fields';

/**
 * A barra do topo do funil e da lista, como a do Kommo: o nome do funil (que
 * abre a troca de funil), Quadro | Lista, a busca larga que abre os filtros,
 * quantos leads e quanto valem, o menu "⋯" e "Novo lead".
 *
 * Os filtros moram na URL: o voltar do navegador e um link copiado mostram a
 * mesma coisa.
 */
export function CrmToolbar({
  view,
  filters,
  tags,
  team,
  procedures,
  meId,
  summary,
  pipelines,
  currentPipeline,
  canConfig,
  canExport = canConfig,
  today,
  fields = [],
}: {
  /** "Exportar" no quadro de permissões. */
  canExport?: boolean;
  view: 'quadro' | 'lista';
  /** Campos personalizados ativos: viram filtro (lista e sim/não) e entram no Novo lead. */
  fields?: FieldDef[];
  filters: BoardFilters;
  tags: TagWithCount[];
  team: BoardPerson[];
  procedures: { id: string; name: string }[];
  meId: string;
  /** Quantos leads a tela mostra e quanto somam. */
  summary?: { count: number; valueCents: number };
  pipelines: BoardPipeline[];
  /** O funil do quadro. Na lista, nenhum (o filtro escolhe). */
  currentPipeline?: BoardPipeline;
  canConfig: boolean;
  /** Dia da clínica, "AAAA-MM-DD" (os atalhos do período contam a partir dele). */
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState('');

  // Trocar de Quadro para Lista leva os filtros junto (menos o modo de edição).
  const sp = new URLSearchParams(params.toString());
  sp.delete('editar');
  const qs = sp.toString() ? `?${sp.toString()}` : '';

  const filtrosTransmissao = new URLSearchParams(sp);
  filtrosTransmissao.delete('ordem');
  if (currentPipeline) filtrosTransmissao.set('funil', currentPipeline.id);
  const transmissaoQs = filtrosTransmissao.toString() ? `?${filtrosTransmissao.toString()}` : '';

  /** A URL da busca a partir do que o painel pede (o funil do quadro e, na lista, a situação). */
  const destino = (next: Record<string, string>, comOrdem: boolean) => {
    const q = new URLSearchParams();
    if (view === 'lista') {
      const ordem = params.get('ordem');
      const situacao = params.get('situacao');
      if (ordem && comOrdem) q.set('ordem', ordem);
      if (situacao && !('situacao' in next)) q.set('situacao', situacao);
    }
    if (currentPipeline) q.set('funil', currentPipeline.id);
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return q;
  };

  const editarHref = currentPipeline ? `/crm?funil=${currentPipeline.id}&editar=1` : '/crm?editar=1';
  const item =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
      {view === 'quadro' && currentPipeline ? (
        <PipelineMenu pipelines={pipelines} current={currentPipeline} canConfig={canConfig} />
      ) : (
        <h1 className="px-1 text-sm font-bold uppercase tracking-wide">Leads</h1>
      )}

      <nav aria-label="Modo de visualização" className="flex items-center gap-0.5">
        <Link
          href={`/crm${qs}`}
          aria-current={view === 'quadro' ? 'page' : undefined}
          title="Quadro"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:text-link"
        >
          <KanbanSquare className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">Quadro</span>
        </Link>
        <Link
          href={`/crm/leads${qs}`}
          aria-current={view === 'lista' ? 'page' : undefined}
          title="Lista"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:text-link"
        >
          <List className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">Lista</span>
        </Link>
      </nav>

      <FilterSearch
        view={view}
        filters={filters}
        tags={tags}
        team={team}
        stages={currentPipeline ? currentPipeline.columns : pipelines.flatMap((p) => p.columns.map((s) => ({ ...s, name: pipelines.length > 1 ? `${p.name} · ${s.name}` : s.name })))}
        pipelines={view === 'lista' ? pipelines : []}
        fields={fields.filter((f) => isFilterable(f.type))}
        canConfig={canConfig}
        today={today}
        onApply={(next) => {
          // Na lista, a ordem continua; a situação também, se o atalho não trocou.
          const q = destino(next, true);
          // Período de fechamento: leads fechados só existem na lista.
          if (view === 'quadro' && q.get('data') === 'fechado') {
            q.set('situacao', 'todos');
            router.push(`/crm/leads?${q.toString()}`);
            return;
          }
          const s = q.toString();
          router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
        }}
        onBroadcast={(next) => {
          const q = destino(next, false);
          if (view === 'quadro' && q.get('data') === 'fechado') q.set('situacao', 'todos');
          router.push(`/crm/automacoes/transmissoes/nova?${q.toString()}`);
        }}
      />


      {summary && (
        <p className="ml-auto text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{summary.count.toLocaleString('pt-BR')}</span> {summary.count === 1 ? 'lead' : 'leads'}:{' '}
          <span className="font-semibold text-foreground">{formatCents(summary.valueCents)}</span>
        </p>
      )}

      {canConfig && (
        <Link
          href={`/crm/automacoes/transmissoes/nova${transmissaoQs}`}
          className="btn-outline btn-md hidden h-9 text-xs font-semibold lg:inline-flex"
          title="Mandar uma mensagem para os leads desta busca"
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Transmissão
          <span className="sr-only"> para os leads desta busca</span>
        </Link>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Mais opções"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="z-[60] min-w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl">
            {canConfig && view === 'quadro' && (
              <DropdownMenu.Item asChild className={item}>
                <Link href={editarHref}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Editar funil
                </Link>
              </DropdownMenu.Item>
            )}
            {canConfig && (
              <DropdownMenu.Item asChild className={item}>
                <Link href="/crm/configuracoes?aba=tags">
                  <Tags className="h-4 w-4" aria-hidden="true" /> Gerenciar tags
                </Link>
              </DropdownMenu.Item>
            )}
            {canConfig && (
              <DropdownMenu.Item asChild className={item}>
                {/* O público da transmissão já vem com os filtros desta busca. */}
                <Link href={`/crm/automacoes/transmissoes/nova${transmissaoQs}`}>
                  <Megaphone className="h-4 w-4" aria-hidden="true" /> Enviar transmissão para estes leads
                </Link>
              </DropdownMenu.Item>
            )}
            {canExport && (
              <DropdownMenu.Item asChild className={item}>
                {/* A planilha leva os filtros desta busca; baixa direto (é uma rota, não uma página). */}
                <a href={`/crm/leads/exportar${transmissaoQs}`} download>
                  <Download className="h-4 w-4" aria-hidden="true" /> Exportar planilha
                </a>
              </DropdownMenu.Item>
            )}
            {canConfig && (
              <DropdownMenu.Item asChild className={item}>
                <Link href="/crm/leads/importar">
                  <Upload className="h-4 w-4" aria-hidden="true" /> Importar planilha (Kommo)
                </Link>
              </DropdownMenu.Item>
            )}
            {canConfig && (
              <DropdownMenu.Item asChild className={item}>
                <Link href="/crm/automacoes">
                  <Zap className="h-4 w-4" aria-hidden="true" /> Automações
                </Link>
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <button
        type="button"
        onClick={() => setNovo(true)}
        className="btn-primary btn-md inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Novo lead
      </button>

      <NewLeadModal
        open={novo}
        onClose={() => setNovo(false)}
        onCreated={(msg) => {
          setAviso(msg);
          router.refresh();
        }}
        team={team}
        procedures={procedures}
        meId={meId}
        stages={currentPipeline?.columns}
        fields={fields}
      />
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>
    </div>
  );
}
