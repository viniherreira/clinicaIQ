import Link from 'next/link';
import { Bot } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { loadTasks, type TaskRow } from '@/crm/task-list';
import { formatDue } from '@/crm/format';
import { CompleteTaskButton } from './_components/complete-task-button';
import { WhoFilter } from './_components/who-filter';

export const metadata = { title: 'Tarefas · ClinicaIQ' };

/**
 * O dia da recepção: o que venceu, o que vence hoje e o que vem depois.
 * Padrão: as tarefas de quem está logado.
 */
export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const who = typeof sp.de === 'string' && sp.de ? sp.de : 'me';
  const [basics, grupos] = await Promise.all([loadCrmBasics(ctx), loadTasks(ctx, who)]);
  const total = grupos.atrasadas.length + grupos.hoje.length + grupos.proximas.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Tarefas</h1>
        <WhoFilter value={who} team={basics.team} />
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa pendente. Os leads sem próxima ação aparecem no filtro “Sem tarefa” do funil.
        </p>
      ) : (
        <>
          <Grupo titulo="Atrasadas" tom="text-destructive" tarefas={grupos.atrasadas} />
          <Grupo titulo="Hoje" tom="text-foreground" tarefas={grupos.hoje} />
          <Grupo titulo="Próximas" tom="text-muted-foreground" tarefas={grupos.proximas} />
        </>
      )}
    </div>
  );
}

function Grupo({ titulo, tom, tarefas }: { titulo: string; tom: string; tarefas: TaskRow[] }) {
  if (tarefas.length === 0) return null;
  const id = `grupo-${titulo.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={`mb-2 text-sm font-semibold ${tom}`}>
        {titulo} <span className="font-normal text-muted-foreground">({tarefas.length})</span>
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {tarefas.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <CompleteTaskButton taskId={t.id} leadId={t.leadId} text={t.text} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {t.automatic && (
                  <>
                    <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">Criada pela automação:</span>
                  </>
                )}
                <span className="truncate">{t.text}</span>
              </p>
              <Link href={`/crm/leads/${t.leadId}`} className="text-xs text-primary hover:underline">
                {t.leadLabel}
              </Link>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <p className={titulo === 'Atrasadas' ? 'font-medium text-destructive' : ''}>{formatDue(new Date(t.dueAt))}</p>
              <p>{t.assignee}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
