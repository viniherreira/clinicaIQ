/**
 * DreamClin marketing landing page (rendered at `/` for signed-out visitors).
 *
 * Direção: SaaS de saúde profissional, limpo e confiante, no azul-petróleo e
 * marinho da marca, com a fonte do manual (Inter). O produto é o herói: em vez
 * de foto de banco de imagens, uma janela do sistema com o funil, e os cartões
 * flutuando mostram a promessa (o WhatsApp vira lead; agendou, o card anda).
 *
 * A página vende três produtos — Agenda, CRM e Completo — e conta a história
 * que só o Completo entrega: do primeiro "oi" no WhatsApp ao tratamento
 * fechado, com o funil andando sozinho pela agenda.
 * Spec: docs/specs/2026-10-26-planos-teste-e-funis-design.md
 *
 * Texto honesto: nada de depoimento ou número inventado. Os nomes na janela do
 * sistema são ilustração. Prazo do teste e preços vêm do código e do banco, os
 * mesmos que o cadastro e a cobrança usam. Movimento: fade-in-up escalonado e
 * flutuação leve, só CSS (e desligado em prefers-reduced-motion).
 */
import Link from 'next/link';
import {
  Accessibility, ArrowRight, BadgeCheck, Bot, CalendarCheck, CalendarDays, Check, FileText,
  Globe, Heart, Inbox, KanbanSquare, ListChecks, Lock, Megaphone, MessageCircle, ShieldCheck, Smile,
  Sparkles, Stethoscope, Trophy, Wallet,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { companyLine, salesWhatsAppUrl } from '@/lib/company';
import { TRIAL_DAYS } from '@/lib/subscription';
import { DEFAULT_CHOICE, productPriceCents, PRODUCT_INFO, signUpHref, type Product } from '@/lib/products';
import { loadPublicPlans, Pricing, type PublicPlan } from './pricing-section';

const TESTAR = signUpHref(DEFAULT_CHOICE.product, DEFAULT_CHOICE.tier);

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const navLink =
  'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="DreamClin, página inicial">
          <Logo size="md" />
        </Link>

        <nav aria-label="Menu da página" className="hidden items-center gap-1 lg:flex">
          <a href="#produtos" className={navLink}>Produtos</a>
          <a href="#como-funciona" className={navLink}>Como funciona</a>
          <a href="#recursos" className={navLink}>Recursos</a>
          <a href="#planos" className={navLink}>Preços</a>
          <a href="#perguntas" className={navLink}>Perguntas</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="btn-ghost btn-md !rounded-full max-sm:hidden">Entrar</Link>
          <Link href={TESTAR} className="btn-primary btn-md !rounded-full shadow-md shadow-primary/25">
            Testar grátis
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

const LEADS: { coluna: string; cor: string; cards: { nome: string; meta: string; tag?: string; valor?: string }[] }[] = [
  {
    coluna: 'Novo',
    cor: 'bg-slate-400',
    cards: [
      { nome: 'Mariana Lopes', meta: 'WhatsApp · agora', tag: 'Clareamento' },
      { nome: 'Rafael Souza', meta: 'Instagram · 12 min', tag: 'Implante' },
    ],
  },
  {
    coluna: 'Avaliação agendada',
    cor: 'bg-teal-500',
    cards: [
      { nome: 'Juliana Prado', meta: 'Qui 14:30 · Dra. Paula', tag: 'Ortodontia' },
      { nome: 'Carlos Mendes', meta: 'Sex 09:00 · Dr. André' },
    ],
  },
  {
    coluna: 'Em negociação',
    cor: 'bg-amber-500',
    cards: [
      { nome: 'Beatriz Lima', meta: 'Orçamento visualizado', valor: 'R$ 6.500' },
      { nome: 'Pedro Alves', meta: 'Retomar na sexta', valor: 'R$ 2.900' },
    ],
  },
];

/** A janela do sistema, ilustrativa: o funil com cards e as duas pontas da promessa. */
function ProductShowcase() {
  return (
    <div className="relative">
      <p className="sr-only">
        Ilustração do DreamClin: o funil do CRM com os contatos que chegaram pelo WhatsApp, os que agendaram a avaliação e os
        que estão negociando o orçamento.
      </p>
      <div aria-hidden="true" className="relative sm:pt-24">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-primary/10">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 flex-1 truncate rounded-md bg-surface-alt px-2.5 py-1 text-[11px] text-muted-foreground">
              dreamclin.com/crm
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 bg-board p-3 sm:p-4">
            {LEADS.map((c) => (
              <div key={c.coluna} className="min-w-0">
                <p className="mb-2 flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wide text-heading sm:text-[11px]">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.cor}`} />
                  {c.coluna}
                </p>
                <div className="space-y-2">
                  {c.cards.map((card) => (
                    <div key={card.nome} className="rounded-lg border border-border bg-surface p-2 shadow-sm sm:p-2.5">
                      <p className="truncate text-[11px] font-semibold sm:text-xs">{card.nome}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">{card.meta}</p>
                      {(card.tag || card.valor) && (
                        <p className="mt-1.5 flex items-center justify-between gap-1">
                          {card.tag && (
                            <span className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary-hover dark:text-sky-300 sm:text-[10px]">
                              {card.tag}
                            </span>
                          )}
                          {card.valor && <span className="ml-auto text-[10px] font-bold tabular-nums sm:text-[11px]">{card.valor}</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Entrou pelo WhatsApp: virou lead sozinho. */}
        <div className="animate-float absolute -left-4 top-0 z-10 hidden w-60 rounded-xl border border-border bg-surface p-3 shadow-xl sm:block lg:-left-10">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · agora
          </p>
          <p className="mt-1.5 rounded-lg rounded-tl-sm bg-surface-alt px-2.5 py-1.5 text-xs">Oi! Quanto fica o clareamento?</p>
          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary-hover dark:text-sky-300">
            <ArrowRight className="h-3 w-3" /> Virou lead em Captação › Novo
          </p>
        </div>

        {/* Agendou na agenda: o card passou de funil. */}
        <div className="animate-float-slow absolute -bottom-10 -right-4 z-10 hidden w-64 rounded-xl border border-border bg-surface p-3 shadow-xl sm:block lg:-right-8">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
              <CalendarCheck className="h-4 w-4" />
            </span>
            Avaliação marcada · qui, 14:30
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            O card foi sozinho para <strong className="font-semibold text-foreground">Agendados</strong> e a confirmação saiu no
            WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const provas = ['Sem cartão de crédito', 'Cancele quando quiser', 'Sem taxa de instalação'];
  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 75% -10%, hsl(var(--primary) / 0.10), transparent), radial-gradient(ellipse 50% 40% at 0% 100%, hsl(38 92% 55% / 0.06), transparent), radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
        backgroundSize: 'auto, auto, 28px 28px',
      }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pb-28 lg:pt-20">
        <div>
          <p className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary-hover dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Agenda + CRM com WhatsApp oficial · {TRIAL_DAYS} dias grátis
          </p>

          <h1
            className="animate-fade-in-up mt-5 text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.5rem]"
            style={{ animationDelay: '80ms' }}
          >
            Do primeiro <span className="text-primary">“oi” no WhatsApp</span> ao tratamento fechado
          </h1>

          <p className="animate-fade-in-up mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ animationDelay: '160ms' }}>
            O sistema para clínicas odontológicas e de estética que junta agenda, prontuário, orçamentos e um CRM no WhatsApp
            oficial da Meta. Quem chama vira lead sozinho; quando a recepção agenda, o funil anda junto.
          </p>

          <div className="animate-fade-in-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '240ms' }}>
            <Link
              href={TESTAR}
              className="btn-primary !h-12 !rounded-full px-7 !text-base shadow-lg shadow-primary/30 transition-transform hover:scale-[1.03]"
            >
              Testar grátis por {TRIAL_DAYS} dias
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#planos" className="btn-outline !h-12 !rounded-full px-6 !text-base">
              Ver planos e preços
            </a>
          </div>

          <ul className="animate-fade-in-up mt-5 flex flex-wrap gap-x-5 gap-y-2" style={{ animationDelay: '320ms' }}>
            {provas.map((p) => (
              <li key={p} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-fade-in-up px-2 sm:px-6 lg:px-0" style={{ animationDelay: '200ms' }}>
          <ProductShowcase />
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ─────────────────────────────────────────────────────────────

function TrustStrip() {
  const items = [
    { icon: BadgeCheck, label: 'API oficial do WhatsApp (Meta)', color: 'text-emerald-600 dark:text-emerald-400' },
    { icon: ShieldCheck, label: 'LGPD por padrão', color: 'text-emerald-600 dark:text-emerald-400' },
    { icon: Lock, label: 'CPF e telefone criptografados', color: 'text-blue-800 dark:text-blue-400' },
    { icon: Accessibility, label: 'Acessibilidade WCAG 2.1 AA', color: 'text-teal-700 dark:text-teal-400' },
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

// ─── Produtos ────────────────────────────────────────────────────────────────

const ICONE: Record<Product, typeof CalendarDays> = { COMPLETO: Trophy, AGENDA: CalendarDays, CRM: KanbanSquare };

function Products({ plans }: { plans: PublicPlan[] }) {
  // "A partir de": o menor preço do produto entre os tamanhos à venda.
  const aPartir = (p: Product) => {
    const precos = plans.map((plan) => productPriceCents(plan, p)).filter((v) => v > 0);
    return precos.length ? Math.min(...precos) : null;
  };
  const ordem: Product[] = ['AGENDA', 'COMPLETO', 'CRM'];
  return (
    <section id="produtos" aria-labelledby="produtos-titulo" className="scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Produtos</p>
          <h2 id="produtos-titulo" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Um sistema, do jeito que a sua clínica precisa
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Comece pela rotina, pela captação ou pelos dois juntos. Dá para trocar de plano a qualquer momento, sem perder nada.
          </p>
        </div>

        <ul className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {ordem.map((p) => {
            const Icon = ICONE[p];
            const destaque = p === 'COMPLETO';
            const preco = aPartir(p);
            return (
              <li key={p} className={destaque ? 'lg:-my-3' : undefined}>
                <article
                  aria-labelledby={`produto-${p}`}
                  className={`relative flex h-full flex-col rounded-3xl p-7 ${
                    destaque
                      ? 'bg-brand-gradient text-white shadow-xl shadow-primary/20'
                      : 'border border-border bg-surface shadow-card'
                  }`}
                >
                  {destaque && (
                    <span className="absolute right-6 top-6 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                      Mais completo
                    </span>
                  )}
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      destaque ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary-hover dark:text-sky-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 id={`produto-${p}`} className={`mt-5 text-2xl font-bold tracking-tight ${destaque ? 'text-white' : ''}`}>
                    {PRODUCT_INFO[p].name}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${destaque ? 'text-white/85' : 'text-muted-foreground'}`}>
                    {PRODUCT_INFO[p].tagline}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {PRODUCT_INFO[p].includes.map((f) => (
                      <li key={f} className="flex gap-2.5 text-sm">
                        <Check
                          className={`mt-0.5 h-4 w-4 shrink-0 ${destaque ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`}
                          aria-hidden="true"
                        />
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                  {preco !== null && (
                    <p className={`mt-6 text-sm ${destaque ? 'text-white/85' : 'text-muted-foreground'}`}>
                      a partir de{' '}
                      <span className={`text-2xl font-bold tabular-nums ${destaque ? 'text-white' : 'text-foreground'}`}>{brl(preco)}</span>
                      /mês
                    </p>
                  )}
                  <a
                    href={`#planos-${p.toLowerCase()}`}
                    className={`mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      destaque
                        ? 'bg-white text-teal-800 hover:bg-white/90 focus-visible:outline-white'
                        : 'border border-border hover:border-primary/50 hover:text-primary-hover focus-visible:outline-ring'
                    }`}
                  >
                    Ver planos do {PRODUCT_INFO[p].name}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ─── Como funciona: o funil que anda sozinho ─────────────────────────────────

function Journey() {
  const passos = [
    {
      icon: MessageCircle,
      modulo: 'CRM',
      titulo: 'Chamou no WhatsApp',
      texto: 'Quem escreve para o número da clínica vira um card em Captação, com a conversa junto. Ninguém precisa cadastrar.',
    },
    {
      icon: CalendarCheck,
      modulo: 'Agenda',
      titulo: 'Agendou a avaliação',
      texto: 'A recepção marca na agenda e o card passa sozinho para Agendados. A confirmação e os lembretes saem pelo WhatsApp.',
    },
    {
      icon: Stethoscope,
      modulo: 'Agenda',
      titulo: 'Veio e recebeu o orçamento',
      texto: 'Marcou que compareceu, o card anda. Criou o orçamento, ele vai para Em negociação, com tarefa para quem cuida.',
    },
    {
      icon: Trophy,
      modulo: 'CRM',
      titulo: 'Aprovou e fechou',
      texto: 'Aprovado pelo link, o card fecha com o valor do tratamento, e o painel mostra quanto o funil trouxe no mês.',
    },
  ];
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-20 border-y border-border bg-surface py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Como funciona</p>
          <h2 id="como-funciona-titulo" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            O funil que anda sozinho com a agenda
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            No Completo, a agenda e o CRM conversam. A recepção trabalha onde já trabalha, e o funil se atualiza sem ninguém
            arrastar card.
          </p>
        </div>

        <ol className="relative mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <span aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 lg:block" />
          {passos.map(({ icon: Icon, modulo, titulo, texto }, i) => (
            <li key={titulo} className="relative">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lg shadow-primary/25">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="tabular-nums">Passo {i + 1}</span>
                <span aria-hidden="true">·</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 normal-case tracking-normal text-primary-hover dark:text-sky-300">{modulo}</span>
              </p>
              <h3 className="mt-2 text-lg font-bold tracking-tight">{titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 rounded-2xl border border-border bg-background px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">Desmarcou ou faltou?</strong> O card vai para “Desmarcou ou faltou” com a
          tarefa de reagendar, e volta sozinho quando marcar de novo. Perder um negócio nunca é automático: quem decide é a
          equipe.
        </p>
      </div>
    </section>
  );
}

// ─── Recursos ────────────────────────────────────────────────────────────────

function Features() {
  const grupos = [
    {
      produto: 'Agenda',
      titulo: 'Para a rotina da clínica',
      itens: [
        { icon: CalendarDays, t: 'Agenda por profissional', d: 'Dia, semana e mês, com expediente na grade, aviso de conflito e sala de espera.' },
        { icon: Globe, t: 'Agendamento online', d: 'Um link para o paciente marcar sozinho nos horários livres que você liberar.' },
        { icon: FileText, t: 'Orçamentos que fecham', d: 'Monte em minutos, envie por link ou PDF com a sua marca e veja quando foi aceito.' },
        { icon: Smile, t: 'Prontuário com odontograma', d: 'Histórico, odontograma dente a dente e a situação financeira numa tela só.' },
        { icon: Wallet, t: 'Financeiro sem planilha', d: 'Recebimentos, parcelas e indicadores do mês direto no painel.' },
      ],
    },
    {
      produto: 'CRM',
      titulo: 'Para captar pacientes',
      itens: [
        { icon: KanbanSquare, t: 'Funis em quadro', d: 'Vários funis, etapas que você edita, filtros por tag, origem e responsável.' },
        { icon: Inbox, t: 'Conversas da equipe', d: 'O WhatsApp da clínica no computador, com toda a recepção no mesmo número.' },
        { icon: Bot, t: 'Robô de atendimento', d: 'Responde na hora com botões, pergunta o que importa e chama a equipe.' },
        { icon: Megaphone, t: 'Transmissões', d: 'Mensagens para uma tag, etapa ou funil, só para quem aceitou receber.' },
        { icon: ListChecks, t: 'Tarefas e painel de vendas', d: 'Ninguém fica sem retorno, e você vê de onde vêm e para onde vão os leads.' },
      ],
    },
  ];
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" className="scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Recursos</p>
          <h2 id="recursos-titulo" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Tudo o que a clínica usa no dia a dia
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Desenhado para o trabalho real: a recepção agenda em segundos, o profissional acha o prontuário e quem gerencia vê o
            dinheiro e a captação.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {grupos.map((g) => (
            <section key={g.produto} aria-labelledby={`recursos-${g.produto}`} className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
              <p className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-hover dark:text-sky-300">{g.produto}</p>
              <h3 id={`recursos-${g.produto}`} className="mt-3 text-xl font-bold tracking-tight">
                {g.titulo}
              </h3>
              <ul className="mt-6 divide-y divide-border">
                {g.itens.map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-alt text-primary-hover dark:text-sky-300">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-semibold">{t}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Accessibility className="h-4 w-4 text-primary" aria-hidden="true" />
          Navegação por teclado, leitor de tela, alto contraste e modo escuro em todas as telas.
        </p>
      </div>
    </section>
  );
}

// ─── WhatsApp oficial ────────────────────────────────────────────────────────

/** A mensagem como o paciente vê, com os botões. Ilustração: nada aqui é clicável. */
function WhatsAppMock() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border border-border bg-surface p-3 shadow-2xl" aria-hidden="true">
      <div className="flex items-center gap-2.5 rounded-t-[1.4rem] bg-emerald-800 px-4 py-3 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-800">CS</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-sm font-semibold">
            Clínica Sorriso <BadgeCheck className="h-3.5 w-3.5" />
          </span>
          <span className="block text-[11px] text-white">Conta comercial oficial</span>
        </span>
      </div>
      <div className="space-y-2 rounded-b-[1.4rem] bg-board p-3">
        <div className="max-w-[85%] overflow-hidden rounded-lg rounded-tl-sm bg-surface text-[13px] shadow-sm">
          <p className="px-3 py-2 leading-relaxed">
            Olá, Ana! Passando para lembrar do seu horário na <strong>Clínica Sorriso</strong>:
            <br />
            <br />📅 quinta-feira, 28/05 às 14:30
            <br />👩‍⚕️ Dra. Paula (Limpeza)
          </p>
          <div className="divide-y divide-border border-t border-border text-center text-[13px] font-medium text-primary">
            <p className="py-2">Confirmar</p>
            <p className="py-2">Reagendar</p>
            <p className="py-2">Cancelar</p>
          </div>
        </div>
        <div className="ml-auto w-fit rounded-lg rounded-tr-sm bg-bubble-out px-3 py-2 text-[13px] shadow-sm">Confirmar</div>
        <div className="mx-auto w-fit rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm dark:text-emerald-400">
          ✓ Consulta confirmada na agenda
        </div>
      </div>
    </div>
  );
}

function WhatsAppOficial() {
  const pontos = [
    'Mensagens saem do número da clínica, com o nome dela, sem QR code nem celular ligado',
    'Confirmação na hora em que marca e lembretes 1 semana, 3 dias, 1 dia antes ou no dia: você escolhe',
    'Botões Confirmar, Reagendar e Cancelar: a resposta cai sozinha na agenda',
    'O celular continua funcionando no WhatsApp Business, junto com o sistema',
  ];
  return (
    <section id="whatsapp-oficial" aria-labelledby="whatsapp-oficial-titulo" className="scroll-mt-20 border-t border-border py-16 lg:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> API oficial do WhatsApp (Meta)
          </p>
          <h2 id="whatsapp-oficial-titulo" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            O WhatsApp da sua clínica, do jeito oficial
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            O DreamClin conecta o número da clínica direto na Meta, o mesmo caminho que as grandes empresas usam: estável, sem
            gambiarra e sem o risco de um aparelho desconectado deixar paciente sem aviso. Conectar leva poucos minutos.
          </p>
          <ul className="mt-6 space-y-3">
            {pontos.map((p) => (
              <li key={p} className="flex gap-3 text-sm sm:text-[15px]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="leading-snug">{p}</span>
              </li>
            ))}
          </ul>
          <Link href="/ajuda/conectar-whatsapp" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-2">
            Veja o passo a passo para conectar
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <WhatsAppMock />
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FAQ() {
  const faqs = [
    {
      q: 'Como funciona o teste grátis?',
      a: `Você escolhe o plano, cria a conta e usa tudo por ${TRIAL_DAYS} dias, sem cartão. Durante o teste dá para trocar de plano à vontade. Se assinar antes do fim, a primeira cobrança só vence quando o teste acaba.`,
    },
    {
      q: 'O que acontece quando o teste acaba?',
      a: 'Se você assinou, segue usando sem interrupção. Se não, nada é cobrado: a conta fica só para consulta, com tudo guardado, até você escolher um plano. Avisamos dentro do sistema nos últimos dias do teste.',
    },
    {
      q: 'Qual a diferença entre Agenda, CRM e Completo?',
      a: 'A Agenda é a rotina da clínica: agenda, pacientes, prontuário, orçamentos, financeiro e os avisos no WhatsApp. O CRM é a captação: funis, conversas do WhatsApp com a equipe, robô e transmissões. O Completo junta os dois, integrados, e sai mais barato que comprar separado.',
    },
    {
      q: 'Posso contratar só o CRM e continuar com meu sistema de agenda?',
      a: 'Pode. O CRM funciona sozinho, com funis, WhatsApp oficial, robô e transmissões; as etapas você move no quadro. A parte de o card andar sozinho quando agenda, falta ou aprova o orçamento é do Completo, porque depende da agenda do DreamClin.',
    },
    {
      q: 'Posso trocar de plano depois?',
      a: 'Quando quiser, pela tela de Plano. Subir de plano ou acrescentar o CRM vale na hora; o valor novo entra na próxima fatura, sem cobrança proporcional. Ao trocar de produto, nada é apagado: leads, conversas e pacientes ficam guardados.',
    },
    {
      q: 'Tem fidelidade ou multa para cancelar?',
      a: 'Não. Você cancela pela própria tela de Plano e continua com acesso até o fim do mês já pago. Também não há taxa de instalação.',
    },
    {
      q: 'O WhatsApp é oficial mesmo? Quanto custa?',
      a: 'É a API oficial do WhatsApp, da Meta, no número da sua clínica, sem QR code nem celular ligado. As conversas são cobradas pela Meta direto da clínica, conforme a tabela dela; responder quem escreveu nas últimas 24 horas não tem custo.',
    },
    {
      q: 'Meus dados e os dos pacientes estão seguros?',
      a: 'Sim. CPF e telefone são criptografados (AES-256), o sistema segue a LGPD desde a arquitetura, faz backup diário e cada clínica só acessa os próprios dados.',
    },
    {
      q: 'Consigo trazer meus pacientes e leads de outro sistema?',
      a: 'Sim. Os leads entram por planilha no próprio CRM, com funil, etapa, tags e responsável. Para os pacientes, se você tiver uma planilha exportada do sistema atual, a gente ajuda na migração.',
    },
    {
      q: 'Preciso instalar alguma coisa?',
      a: 'Não. O DreamClin roda no navegador, no computador da recepção, no tablet do consultório e no celular.',
    },
  ];
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo" className="scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Perguntas frequentes</p>
          <h2 id="perguntas-titulo" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Ficou alguma dúvida?
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Teste, planos, troca e cancelamento: tudo aqui. Se faltar alguma coisa, fale com a gente.
          </p>
        </div>

        <div className="space-y-3">
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

function FinalCTA({ whatsapp }: { whatsapp: string | null }) {
  return (
    <section aria-labelledby="cta-final" className="px-4 pb-16 sm:px-6 lg:pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-gradient px-6 py-14 text-center shadow-xl sm:px-12 lg:py-20">
        {/* Decorative rings */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full border border-white/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full border border-white/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full border border-white/10" />

        <h2 id="cta-final" className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Nenhum paciente perdido no WhatsApp. Nenhuma cadeira vazia por falta.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/85">
          Crie a conta, conecte o WhatsApp e faça o primeiro agendamento ainda hoje. {TRIAL_DAYS} dias grátis, sem cartão e sem
          fidelidade.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* O degradê não muda com o tema, então o teal do botão também não. */}
          <Link
            href={TESTAR}
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-teal-800 shadow-lg transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Testar grátis por {TRIAL_DAYS} dias
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Falar com a gente
              <span className="sr-only"> no WhatsApp (abre em nova aba)</span>
            </a>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-base font-medium text-white/90 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Já tenho conta
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Fale com a gente (WhatsApp de vendas) ───────────────────────────────────

/**
 * Botão fixo no canto para conversar com a equipe. Dono de clínica raramente
 * assina sistema sem falar com alguém antes. Sem número configurado
 * (`NEXT_PUBLIC_COMPANY_WHATSAPP`), não aparece.
 */
function WhatsAppFloat({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-4 right-4 z-50 inline-flex h-14 items-center gap-2 rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 transition-transform hover:scale-[1.04] hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:bottom-6 sm:right-6 sm:px-5"
    >
      <MessageCircle className="h-6 w-6 shrink-0" aria-hidden="true" />
      <span className="max-sm:sr-only">Fale com a gente</span>
      <span className="sr-only"> pelo WhatsApp (abre em nova aba)</span>
    </a>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

const footLink = 'rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function Footer({ whatsapp }: { whatsapp: string | null }) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size="md" />
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Agenda, prontuário, orçamentos e CRM com WhatsApp oficial para clínicas odontológicas e de estética.
          </p>
        </div>

        <nav aria-label="Produtos">
          <p className="text-sm font-semibold">Produtos</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><a href="#planos-completo" className={footLink}>Completo</a></li>
            <li><a href="#planos-agenda" className={footLink}>Agenda</a></li>
            <li><a href="#planos-crm" className={footLink}>CRM</a></li>
            <li><a href="#como-funciona" className={footLink}>Como funciona</a></li>
            <li><a href="#planos" className={footLink}>Preços</a></li>
          </ul>
        </nav>

        <nav aria-label="Ajuda">
          <p className="text-sm font-semibold">Ajuda</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><a href="#perguntas" className={footLink}>Perguntas frequentes</a></li>
            <li><Link href="/ajuda/conectar-whatsapp" className={footLink}>Como conectar o WhatsApp</Link></li>
            <li><Link href={TESTAR} className={footLink}>Criar conta</Link></li>
            <li><Link href="/sign-in" className={footLink}>Entrar</Link></li>
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={footLink}>
                  Fale com a gente no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
                </a>
              </li>
            )}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold">Compromissos</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Conformidade com a LGPD</li>
            <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-blue-800 dark:text-blue-400" aria-hidden="true" /> Dados sensíveis criptografados</li>
            <li className="flex items-center gap-2"><Accessibility className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" /> Acessibilidade WCAG 2.1 AA</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>
            © {new Date().getFullYear()} DreamClin{companyLine() ? ` · ${companyLine()}` : ''}. Todos os direitos reservados.
          </p>
          <nav aria-label="Páginas legais" className="flex items-center gap-4">
            <Link href="/privacidade" className={footLink}>Privacidade</Link>
            <Link href="/termos" className={footLink}>Termos de uso</Link>
            <span>Feito no Brasil 🇧🇷</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export async function LandingPage() {
  const whatsapp = salesWhatsAppUrl();
  const plans = await loadPublicPlans();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main-content">
        <Hero />
        <TrustStrip />
        <Products plans={plans} />
        <Journey />
        <Features />
        <WhatsAppOficial />
        <Pricing plans={plans} />
        <FAQ />
        <FinalCTA whatsapp={whatsapp} />
      </main>
      <Footer whatsapp={whatsapp} />
      {whatsapp && <WhatsAppFloat href={whatsapp} />}
    </div>
  );
}
