/**
 * ClinicaIQ marketing landing page (rendered at `/` for signed-out visitors).
 *
 * Design direction: clean professional health-SaaS. Brand green (hue 152) over
 * warm white surfaces, floating CSS-built dashboard mockups in the hero plus a
 * flat-style illustrated professional (SVG, no stock photos), generous
 * whitespace. Display font: Bricolage Grotesque; body stays Geist. Features use
 * an editorial numbered list with hairline dividers instead of cards. Motion:
 * staggered fade-in-up on load and a gentle float on the mockups, CSS-only, so
 * the whole page is a zero-JS server component.
 *
 * Copy is intentionally honest: the product is in early access, so there are no
 * invented testimonials or user counts.
 */
import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';
import {
  ArrowRight, ArrowDown, CalendarDays, MessageCircle, FileText, Smile,
  BarChart3, Accessibility, ShieldCheck, Lock, Check, Sparkles, Clock,
  CheckCheck, Users, Heart,
} from 'lucide-react';
import { LogoMark, LogoWordmark } from '@/components/logo';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="ClinicaIQ — página inicial">
          <LogoMark size="md" />
          <LogoWordmark className={`${display.className} text-lg font-bold tracking-tight`} />
        </Link>

        <nav aria-label="Menu da página" className="hidden items-center gap-1 md:flex">
          <a href="#recursos" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Recursos</a>
          <a href="#diferenciais" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Diferenciais</a>
          <a href="#perguntas" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Perguntas</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="btn-outline btn-md !rounded-full max-sm:hidden">Entrar</Link>
          <Link href="/sign-up" className="btn-primary btn-md !rounded-full shadow-md shadow-primary/25">
            Começar grátis
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero mockups (pure CSS, mirror the real product) ────────────────────────

function AgendaMockup() {
  const rows = [
    { time: '09:00', name: 'Maria Fernandes', proc: 'Limpeza', dot: 'bg-emerald-500', status: 'Confirmado' },
    { time: '10:30', name: 'João Pedro Alves', proc: 'Avaliação', dot: 'bg-slate-400', status: 'Agendado' },
    { time: '14:00', name: 'Ana Beatriz Rocha', proc: 'Clareamento', dot: 'bg-emerald-500', status: 'Confirmado' },
  ];
  return (
    <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-4 shadow-card-hover sm:max-w-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Agenda de hoje</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <CalendarDays className="h-3 w-3" aria-hidden="true" /> 12 pacientes
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.time} className="flex items-center gap-2.5 rounded-lg bg-surface-alt/70 px-2.5 py-2">
            <span className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground">{r.time}</span>
            <span className="h-6 w-1 rounded-full bg-primary/70" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{r.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{r.proc}</span>
            </span>
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} aria-hidden="true" />
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatsAppMockup() {
  return (
    <div className="w-60 rounded-2xl border border-border bg-surface p-3.5 shadow-card-hover">
      <div className="mb-2 flex items-center gap-1.5">
        <MessageCircle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <p className="text-[11px] font-semibold text-muted-foreground">Confirmação automática</p>
      </div>
      <div className="rounded-xl rounded-tl-sm bg-primary/10 p-3 text-xs leading-relaxed">
        <p>Olá, <strong>Maria</strong>! 👋</p>
        <p className="mt-1">Seu agendamento na <strong>Clínica Sorriso</strong> foi registrado:</p>
        <p className="mt-1">📅 sexta-feira, 10/07 às <strong>14:00</strong></p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          14:02 <CheckCheck className="h-3 w-3 text-sky-500" aria-hidden="true" />
        </p>
      </div>
    </div>
  );
}

function QuotesMockup() {
  return (
    <div className="w-52 rounded-2xl border border-border bg-surface p-4 shadow-card-hover">
      <p className="text-[11px] font-semibold text-muted-foreground">Orçamentos · 30 dias</p>
      <p className={`${display.className} mt-1 text-3xl font-bold text-primary`}>68%</p>
      <p className="text-[11px] text-muted-foreground">de conversão</p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-alt" role="presentation">
        <div className="h-full w-[68%] rounded-full bg-brand-gradient" />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Aceitos</span>
        <span className="font-semibold">R$ 24.380</span>
      </div>
    </div>
  );
}

/** Flat-style illustrated clinic professional (keeps the page photo-free while
 *  giving the hero the human touch of the reference sites). Decorative only. */
function PersonIllustration({ className = '' }: { className?: string }) {
  const green = 'hsl(152 70% 27%)';
  const greenDark = 'hsl(155 72% 20%)';
  const skin = '#E9B48E';
  const skinShade = '#DDA47D';
  const hair = '#3B2A21';
  const coat = '#FFFFFF';
  const coatShade = '#ECE9E2';
  const dark = '#262B33';
  return (
    <svg
      viewBox="0 0 300 560"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* ground shadow */}
      <ellipse cx="150" cy="542" rx="92" ry="13" fill="hsl(var(--foreground) / 0.08)" />

      {/* legs */}
      <rect x="116" y="368" width="31" height="152" rx="15" fill={dark} />
      <rect x="153" y="368" width="31" height="152" rx="15" fill={dark} />
      {/* shoes */}
      <rect x="103" y="506" width="52" height="24" rx="12" fill="#F4F2ED" />
      <rect x="150" y="506" width="52" height="24" rx="12" fill="#F4F2ED" />
      <rect x="103" y="522" width="52" height="8" rx="4" fill="#D8D4CA" />
      <rect x="150" y="522" width="52" height="8" rx="4" fill="#D8D4CA" />

      {/* coat */}
      <path
        d="M150 166 C188 166 210 191 214 226 L224 368 Q226 392 201 392 L99 392 Q74 392 76 368 L86 226 C90 191 112 166 150 166 Z"
        fill={coat}
      />
      {/* coat side shading */}
      <path
        d="M214 226 L224 368 Q226 392 201 392 L188 392 L196 226 C195 203 186 184 170 173 C193 179 211 200 214 226 Z"
        fill={coatShade}
      />
      {/* scrub v-neck */}
      <path d="M130 170 L150 214 L170 170 Z" fill={green} />
      <path d="M150 214 L150 220 L143 206 Z" fill={greenDark} />
      {/* coat center line */}
      <path d="M150 220 L150 390" stroke={coatShade} strokeWidth="3" strokeLinecap="round" />
      {/* id badge */}
      <path d="M150 220 L173 246" stroke={coatShade} strokeWidth="3" strokeLinecap="round" />
      <rect x="164" y="244" width="24" height="30" rx="4" fill="#F7F5F0" stroke="#DDD9CF" strokeWidth="1.5" />
      <rect x="164" y="244" width="24" height="9" rx="4" fill={green} />
      <rect x="169" y="258" width="14" height="3" rx="1.5" fill="#C9C4B8" />
      <rect x="169" y="264" width="10" height="3" rx="1.5" fill="#C9C4B8" />

      {/* waving arm (viewer right, raised) */}
      <path
        d="M204 212 C228 222 242 204 250 172"
        stroke={coatShade}
        strokeWidth="27"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="252" cy="160" r="14" fill={skin} />
      <path d="M247 149 Q252 143 258 148" stroke={skinShade} strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* tablet-holding arm (viewer left, down) */}
      <path
        d="M98 210 C86 240 88 274 104 296"
        stroke={coatShade}
        strokeWidth="27"
        strokeLinecap="round"
        fill="none"
      />
      {/* tablet */}
      <g transform="rotate(-8 145 306)">
        <rect x="102" y="276" width="86" height="60" rx="9" fill={dark} />
        <rect x="108" y="282" width="74" height="48" rx="5" fill="#FDFDFB" />
        <circle cx="145" cy="306" r="14" fill={green} />
        <path d="M138 306 L143 311 L153 300" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <circle cx="106" cy="300" r="11" fill={skin} />

      {/* neck */}
      <rect x="140" y="138" width="20" height="30" rx="9" fill={skin} />
      <path d="M140 144 Q150 152 160 144 L160 138 L140 138 Z" fill={skinShade} />

      {/* head */}
      <circle cx="150" cy="34" r="17" fill={hair} />
      <ellipse cx="150" cy="102" rx="39" ry="43" fill={skin} />
      <circle cx="110" cy="106" r="8" fill={skin} />
      <circle cx="190" cy="106" r="8" fill={skin} />
      {/* hair */}
      <path
        d="M110 102 C104 52 128 36 150 36 C172 36 196 52 190 102 C188 72 172 60 150 60 C128 60 112 72 110 102 Z"
        fill={hair}
      />
      {/* earrings */}
      <circle cx="110" cy="115" r="3" fill={green} />
      <circle cx="190" cy="115" r="3" fill={green} />
      {/* brows */}
      <path d="M130 90 Q137 85 145 88" stroke={hair} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M170 90 Q163 85 155 88" stroke={hair} strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* eyes */}
      <circle cx="136" cy="101" r="3.6" fill="#2A2018" />
      <circle cx="164" cy="101" r="3.6" fill="#2A2018" />
      {/* blush */}
      <ellipse cx="127" cy="113" rx="5" ry="3" fill="#F2A48C" opacity="0.55" />
      <ellipse cx="173" cy="113" rx="5" ry="3" fill="#F2A48C" opacity="0.55" />
      {/* smile */}
      <path d="M137 118 Q150 132 163 118" stroke="#A85F38" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-lg" aria-hidden="true">
      {/* Glow */}
      <div className="absolute -inset-10 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-end justify-center">
        <div className="relative z-10 -mr-10 flex flex-col items-start gap-4 pb-10 sm:-mr-16">
          <div className="animate-float-slow z-20 self-end sm:-mr-2">
            <WhatsAppMockup />
          </div>
          <div className="animate-float">
            <AgendaMockup />
          </div>
          <div className="animate-float-slow -mt-6 ml-4">
            <QuotesMockup />
          </div>
        </div>
        <PersonIllustration className="relative z-0 w-36 shrink-0 sm:w-48 lg:w-56" />
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const bullets = [
    'Menos faltas com confirmação e lembrete automáticos no WhatsApp',
    'Mais orçamentos aceitos com link de aprovação online e PDF',
    'Agenda, prontuário com odontograma e financeiro em um só lugar',
  ];
  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 70% -10%, hsl(var(--primary) / 0.08), transparent), radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
        backgroundSize: 'auto, 28px 28px',
      }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <p className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Grátis durante o acesso antecipado
          </p>

          <h1
            className={`${display.className} animate-fade-in-up mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]`}
            style={{ animationDelay: '80ms' }}
          >
            <span className="text-primary">Gestão inteligente</span> para sua clínica, do agendamento ao pagamento
          </h1>

          <p className="animate-fade-in-up mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ animationDelay: '160ms' }}>
            Agenda por profissional, confirmação automática no WhatsApp, orçamentos com
            link e PDF, ficha clínica com odontograma e dashboard financeiro. Feito para
            clínicas odontológicas e estéticas no Brasil.
          </p>

          <ul className="animate-fade-in-up mt-6 space-y-2.5" style={{ animationDelay: '240ms' }}>
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm sm:text-[15px]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <div className="animate-fade-in-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '320ms' }}>
            <Link
              href="/sign-up"
              className="btn-primary !h-12 !rounded-full px-7 !text-base shadow-lg shadow-primary/30 transition-transform hover:scale-[1.03]"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#recursos" className="btn-ghost !h-12 !rounded-full px-5 !text-base">
              Conhecer os recursos
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <p className="animate-fade-in-up mt-4 text-xs text-muted-foreground" style={{ animationDelay: '400ms' }}>
            Sem cartão de crédito · Pronto para usar em 5 minutos
          </p>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '280ms' }}>
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ─────────────────────────────────────────────────────────────

function TrustStrip() {
  const items = [
    { icon: ShieldCheck, label: 'LGPD por padrão' },
    { icon: Lock, label: 'CPF e telefone criptografados' },
    { icon: Accessibility, label: 'Acessibilidade WCAG 2.1 AA' },
    { icon: Heart, label: 'Feito no Brasil' },
  ];
  return (
    <section aria-label="Segurança e conformidade" className="border-y border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 sm:px-6">
        {items.map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon: CalendarDays,
      title: 'Agenda inteligente',
      text: 'Visão por dia ou semana com os profissionais lado a lado. Bloqueio de horário, expediente visível na grade e aviso de conflito na hora de marcar.',
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp automático',
      text: 'O paciente recebe a confirmação assim que o horário é marcado e um lembrete no dia anterior. A recepção não precisa digitar mensagem nenhuma.',
    },
    {
      icon: FileText,
      title: 'Orçamentos que fecham',
      text: 'Monte o orçamento em minutos, envie por link ou PDF com a sua marca e acompanhe o status: visualizado, aceito, pago. Com registro de pagamento parcial.',
    },
    {
      icon: Smile,
      title: 'Ficha clínica completa',
      text: 'Histórico de atendimentos, odontograma interativo dente a dente e a situação financeira do paciente reunidos em uma única tela.',
    },
    {
      icon: BarChart3,
      title: 'Financeiro sem planilha',
      text: 'Indicadores do dia, atendimentos da semana e conversão de orçamentos direto no dashboard. Nada de exportar relatório para saber como está o mês.',
    },
    {
      icon: Accessibility,
      title: 'Acessibilidade levada a sério',
      text: 'Navegação por teclado, compatibilidade com leitores de tela, alto contraste e modo escuro. Toda a equipe consegue usar o sistema.',
    },
  ];
  return (
    <section id="recursos" className="scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Recursos</p>
          <h2 className={`${display.className} mt-2 text-3xl font-bold tracking-tight sm:text-4xl`}>
            O que sua clínica ganha com o ClinicaIQ
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Cada módulo foi desenhado para o trabalho real de uma clínica: a recepção
            agenda em segundos, o profissional encontra o prontuário e quem gerencia
            acompanha o dinheiro.
          </p>
        </div>

        <div className="mt-12 grid gap-x-14 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="flex gap-5 border-t border-border py-8 sm:py-9">
              <span className="font-mono text-sm font-medium tabular-nums text-primary" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className={`${display.className} flex items-center gap-2.5 text-lg font-bold tracking-tight`}>
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {title}
                </h3>
                <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Differentiators (personas) ──────────────────────────────────────────────

function Differentiators() {
  const personas = [
    {
      icon: Clock,
      who: 'Para a recepção',
      title: 'Agendar deixa de ser malabarismo',
      points: ['Busca de paciente instantânea', 'Conflito de horário avisado na hora', 'Confirmação vai sozinha pelo WhatsApp'],
    },
    {
      icon: Smile,
      who: 'Para o profissional',
      title: 'O prontuário na ponta dos dedos',
      points: ['Odontograma interativo por dente', 'Histórico completo de atendimentos', 'Agenda do dia com um olhar'],
    },
    {
      icon: Users,
      who: 'Para quem gerencia',
      title: 'O dinheiro deixa de ser mistério',
      points: ['Conversão de orçamentos em tempo real', 'Pagamentos e saldo por paciente', 'Dados protegidos conforme a LGPD'],
    },
  ];
  return (
    <section id="diferenciais" className="scroll-mt-20 border-y border-border bg-surface py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Diferenciais</p>
          <h2 className={`${display.className} mt-2 text-3xl font-bold tracking-tight sm:text-4xl`}>
            Um sistema, três pessoas felizes
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Sistemas de clínica costumam servir bem só uma pessoa. O ClinicaIQ foi
            desenhado para a recepção, para o profissional e para quem gerencia,
            tudo ao mesmo tempo.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {personas.map(({ icon: Icon, who, title, points }) => (
            <article key={who} className="rounded-2xl border border-border bg-background p-6 shadow-card">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {who}
              </p>
              <h3 className={`${display.className} mt-3 text-xl font-bold tracking-tight`}>{title}</h3>
              <ul className="mt-4 space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FAQ() {
  const faqs = [
    {
      q: 'Quanto custa o ClinicaIQ?',
      a: 'Durante o acesso antecipado, o ClinicaIQ é gratuito. Quando os planos pagos chegarem, quem entrou cedo terá condições especiais. Você será avisado com antecedência, sem surpresa na fatura.',
    },
    {
      q: 'Preciso instalar alguma coisa?',
      a: 'Não. O ClinicaIQ roda direto no navegador, no computador da recepção, no tablet do consultório e no celular. Basta criar a conta e entrar.',
    },
    {
      q: 'Como funciona a confirmação pelo WhatsApp?',
      a: 'Ao criar um agendamento, o paciente recebe automaticamente uma mensagem de confirmação no WhatsApp. No dia anterior à consulta, um lembrete é enviado. Tudo sem a recepção digitar nada.',
    },
    {
      q: 'Meus dados e os dos pacientes estão seguros?',
      a: 'Sim. Dados sensíveis como CPF e telefone são criptografados (AES-256) e o sistema segue a LGPD desde a arquitetura. Cada clínica só acessa os próprios dados.',
    },
    {
      q: 'Funciona bem no celular?',
      a: 'Funciona. A agenda, os pacientes e os orçamentos foram desenhados também para telas pequenas. A recepção consegue confirmar um horário do celular sem sofrimento.',
    },
    {
      q: 'Consigo trazer meus pacientes de outro sistema?',
      a: 'Sim. O cadastro de pacientes é rápido e, se você tiver uma planilha exportada do sistema atual, a gente ajuda na migração durante o acesso antecipado.',
    },
  ];
  return (
    <section id="perguntas" className="scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Perguntas frequentes</p>
          <h2 className={`${display.className} mt-2 text-3xl font-bold tracking-tight sm:text-4xl`}>
            Ficou alguma dúvida?
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border border-border bg-surface px-5 shadow-card transition-colors open:border-primary/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold sm:text-base [&::-webkit-details-marker]:hidden">
                {q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:bg-primary/10 group-open:text-primary" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                </span>
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section aria-labelledby="cta-final" className="px-4 pb-16 sm:px-6 lg:pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-gradient px-6 py-14 text-center shadow-xl sm:px-12 lg:py-20">
        {/* Decorative rings */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full border border-white/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full border border-white/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full border border-white/10" />

        <h2 id="cta-final" className={`${display.className} mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl`}>
          Pronto para simplificar a rotina da sua clínica?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/85">
          Crie sua conta gratuita, cadastre a equipe e faça o primeiro agendamento
          em menos de 5 minutos. Sem cartão, sem fidelidade.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-primary shadow-lg transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Começar agora, é grátis
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-base font-medium text-white/90 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Já tenho conta
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark size="md" />
            <LogoWordmark className={`${display.className} text-lg font-bold tracking-tight`} />
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Gestão inteligente para clínicas odontológicas e estéticas.
            Agenda, WhatsApp, orçamentos, prontuário e financeiro em um só lugar.
          </p>
        </div>

        <nav aria-label="Links do produto">
          <p className="text-sm font-semibold">Produto</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><a href="#recursos" className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Recursos</a></li>
            <li><a href="#diferenciais" className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Diferenciais</a></li>
            <li><a href="#perguntas" className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Perguntas frequentes</a></li>
            <li><Link href="/sign-up" className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Criar conta</Link></li>
            <li><Link href="/sign-in" className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Entrar</Link></li>
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold">Compromissos</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Conformidade com a LGPD</li>
            <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" aria-hidden="true" /> Dados sensíveis criptografados</li>
            <li className="flex items-center gap-2"><Accessibility className="h-4 w-4 text-primary" aria-hidden="true" /> Acessibilidade WCAG 2.1 AA</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} ClinicaIQ. Todos os direitos reservados.</p>
          <p>Feito no Brasil 🇧🇷</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main-content">
        <Hero />
        <TrustStrip />
        <Features />
        <Differentiators />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
