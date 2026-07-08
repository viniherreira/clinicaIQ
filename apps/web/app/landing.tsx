/**
 * ClinicaIQ marketing landing page (rendered at `/` for signed-out visitors).
 *
 * Design direction: clean professional health-SaaS with warmth and color. The
 * hero pairs a real photo (Pexels, free commercial license) of a smiling
 * professional inside a circle mask with floating dashboard cards and status
 * pills, over soft multicolor blobs. Feature icons and personas use a varied
 * pastel palette so the page reads hand-designed rather than monochrome.
 * Display font: Bricolage Grotesque; body stays Geist. Features use an
 * editorial numbered list with hairline dividers instead of cards. Motion:
 * staggered fade-in-up on load and a gentle float on the mockups, CSS-only.
 *
 * Copy is intentionally honest: the product is in early access, so there are no
 * invented testimonials or user counts.
 */
import Link from 'next/link';
import Image from 'next/image';
import { Bricolage_Grotesque } from 'next/font/google';
import {
  ArrowRight, ArrowDown, CalendarDays, MessageCircle, FileText, Smile,
  BarChart3, Accessibility, ShieldCheck, Lock, Check, Sparkles, Clock,
  Users, Heart, PlusCircle, TrendingUp,
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

// ─── Hero visual (real photo in a circle + floating dashboard cards) ─────────

function CardArrow() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-alt text-muted-foreground" aria-hidden="true">
      <ArrowRight className="h-3 w-3" />
    </span>
  );
}

function FinanceCard() {
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-card">
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
            <span className="h-2 w-2 rounded-[3px] bg-amber-400" aria-hidden="true" /> À vencer
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
  { h: 66, c: 'bg-sky-500' },
  { h: 90, c: 'bg-amber-500' },
  { h: 58, c: 'bg-emerald-600' },
  { h: 74, c: 'bg-violet-400' },
];

function AppointmentsCard() {
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">Agendamentos</p>
        <CardArrow />
      </div>
      <div className="mb-2 flex items-end justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" aria-hidden="true">
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
    <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">Atendimentos</p>
        <CardArrow />
      </div>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8" className="stroke-sky-200 dark:stroke-sky-900" />
          <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray="118 163" className="stroke-primary" />
        </svg>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>Total</span><span className="tabular-nums">1.500</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-primary" aria-hidden="true" /> Particular
            </span>
            <span className="font-semibold tabular-nums text-foreground">1.400</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-sky-400" aria-hidden="true" /> Convênios
            </span>
            <span className="font-semibold tabular-nums text-foreground">100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsPill() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface py-2 pl-2 pr-4 shadow-card-hover">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" aria-hidden="true">
        <MessageCircle className="h-3.5 w-3.5" />
      </span>
      <span className="text-xs font-semibold">Paciente confirmou<span className="text-muted-foreground"> · WhatsApp</span></span>
    </div>
  );
}

function RevenuePill() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface py-2 pl-2 pr-4 shadow-card-hover">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" aria-hidden="true">
        <TrendingUp className="h-3.5 w-3.5" />
      </span>
      <span className="text-xs font-semibold">R$ 4.820<span className="text-muted-foreground"> recebidos hoje</span></span>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-fit" aria-hidden="true">
      {/* soft color blobs */}
      <div className="absolute -left-10 -top-8 h-40 w-40 rounded-full bg-amber-200/50 blur-2xl dark:bg-amber-400/10" />
      <div className="absolute -bottom-10 -right-8 h-44 w-44 rounded-full bg-sky-200/50 blur-2xl dark:bg-sky-400/10" />
      {/* decorative ring */}
      <div className="absolute -inset-5 rounded-full border border-primary/15 sm:-inset-7" />

      {/* photo */}
      <div className="relative h-72 w-72 overflow-hidden rounded-full border-8 border-surface shadow-2xl sm:h-80 sm:w-80 lg:h-[400px] lg:w-[400px]">
        <Image
          src="/hero-professional.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 400px, 320px"
          className="object-cover object-top"
        />
      </div>

      {/* pills anchored to the circle */}
      <div className="absolute -top-3 right-0 animate-float-slow lg:-right-6"><WhatsPill /></div>
      <div className="absolute -bottom-3 left-0 animate-float lg:-left-8"><RevenuePill /></div>
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
          'radial-gradient(ellipse 80% 60% at 70% -10%, hsl(var(--primary) / 0.08), transparent), radial-gradient(ellipse 50% 40% at 5% 105%, hsl(38 92% 55% / 0.07), transparent), radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
        backgroundSize: 'auto, auto, 28px 28px',
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

        <div className="animate-fade-in-up py-4" style={{ animationDelay: '280ms' }}>
          <HeroVisual />
        </div>
      </div>

      {/* Dashboard preview: clean grid, no overlaps */}
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-20">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          O painel da sua clínica
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="animate-fade-in-up" style={{ animationDelay: '360ms' }}><AppointmentsCard /></div>
          <div className="animate-fade-in-up" style={{ animationDelay: '420ms' }}><FinanceCard /></div>
          <div className="animate-fade-in-up max-lg:hidden" style={{ animationDelay: '480ms' }}><AttendanceCard /></div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ─────────────────────────────────────────────────────────────

function TrustStrip() {
  const items = [
    { icon: ShieldCheck, label: 'LGPD por padrão', color: 'text-emerald-600 dark:text-emerald-400' },
    { icon: Lock, label: 'CPF e telefone criptografados', color: 'text-sky-600 dark:text-sky-400' },
    { icon: Accessibility, label: 'Acessibilidade WCAG 2.1 AA', color: 'text-violet-600 dark:text-violet-400' },
    { icon: Heart, label: 'Feito no Brasil', color: 'text-rose-500 dark:text-rose-400' },
  ];
  return (
    <section aria-label="Segurança e conformidade" className="border-y border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 sm:px-6">
        {items.map(({ icon: Icon, label, color }) => (
          <span key={label} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
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
      chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp automático',
      text: 'O paciente recebe a confirmação assim que o horário é marcado e um lembrete no dia anterior. A recepção não precisa digitar mensagem nenhuma.',
      chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    },
    {
      icon: FileText,
      title: 'Orçamentos que fecham',
      text: 'Monte o orçamento em minutos, envie por link ou PDF com a sua marca e acompanhe o status: visualizado, aceito, pago. Com registro de pagamento parcial.',
      chip: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    },
    {
      icon: Smile,
      title: 'Ficha clínica completa',
      text: 'Histórico de atendimentos, odontograma interativo dente a dente e a situação financeira do paciente reunidos em uma única tela.',
      chip: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    },
    {
      icon: BarChart3,
      title: 'Financeiro sem planilha',
      text: 'Indicadores do dia, atendimentos da semana e conversão de orçamentos direto no dashboard. Nada de exportar relatório para saber como está o mês.',
      chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    },
    {
      icon: Accessibility,
      title: 'Acessibilidade levada a sério',
      text: 'Navegação por teclado, compatibilidade com leitores de tela, alto contraste e modo escuro. Toda a equipe consegue usar o sistema.',
      chip: 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
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
          {features.map(({ icon: Icon, title, text, chip }, i) => (
            <div key={title} className="flex gap-5 border-t border-border py-8 sm:py-9">
              <span className="font-mono text-sm font-medium tabular-nums text-muted-foreground" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className={`${display.className} flex items-center gap-3 text-lg font-bold tracking-tight`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${chip}`}>
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
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
      chip: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
      accent: 'text-sky-600 dark:text-sky-400',
    },
    {
      icon: Smile,
      who: 'Para o profissional',
      title: 'O prontuário na ponta dos dedos',
      points: ['Odontograma interativo por dente', 'Histórico completo de atendimentos', 'Agenda do dia com um olhar'],
      chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: Users,
      who: 'Para quem gerencia',
      title: 'O dinheiro deixa de ser mistério',
      points: ['Conversão de orçamentos em tempo real', 'Pagamentos e saldo por paciente', 'Dados protegidos conforme a LGPD'],
      chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
      accent: 'text-violet-600 dark:text-violet-400',
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
          {personas.map(({ icon: Icon, who, title, points, chip, accent }) => (
            <article key={who} className="rounded-2xl border border-border bg-background p-6 shadow-card">
              <p className={`flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider ${accent}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${chip}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {who}
              </p>
              <h3 className={`${display.className} mt-4 text-xl font-bold tracking-tight`}>{title}</h3>
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
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Conformidade com a LGPD</li>
            <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> Dados sensíveis criptografados</li>
            <li className="flex items-center gap-2"><Accessibility className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" /> Acessibilidade WCAG 2.1 AA</li>
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
