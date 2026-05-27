const statusColors: Record<string, string> = {
  agendado: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  confirmado: 'bg-success/10 text-success',
  'não confirmado': 'bg-warning/10 text-warning',
  faltou: 'bg-destructive/10 text-destructive',
  atendido: 'bg-primary/10 text-primary',
};

const mockAppointments = [
  { time: '08:00', patient: 'Maria Silva', procedure: 'Limpeza', professional: 'Dra. Ana', status: 'confirmado', duration: 30 },
  { time: '08:30', patient: 'João Santos', procedure: 'Restauração', professional: 'Dra. Ana', status: 'agendado', duration: 60 },
  { time: '09:00', patient: 'Carla Oliveira', procedure: 'Clareamento', professional: 'Dr. Pedro', status: 'confirmado', duration: 90 },
  { time: '09:30', patient: 'Roberto Lima', procedure: 'Avaliação', professional: 'Dra. Ana', status: 'não confirmado', duration: 30 },
  { time: '10:00', patient: 'Fernanda Costa', procedure: 'Canal', professional: 'Dr. Pedro', status: 'faltou', duration: 60 },
  { time: '10:30', patient: 'Lucas Mendes', procedure: 'Extração', professional: 'Dra. Ana', status: 'atendido', duration: 45 },
  { time: '11:00', patient: 'Patricia Rocha', procedure: 'Prótese', professional: 'Dr. Pedro', status: 'agendado', duration: 60 },
  { time: '14:00', patient: 'André Pereira', procedure: 'Implante', professional: 'Dra. Ana', status: 'confirmado', duration: 120 },
];

const mockQuotes = [
  { patient: 'Maria Silva', total: 2450.0, status: 'aceito', date: '25/05' },
  { patient: 'João Santos', total: 890.0, status: 'enviado', date: '26/05' },
  { patient: 'Carla Oliveira', total: 5200.0, status: 'visualizado', date: '26/05' },
  { patient: 'Roberto Lima', total: 1350.0, status: 'rascunho', date: '27/05' },
];

const quoteStatusColors: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviado: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  visualizado: 'bg-warning/10 text-warning',
  aceito: 'bg-success/10 text-success',
  recusado: 'bg-destructive/10 text-destructive',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function DashboardPage() {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground capitalize">{formattedDate}</p>
      </header>

      {/* KPI Cards */}
      <section aria-label="Resumo do dia" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Agendados" value="8" detail="hoje" color="text-foreground" />
        <KpiCard label="Confirmados" value="3" detail="37.5%" color="text-success" />
        <KpiCard label="Não confirmados" value="1" detail="aguardando" color="text-warning" />
        <KpiCard label="Faltas" value="1" detail="12.5%" color="text-destructive" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Appointments Table */}
        <section aria-label="Agendamentos do dia" className="lg:col-span-2">
          <div className="rounded-lg border bg-surface">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-medium">Agenda do dia</h2>
              <span className="text-xs text-muted-foreground">8 agendamentos</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Agendamentos de hoje</caption>
                <thead>
                  <tr className="border-b bg-surface-alt text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">Horário</th>
                    <th scope="col" className="px-4 py-2 font-medium">Paciente</th>
                    <th scope="col" className="px-4 py-2 font-medium hidden sm:table-cell">Procedimento</th>
                    <th scope="col" className="px-4 py-2 font-medium hidden md:table-cell">Profissional</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mockAppointments.map((apt, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-surface-alt transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{apt.time}</td>
                      <td className="px-4 py-3 font-medium">{apt.patient}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{apt.procedure}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{apt.professional}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[apt.status]}`}>
                          {apt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Sidebar: Quotes + Quick Actions */}
        <aside className="space-y-6">
          {/* Quotes */}
          <div className="rounded-lg border bg-surface">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-medium">Orçamentos recentes</h2>
            </div>
            <ul className="divide-y" role="list">
              {mockQuotes.map((q, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3 hover:bg-surface-alt transition-colors">
                  <div>
                    <p className="text-sm font-medium">{q.patient}</p>
                    <p className="text-xs text-muted-foreground">{q.date} · {formatCurrency(q.total)}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${quoteStatusColors[q.status]}`}>
                    {q.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Color Palette Demo */}
          <div className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-medium mb-3">Paleta</h2>
            <div className="grid grid-cols-4 gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-8 rounded-md bg-primary" />
                <span className="text-2xs text-muted-foreground">Primary</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-8 rounded-md bg-accent" />
                <span className="text-2xs text-muted-foreground">Accent</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-8 rounded-md bg-success" />
                <span className="text-2xs text-muted-foreground">Success</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-8 rounded-md bg-destructive" />
                <span className="text-2xs text-muted-foreground">Danger</span>
              </div>
            </div>
          </div>

          {/* Button Samples */}
          <div className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-medium mb-3">Botões</h2>
            <div className="flex flex-col gap-2">
              <button className="touch-target inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Novo agendamento
              </button>
              <button className="touch-target inline-flex items-center justify-center rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Cadastrar paciente
              </button>
              <button className="touch-target inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Criar orçamento
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-surface p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
