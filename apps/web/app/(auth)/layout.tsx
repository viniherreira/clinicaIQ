import { CalendarDays, FileText, ShieldCheck, Sparkles } from 'lucide-react';

const FEATURES = [
  { icon: CalendarDays, title: 'Agenda inteligente', desc: 'Visual, por profissional, com confirmação via WhatsApp.' },
  { icon: FileText, title: 'Orçamentos que fecham', desc: 'PDF profissional e link para o paciente aceitar online.' },
  { icon: ShieldCheck, title: 'Seguro e LGPD', desc: 'CPF e telefone criptografados de ponta a ponta.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-gradient p-12 text-white lg:flex xl:p-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <span className="text-base font-bold">CIQ</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">ClinicaIQ</span>
        </div>

        <div className="relative max-w-md">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Gestão clínica moderna
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            A sua clínica inteira, em um só lugar.
          </h1>
          <p className="mt-3 text-white/80">
            Agenda, pacientes, procedimentos e orçamentos — com acessibilidade e segurança de verdade.
          </p>

          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                  <f.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-sm text-white/75">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} ClinicaIQ</p>
      </aside>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fade-in-up">{children}</div>
      </div>
    </main>
  );
}
