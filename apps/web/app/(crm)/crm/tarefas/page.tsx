import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { loadTasks, type TaskRow } from '@/crm/task-list';
import { TaskList } from './_components/task-list';
import { WhoFilter } from './_components/who-filter';

export const metadata = { title: 'Tarefas · DreamClin' };

/**
 * O dia da recepção, como no Kommo: o que venceu, hoje, amanhã, o resto da
 * semana e depois. Concluir pede o resultado (opcional), que vai para o lead.
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
  const total = Object.values(grupos).reduce((n, g) => n + g.length, 0);

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
          <Grupo id="atrasadas" titulo="Atrasadas" tom="text-destructive" tarefas={grupos.atrasadas} />
          <Grupo id="hoje" titulo="Hoje" tom="text-foreground" tarefas={grupos.hoje} />
          <Grupo id="amanha" titulo="Amanhã" tom="text-foreground" tarefas={grupos.amanha} />
          <Grupo id="semana" titulo="Esta semana" tom="text-muted-foreground" tarefas={grupos.semana} />
          <Grupo id="depois" titulo="Mais tarde" tom="text-muted-foreground" tarefas={grupos.depois} />
        </>
      )}
    </div>
  );
}

function Grupo({ id: chave, titulo, tom, tarefas }: { id: string; titulo: string; tom: string; tarefas: TaskRow[] }) {
  if (tarefas.length === 0) return null;
  const id = `grupo-${chave}`;
  const atrasada = chave === 'atrasadas';
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={`mb-2 text-sm font-semibold ${tom}`}>
        {titulo} <span className="font-normal text-muted-foreground">({tarefas.length})</span>
      </h2>
      <TaskList tarefas={tarefas} atrasada={atrasada} />
    </section>
  );
}
