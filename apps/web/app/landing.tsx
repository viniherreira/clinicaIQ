/**
 * ClinicaIQ marketing landing page (rendered at `/` for signed-out visitors).
 *
 * Design direction: clean professional health-SaaS. Brand green (hue 152) over
 * warm white surfaces. The hero is a collage in the style of clinic-SaaS
 * references: a solid brand circle with floating dashboard cards (financial
 * summary, appointments bar chart, attendance donut, 12-month trend) and a
 * flat-style illustrated professional on the right (SVG, no stock photos).
 * Display font: Bricolage Grotesque; body stays Geist. Features use an
 * editorial numbered list with hairline dividers instead of cards. Motion:
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
  Users, Heart, PlusCircle,
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

// ─── Hero visual (dashboard-card collage over the brand circle) ──────────────

function CardArrow() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-alt text-muted-foreground" aria-hidden="true">
      <ArrowRight className="h-3 w-3" />
    </span>
  );
}

function FinanceCard() {
  return (
    <div className="w-60 rounded-2xl border border-border bg-surface p-4 shadow-card-hover">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold">Resumo financeiro</p>
        <CardArrow />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          Total a receber
        </span>
        <span className="text-xs font-bold text-primary">R$ 12.400</span>
      </div>
      <div className="mt-2.5 space-y-1.5 px-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-[3px] bg-slate-300" aria-hidden="true" /> À vencer
          </span>
          <span className="font-semibold tabular-nums">R$ 8.150</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-[3px] bg-rose-400" aria-hidden="true" /> Vencidas
          </span>
          <span className="font-semibold tabular-nums">R$ 4.250</span>
        </div>
      </div>
    </div>
  );
}

const BARS = [
  { h: 55, c: 'bg-emerald-600' },
  { h: 30, c: 'bg-slate-800 dark:bg-slate-300' },
  { h: 72, c: 'bg-amber-400' },
  { h: 62, c: 'bg-rose-400' },
  { h: 84, c: 'bg-violet-500' },
  { h: 48, c: 'bg-emerald-400' },
  { h: 66, c: 'bg-slate-700 dark:bg-slate-400' },
  { h: 90, c: 'bg-amber-500' },
  { h: 58, c: 'bg-emerald-600' },
  { h: 74, c: 'bg-violet-400' },
];

function AppointmentsCard() {
  return (
    <div className="w-64 rounded-2xl border border-border bg-surface p-4 shadow-card-hover">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">Agendamentos</p>
        <CardArrow />
      </div>
      <div className="mb-2 flex items-end justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-alt text-muted-foreground" aria-hidden="true">
          <CalendarDays className="h-4 w-4" />
        </span>
        <span className={`${display.className} text-3xl font-bold leading-none`}>450</span>
      </div>
      <div className="flex h-20 items-end gap-1.5" role="presentation">
        {BARS.map((b, i) => (
          <span key={i} className={`flex-1 rounded-t ${b.c}`} style={{ height: `${b.h}%` }} />
        ))}
      </div>
    </div>
  );
}

function AttendanceCard() {
  return (
    <div className="w-60 rounded-2xl border border-border bg-surface p-4 shadow-card-hover">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">Atendimentos</p>
        <CardArrow />
      </div>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-700" />
          <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray="24 163" className="stroke-primary" />
        </svg>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>Total</span><span className="tabular-nums">1.500</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-slate-300" aria-hidden="true" /> Particular
            </span>
            <span className="font-semibold tabular-nums text-foreground">1.400</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-primary" aria-hidden="true" /> Convênios
            </span>
            <span className="font-semibold tabular-nums text-foreground">100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function TrendCard() {
  return (
    <div className="w-72 rounded-2xl border border-border bg-surface p-4 shadow-card-hover">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">Atendimentos · últimos 12 meses</p>
        <CardArrow />
      </div>
      <svg viewBox="0 0 260 80" className="w-full" aria-hidden="true">
        <polyline
          points="4,64 26,52 48,58 70,44 92,50 114,34 136,42 158,26 180,34 202,20 224,26 252,10"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-foreground"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wide text-muted-foreground" aria-hidden="true">
        {MONTHS.map((m) => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

/** Flat-style illustrated professional (glasses, shirt, tablet), matching the
 *  pose of the reference photo without resorting to stock imagery. */
function PersonIllustration({ className = '' }: { className?: string }) {
  const skin = '#E9B48E';
  const skinShade = '#DDA47D';
  const hair = '#4A3527';
  const shirt = '#FFFFFF';
  const shirtShade = '#ECEAE4';
  const dark = '#23282F';
  return (
    <svg viewBox="0 0 320 560" className={className} role="presentation" aria-hidden="true" focusable="false">
      <ellipse cx="160" cy="544" rx="100" ry="12" fill="hsl(var(--foreground) / 0.10)" />

      {/* legs */}
      <rect x="126" y="364" width="32" height="156" rx="15" fill={dark} />
      <rect x="162" y="364" width="32" height="156" rx="15" fill={dark} />
      {/* shoes */}
      <rect x="112" y="506" width="54" height="24" rx="12" fill="#F4F2ED" />
      <rect x="158" y="506" width="54" height="24" rx="12" fill="#F4F2ED" />
      <rect x="112" y="522" width="54" height="8" rx="4" fill="#D8D4CA" />
      <rect x="158" y="522" width="54" height="8" rx="4" fill="#D8D4CA" />

      {/* shirt */}
      <path
        d="M160 156 C202 156 226 182 230 218 L240 352 Q242 376 216 376 L104 376 Q78 376 80 352 L90 218 C94 182 118 156 160 156 Z"
        fill={shirt}
      />
      <path
        d="M230 218 L240 352 Q242 376 216 376 L204 376 L212 218 C211 196 202 178 186 168 C210 175 227 194 230 218 Z"
        fill={shirtShade}
      />
      {/* collar + placket */}
      <path d="M144 162 L160 186 L176 162" stroke={shirtShade} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M160 186 L160 372" stroke={shirtShade} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="160" cy="212" r="2" fill="#D8D4CA" />
      <circle cx="160" cy="248" r="2" fill="#D8D4CA" />
      <circle cx="160" cy="284" r="2" fill="#D8D4CA" />
      <circle cx="160" cy="320" r="2" fill="#D8D4CA" />

      {/* tablet arm (viewer left, holding at waist) */}
      <path d="M104 206 C90 236 92 268 108 292" stroke={shirtShade} strokeWidth="27" strokeLinecap="round" fill="none" />
      <g transform="rotate(-8 150 306)">
        <rect x="104" y="274" width="92" height="64" rx="9" fill={dark} />
        <rect x="110" y="280" width="80" height="52" rx="5" fill="#FBFAF7" />
        <circle cx="150" cy="306" r="14" fill="hsl(152 70% 27%)" />
        <path d="M143 306 L148 311 L158 300" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <circle cx="112" cy="298" r="11" fill={skin} />

      {/* glasses-adjusting arm (viewer right, raised) */}
      <path d="M214 208 C244 200 240 150 212 122" stroke={shirtShade} strokeWidth="26" strokeLinecap="round" fill="none" />

      {/* neck */}
      <rect x="148" y="130" width="24" height="34" rx="10" fill={skin} />
      <path d="M148 136 Q160 144 172 136 L172 130 L148 130 Z" fill={skinShade} />

      {/* head */}
      <ellipse cx="160" cy="98" rx="40" ry="44" fill={skin} />
      <circle cx="119" cy="102" r="8" fill={skin} />
      <circle cx="201" cy="102" r="8" fill={skin} />
      {/* hair */}
      <path
        d="M120 94 C116 50 138 32 160 32 C182 32 204 50 200 94 C196 64 182 54 160 54 C138 54 124 64 120 94 Z"
        fill={hair}
      />
      {/* beard */}
      <path d="M126 108 C132 148 188 148 194 108" stroke={hair} strokeWidth="16" strokeLinecap="round" fill="none" />
      {/* mustache + smile */}
      <path d="M148 116 Q160 122 172 116" stroke={hair} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M146 127 Q160 137 174 127" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* brows */}
      <path d="M128 82 Q138 77 148 81" stroke={hair} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M192 82 Q182 77 172 81" stroke={hair} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* eyes */}
      <circle cx="140" cy="99" r="3.4" fill="#2A2018" />
      <circle cx="180" cy="99" r="3.4" fill="#2A2018" />
      {/* glasses */}
      <circle cx="140" cy="99" r="13" stroke="#2B2620" strokeWidth="3" fill="none" />
      <circle cx="180" cy="99" r="13" stroke="#2B2620" strokeWidth="3" fill="none" />
      <path d="M153 99 L167 99" stroke="#2B2620" strokeWidth="3" strokeLinecap="round" />
      <path d="M127 95 L119 91" stroke="#2B2620" strokeWidth="3" strokeLinecap="round" />
      <path d="M193 95 L201 91" stroke="#2B2620" strokeWidth="3" strokeLinecap="round" />
      {/* hand adjusting glasses (drawn over the frame) */}
      <circle cx="206" cy="112" r="12" fill={skin} />
      <path d="M200 103 Q206 97 213 102" stroke={skinShade} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function HeroVisual() {
  return (
    <>
      {/* Desktop: card collage over the brand circle, like the reference */}
      <div className="relative hidden h-[560px] lg:block" aria-hidden="true">
        <div className="absolute right-4 top-12 h-[420px] w-[420px] rounded-full bg-brand-gradient" />
        <div className="absolute right-0 top-2 h-24 w-24 rounded-full bg-lime-300/60 dark:bg-lime-300/20" />
        <div className="absolute -bottom-20 -left-8 h-[460px] w-[560px] rounded-full border border-primary/25" />

        <PersonIllustration className="absolute bottom-2 right-0 z-10 w-60" />

        <div className="absolute left-16 top-0 z-20 animate-float"><AppointmentsCard /></div>
        <div className="absolute -left-4 top-32 z-30 animate-float-slow"><FinanceCard /></div>
        <div className="absolute left-2 top-[302px] z-20 animate-float"><AttendanceCard /></div>
        <div className="absolute left-40 top-[380px] z-20 animate-float-slow"><TrendCard /></div>
      </div>

      {/* Mobile: lighter stack of the two key cards */}
      <div className="relative mx-auto w-full max-w-sm lg:hidden" aria-hidden="true">
        <div className="absolute -inset-6 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-4">
          <div className="animate-float self-end"><AppointmentsCard /></div>
          <div className="animate-float-slow -mt-10 self-start"><FinanceCard /></div>
        </div>
      </div>
    </>
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
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
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
