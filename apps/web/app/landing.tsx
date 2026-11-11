/**
 * DreamClin marketing landing page (rendered at `/` for signed-out visitors).
 *
 * Direção: a clínica vista de noite, que amanhece até o fechamento. O nome é
 * Dream, o D da logo parece uma lua e o símbolo já traz uma estrela: ele é o
 * objeto de luz da primeira tela, e o caminho do paciente vira uma constelação.
 *
 * A página vende três produtos, Agenda, CRM e Completo, e conta a história que
 * só o Completo entrega: do primeiro "oi" no WhatsApp ao tratamento fechado, com
 * o funil andando sozinho pela agenda.
 * Spec: docs/specs/2026-10-26-planos-teste-e-funis-design.md
 *
 * Texto honesto: nada de depoimento ou número inventado. Os nomes e valores nas
 * telas são ilustração, e a página diz isso. Prazo do teste e preços vêm do
 * código e do banco, os mesmos que o cadastro e a cobrança usam.
 * Estilos em `landing.css`, escopados em `.lp`.
 */
import Link from 'next/link';
import { Outfit } from 'next/font/google';
import {
  Accessibility, ArrowRight, BadgeCheck, Bot, CalendarCheck, Check, ClipboardCheck, Database, Heart, Inbox,
  KanbanSquare, ListChecks, Lock, Megaphone, MessageCircle, Plus, RefreshCcw, ShieldCheck, Trophy,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { COMPANY, salesWhatsAppUrl } from '@/lib/company';
import { TRIAL_DAYS } from '@/lib/subscription';
import { DEFAULT_CHOICE, productPriceCents, signUpHref, type Product } from '@/lib/products';
import { LandingMotion } from './landing-motion';
import { faqJsonLd, homeJsonLd, jsonLdHtml } from '@/lib/seo';
import { loadPublicPlans, Pricing, type PublicPlan } from './pricing-section';
import './landing.css';

// A fonte do nome na logo.
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' });

const TESTAR = signUpHref(DEFAULT_CHOICE.product, DEFAULT_CHOICE.tier);

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// ─── Desenhos ────────────────────────────────────────────────────────────────

/** O símbolo da logo com luz, e a estrela de quatro pontas usada no resto da página. */
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="gD" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C8EFD8" />
          <stop offset=".3" stopColor="#5EEAD4" />
          <stop offset=".7" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id="gB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7FA8EA" />
          <stop offset=".5" stopColor="#2E6FD9" />
          <stop offset="1" stopColor="#0F3B82" />
        </linearGradient>
        <radialGradient id="gH" cx=".38" cy=".32">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" stopColor="#C8EFD8" />
          <stop offset="1" stopColor="#A7E3C1" />
        </radialGradient>
        <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#5EEAD4" />
        </linearGradient>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A7E3C1" />
          <stop offset=".5" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#A7E3C1" />
        </linearGradient>
        <radialGradient id="vA" cx=".36" cy=".5" r=".7">
          <stop offset="0" stopColor="#0F766E" />
          <stop offset=".72" stopColor="#0F766E" />
          <stop offset="1" stopColor="#14B8A6" />
        </radialGradient>
        <radialGradient id="vB" cx=".64" cy=".5" r=".7">
          <stop offset="0" stopColor="#0F3B82" />
          <stop offset=".72" stopColor="#0F3B82" />
          <stop offset="1" stopColor="#2E6FD9" />
        </radialGradient>
        <clipPath id="vC">
          <circle cx="330" cy="330" r="330" />
        </clipPath>
        <symbol id="lp-star" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 1c1.4 6.4 3.6 8.6 11 11-7.4 2.4-9.6 4.6-11 11-1.4-6.4-3.6-8.6-11-11 7.4-2.4 9.6-4.6 11-11z" />
        </symbol>
      </defs>
    </svg>
  );
}

function Lua({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 635.5 565.5" aria-hidden="true">
      <g transform="translate(-5 -2.5)">
        <path fill="url(#gD)" d="M6 239V75.5C6 47 39 8 88 8H277C434.5 8 565.1 141 561 295C557 444.8 450 557 289 568L238 560C339 547 440.7 452 440 333C439.2 203 330.5 122 219 122C139.5 122 54 160 6 239Z" />
        <path fill="url(#gB)" d="M5 300C5 301 5 269.9 44.5 278C101.9 288.4 122.7 334.7 157 380C181.4 412.1 229.7 420.1 252 405.5C293.9 378 307 350.1 364 345C385.5 343.1 410.2 355.2 398 387C378.6 437.5 283.5 540.5 153 540.5H77C37.2 540.5 5 508.3 5 468.5Z" />
        <circle fill="url(#gH)" cx="227" cy="269.5" r="67.5" />
        <path className="tw" fill="url(#gS)" stroke="#FFFFFF" strokeWidth="8" strokeLinejoin="round" d="M575 7.5C589 56 591 58 635.5 72C591 86 589 88 575 136.5C561 88 559 86 514.5 72C559 58 561 56 575 7.5Z" />
      </g>
    </svg>
  );
}

/** Céu com semente fixa: o servidor e o navegador desenham as mesmas estrelas. */
const ESTRELAS = (() => {
  let semente = 7;
  const sorteio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 110 }, () => {
    const tamanho = sorteio();
    const x = sorteio();
    const y = sorteio();
    sorteio(); // era o atraso de cada estrela: fica para o céu não mudar de lugar
    return {
      x: `${(x * 100).toFixed(2)}%`,
      y: `${(y * 100).toFixed(2)}%`,
      r: tamanho < 0.8 ? 0.8 : tamanho < 0.96 ? 1.3 : 1.9,
    };
  });
})();
const CAMADAS = [0, 1, 2] as const;

function Ceu() {
  return (
    <div className="sky" aria-hidden="true">
      <i className="blob a" />
      <i className="blob b" />
      <i className="blob c" />
      <i className="blob d" />
      {/* Três camadas que piscam inteiras, em tempos diferentes: animar cada uma
          das 110 estrelas travava o celular (o Google mede isso). */}
      {CAMADAS.map((camada) => (
        <svg key={camada} className="stars">
          {ESTRELAS.filter((_, i) => i % CAMADAS.length === camada).map((e) => (
            <circle key={`${e.x}${e.y}`} cx={e.x} cy={e.y} r={e.r} />
          ))}
        </svg>
      ))}
      <i className="grain" />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="bar">
      <Link href="/" className="bar-logo" aria-label="DreamClin, página inicial">
        <Logo size="md" tone="white" />
      </Link>
      <nav aria-label="Menu da página">
        <a href="#como-funciona">Como funciona</a>
        <a href="#produtos">Produtos</a>
        <a href="#recursos">Recursos</a>
        <a href="#planos">Preços</a>
        <a href="#perguntas">Perguntas</a>
      </nav>
      <div className="end">
        <Link href="/sign-in">Entrar</Link>
        <Link href={TESTAR} className="btn btn-mint btn-sm">Testar grátis</Link>
      </div>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="hero">
      <Ceu />
      <div className="inner hero-in">
        <div>
          <h1>
            {/* O que o Google precisa ler no título; a frase grande é a da marca. */}
            <span className="kick">Sistema e CRM para clínicas odontológicas e de estética</span>
            Do <span className="oi">oi</span> ao
            <br />
            tratamento
            <br />
            fechado.
          </h1>
          <p className="lede">
            Agenda, prontuário, orçamentos e CRM no WhatsApp oficial da Meta, para clínicas odontológicas e de estética. Quem
            chama vira lead sozinho. Quando a recepção agenda, o funil anda junto.
          </p>
          <div className="acts">
            <Link href={TESTAR} className="btn btn-mint">
              Testar grátis por {TRIAL_DAYS} dias <ArrowRight className="ic" aria-hidden="true" />
            </Link>
            <a href="#planos" className="btn btn-glass">Ver planos e preços</a>
          </div>
          <ul className="proofs">
            {['Sem cartão de crédito', 'Cancele quando quiser', 'Sem taxa de instalação'].map((p) => (
              <li key={p}>
                <Check className="ic" aria-hidden="true" /> {p}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="stage"
          role="img"
          aria-label="O símbolo da DreamClin iluminado, com quatro cartões que mostram o caminho de uma paciente: a mensagem no WhatsApp, a consulta confirmada, o orçamento em negociação e o tratamento fechado. Nomes e valores fictícios."
        >
          <i className="halo" />
          <i className="orbit o1" />
          <i className="orbit o2" />
          <i className="comet" />
          <Lua className="moon" />
          <div className="fc f1">
            <div className="top"><MessageCircle className="ic" aria-hidden="true" /> WhatsApp, agora</div>
            <span className="say">Oi! Quanto fica o implante?</span>
          </div>
          <div className="fc f2">
            <div className="top"><CalendarCheck className="ic" aria-hidden="true" /> Agenda</div>
            <div className="row">
              <span><b>Beatriz Lima</b><br />Qui, 14:30</span>
              <span className="ok"><Check className="ic" aria-hidden="true" /> Confirmada</span>
            </div>
          </div>
          <div className="fc f3">
            <div className="top"><KanbanSquare className="ic" aria-hidden="true" /> Em negociação</div>
            <div className="row"><span>Orçamento visualizado</span><b className="num">R$ 6.500</b></div>
          </div>
          <div className="fc f4">
            <div className="top"><Trophy className="ic" aria-hidden="true" /> Fechado</div>
            <strong className="num">R$ 6.500</strong>Aprovado pelo link
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Faixa de confiança ──────────────────────────────────────────────────────

const CONFIANCA = [
  { icon: BadgeCheck, label: 'API oficial do WhatsApp (Meta)' },
  { icon: ShieldCheck, label: 'LGPD por padrão' },
  { icon: Lock, label: 'CPF e telefone criptografados' },
  { icon: Database, label: 'Dados separados por clínica' },
  { icon: Accessibility, label: 'Acessibilidade WCAG 2.1 AA' },
  { icon: Heart, label: 'Feito no Brasil' },
];

function TrustStrip() {
  const lista = (oculta: boolean) => (
    <ul aria-hidden={oculta || undefined}>
      {CONFIANCA.map(({ icon: Icon, label }) => (
        <li key={label}>
          <Icon className="ic" aria-hidden="true" /> {label}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="strip" aria-label="Segurança e conformidade">
      <div className="track">
        {lista(false)}
        {lista(true)}
      </div>
    </section>
  );
}

// ─── Como funciona: a constelação ────────────────────────────────────────────

function Journey() {
  const passos = [
    {
      modulo: 'CRM',
      titulo: 'Chamou no WhatsApp',
      texto: 'Quem escreve para o número da clínica vira um card em Captação, com a conversa junto. Ninguém precisa cadastrar.',
      mini: (
        <>
          <span className="bb">Oi! Quanto fica o implante?</span>
          <span className="rowx"><b>Beatriz Lima</b>Novo card</span>
        </>
      ),
    },
    {
      modulo: 'Agenda',
      titulo: 'Agendou a avaliação',
      texto: 'A recepção marca na agenda e o card passa sozinho para Agendados. A confirmação e os lembretes saem pelo WhatsApp.',
      mini: (
        <>
          <span className="rowx"><b>Qui, 14:30</b>Dra. Paula</span>
          <span className="bb me">Confirmar</span>
        </>
      ),
    },
    {
      modulo: 'Agenda',
      titulo: 'Veio e recebeu o orçamento',
      texto: 'Marcou que compareceu, o card anda. Criou o orçamento, ele vai para Em negociação, com tarefa para quem cuida.',
      mini: (
        <>
          <span className="rowx"><b>Implante</b><b className="num">R$ 6.500</b></span>
          <span className="rowx">Em negociação <ClipboardCheck className="ic" aria-hidden="true" /></span>
        </>
      ),
    },
    {
      modulo: 'CRM',
      titulo: 'Aprovou e fechou',
      texto: 'Aprovado pelo link, o card fecha com o valor do tratamento, e o painel mostra quanto o funil trouxe no mês.',
      mini: (
        <>
          <strong className="num">R$ 6.500</strong>
          <span>Fechado pelo link</span>
        </>
      ),
    },
  ];
  return (
    <section className="night inner" id="como-funciona" aria-labelledby="como-funciona-titulo">
      <div className="sec-head">
        <h2 id="como-funciona-titulo" data-r>A recepção marca.<br />O funil anda sozinho.</h2>
        <p className="lede" data-r style={{ '--i': 1 } as React.CSSProperties}>
          No Completo, a agenda e o CRM conversam. A recepção trabalha onde já trabalha, e o funil se atualiza sem ninguém
          arrastar card.
        </p>
      </div>
      <div className="con-wrap" id="lp-con">
        <svg className="con-line" aria-hidden="true"><path id="lp-con-path" pathLength={1} /></svg>
        <ol className="con">
          {passos.map(({ modulo, titulo, texto, mini }, i) => (
            <li key={titulo} className="stop" data-r style={{ '--i': i } as React.CSSProperties}>
              <svg className="pt" aria-hidden="true"><use href="#lp-star" /></svg>
              <div className="ccard">
                <span className="who">{modulo}</span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
                <div className="mini" aria-hidden="true">{mini}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="loop" data-r>
        <RefreshCcw className="ic" aria-hidden="true" />
        <span>
          <b>Desmarcou ou faltou?</b> O card vai para “Desmarcou ou faltou” com a tarefa de reagendar, e volta sozinho quando
          marcar de novo. Perder um negócio nunca é automático: quem decide é a equipe.
        </span>
      </p>
    </section>
  );
}

// ─── Produtos: Agenda + CRM = Completo ───────────────────────────────────────

function Products({ plans }: { plans: PublicPlan[] }) {
  // "A partir de": o menor preço do produto entre os tamanhos à venda.
  const aPartir = (p: Product) => {
    const precos = plans.map((plan) => productPriceCents(plan, p)).filter((v) => v > 0);
    return precos.length ? Math.min(...precos) : null;
  };
  const Preco = ({ produto }: { produto: Product }) => {
    const v = aPartir(produto);
    return v === null ? null : <p className="pz">a partir de<b className="num">{brl(v)}</b></p>;
  };
  const Lista = ({ itens }: { itens: string[] }) => (
    <ul>
      {itens.map((t) => (
        <li key={t}><Check className="ic" aria-hidden="true" /> {t}</li>
      ))}
    </ul>
  );
  return (
    <section className="night inner night-top0" id="produtos" aria-labelledby="produtos-titulo">
      <div className="sec-head">
        <h2 id="produtos-titulo" data-r>Um sistema, do jeito que a sua clínica precisa.</h2>
        <p className="lede" data-r style={{ '--i': 1 } as React.CSSProperties}>
          Comece pela rotina, pela captação ou pelos dois juntos. Dá para trocar de plano a qualquer momento, sem perder nada.
        </p>
      </div>
      <div className="venn" data-r>
        <svg viewBox="0 0 1090 660" aria-hidden="true">
          <circle cx="330" cy="330" r="330" fill="url(#vA)" />
          <circle cx="760" cy="330" r="330" fill="url(#vB)" />
          <g clipPath="url(#vC)"><circle cx="760" cy="330" r="330" fill="#A7E3C1" /></g>
        </svg>
        <article className="vt v1">
          <h3><a href="#planos-agenda">Agenda</a></h3>
          <p>A rotina da clínica.</p>
          <Lista itens={['Agenda e agendamento online', 'Prontuário e odontograma', 'Orçamentos e financeiro', 'Lembretes no WhatsApp oficial']} />
          <Preco produto="AGENDA" />
        </article>
        <article className="vt v2">
          <h3>Completo</h3>
          <p>Os dois integrados. Só aqui o funil anda com a agenda.</p>
          <Preco produto="COMPLETO" />
          <a className="btn btn-teal" href="#planos-completo">Ver planos</a>
        </article>
        <article className="vt v3">
          <h3><a href="#planos-crm">CRM</a></h3>
          <p>A captação de pacientes.</p>
          <Lista itens={['Funis em quadro', 'WhatsApp oficial da equipe', 'Robô e transmissões', 'Tarefas e painel de vendas']} />
          <Preco produto="CRM" />
        </article>
      </div>
    </section>
  );
}

// ─── Recursos ────────────────────────────────────────────────────────────────

type Consulta = [topo: number, altura: number, cor: string, nome: string, detalhe: string];

const SEMANA: [string, Consulta[]][] = [
  ['Seg', [[4, 18, 'm', 'Ana Reis', 'Limpeza'], [26, 16, 'n', 'Carlos M.', 'Avaliação'], [56, 24, 'b', 'Paula T.', 'Canal']]],
  ['Ter', [[12, 20, 't', 'Helena D.', 'Harmonização'], [42, 16, 'm', 'Rui S.', 'Retorno'], [74, 18, 'n', 'Lia F.', 'Clareamento']]],
  ['Qua', [[2, 16, 'b', 'Tiago R.', 'Avaliação'], [24, 22, 'n', 'Marta G.', 'Implante'], [64, 18, 'm', 'Davi C.', 'Limpeza']]],
  ['Qui', [[8, 16, 'm', 'Helena D.', 'Retorno'], [50, 20, 't now', 'Beatriz L.', '14:30, Avaliação'], [76, 16, 'n', 'Juliana P.', 'Ortodontia']]],
  ['Sex', [[4, 20, 'n', 'Carlos M.', 'Sala de espera'], [34, 16, 'b', 'Sara N.', 'Avaliação'], [60, 26, 'm', 'Otávio B.', 'Implante']]],
];

function Semana() {
  return (
    <div className="week" aria-hidden="true">
      <span />
      {SEMANA.map(([dia]) => <div key={dia} className="hd">{dia}</div>)}
      <div className="hrs">{['08h', '10h', '12h', '14h', '16h', '18h'].map((h) => <span key={h}>{h}</span>)}</div>
      {SEMANA.map(([dia, consultas]) => (
        <div key={dia} className="day">
          {consultas.map(([topo, altura, cor, nome, detalhe]) => (
            <div key={nome + topo} className={`ev ${cor}`} style={{ top: `${topo}%`, height: `${altura}%` }}>
              {nome}<span>{detalhe}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const FACES = { o: '10,10 20,10 20,20 10,20', t: '0,0 30,0 20,10 10,10', b: '10,20 20,20 30,30 0,30', l: '0,0 10,10 10,20 0,30', r: '30,0 30,30 20,20 20,10' };
const MARCAS: Record<number, Partial<Record<keyof typeof FACES, string>>> = {
  16: { o: 'x' }, 24: { l: 'x', o: 'x' }, 36: { o: 'x', t: 'x', b: 'x', l: 'x', r: 'x' },
  14: { o: 'y' }, 46: { o: 'y', l: 'y' }, 26: { r: 'y' }, 11: { t: 'y' }, 37: { o: 'y' },
};

function Arcada({ dentes }: { dentes: number[] }) {
  return (
    <div className="arch">
      {dentes.map((n) => (
        <svg key={n} viewBox="-1 -1 32 32">
          {(Object.entries(FACES) as [keyof typeof FACES, string][]).map(([face, pontos]) => (
            <polygon key={face} points={pontos} className={MARCAS[n]?.[face] ?? ''} />
          ))}
        </svg>
      ))}
    </div>
  );
}

function Features() {
  return (
    <section className="sheet" id="recursos" aria-labelledby="recursos-titulo">
      <div className="inner">
        <div className="sec-head">
          <h2 id="recursos-titulo" data-r>Tudo o que a clínica usa no dia a dia.</h2>
          <p className="lede" data-r style={{ '--i': 1 } as React.CSSProperties}>
            A recepção agenda em segundos, o profissional acha o prontuário e quem gerencia vê o dinheiro entrar.
          </p>
        </div>
        <div className="bento">
          <article className="tile t-ag" data-r>
            <h3>Agenda por profissional</h3>
            <p>Dia, semana e mês, com expediente na grade, aviso de conflito e sala de espera.</p>
            <Semana />
          </article>
          <article className="tile t-od" data-r style={{ '--i': 1 } as React.CSSProperties}>
            <h3>Prontuário com odontograma</h3>
            <p>Odontograma por faces, anamnese, evoluções em linha do tempo e galeria. O plano de tratamento já vira orçamento.</p>
            <div className="teeth" aria-hidden="true">
              <Arcada dentes={[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]} />
              <Arcada dentes={[48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]} />
            </div>
            <p className="legend" aria-hidden="true">
              <span><i className="lg-x" />A tratar</span>
              <span><i className="lg-y" />Tratado</span>
            </p>
          </article>
          <article className="tile t-on" data-r>
            <h3>Agendamento online</h3>
            <p>Um link para o paciente marcar sozinho nos horários livres que você liberar.</p>
            <div className="slots" aria-hidden="true">
              {['09:00', '10:30', '11:00', '14:30', '16:00', '17:30'].map((h) => (
                <span key={h} className={h === '14:30' ? 'sel' : undefined}>{h}</span>
              ))}
            </div>
          </article>
          <article className="tile t-or" data-r style={{ '--i': 1 } as React.CSSProperties}>
            <h3>Orçamentos que fecham</h3>
            <p>Monte em minutos, envie por link ou PDF com a sua marca e veja quando foi aceito.</p>
            <div className="doc" aria-hidden="true">
              <span className="stamp"><Check className="ic" /> Aprovado</span>
              <div className="tt"><span>Implante</span><span className="num">R$ 6.500</span></div>
              <div><span>Parcelas</span><span className="num">10x</span></div>
            </div>
          </article>
          <article className="tile t-fi" data-r style={{ '--i': 2 } as React.CSSProperties}>
            <h3>Financeiro sem planilha</h3>
            <p>Recebimentos, parcelas e indicadores do mês direto no painel.</p>
            <div className="bars" aria-hidden="true">
              {[38, 52, 46, 66, 58, 78, 100].map((h) => <i key={h} style={{ height: `${h}%` }} />)}
            </div>
          </article>
        </div>
        <p className="ilustra">As telas desta página são ilustrações, com nomes e valores fictícios.</p>
      </div>
    </section>
  );
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

const RECURSOS_CRM = [
  { icon: Inbox, t: 'Conversas da equipe', d: 'O WhatsApp da clínica no computador, com toda a recepção no mesmo número.' },
  { icon: Bot, t: 'Robô de atendimento', d: 'Responde na hora com botões, pergunta o que importa e chama a equipe.' },
  { icon: KanbanSquare, t: 'Funis em quadro', d: 'Vários funis, etapas que você edita, filtros por tag, origem e responsável.' },
  { icon: Megaphone, t: 'Transmissões', d: 'Mensagens para uma tag, etapa ou funil, só para quem aceitou receber.' },
  { icon: ListChecks, t: 'Tarefas e painel de vendas', d: 'Ninguém fica sem retorno, e você vê de onde vêm e para onde vão os leads.' },
];

const FUNIL: { coluna: string; cor: string; cards: { nome: string; meta: string; tag?: string; valor?: string; destaque?: boolean }[] }[] = [
  { coluna: 'Novo', cor: 'c-novo', cards: [
    { nome: 'Rafael Souza', meta: 'WhatsApp, agora', tag: 'Implante' },
    { nome: 'Tiago Rocha', meta: 'Instagram, ontem', tag: 'Avaliação' },
    { nome: 'Luana Freitas', meta: 'Agendamento online', tag: 'Clareamento' },
  ] },
  { coluna: 'Avaliação agendada', cor: 'c-agenda', cards: [
    { nome: 'Juliana Prado', meta: 'Qui 16:00, Dra. Paula', tag: 'Ortodontia' },
    { nome: 'Carlos Mendes', meta: 'Sex 09:00, Dr. André' },
    { nome: 'Helena Dias', meta: 'Qui 11:00, Dra. Paula', tag: 'Harmonização' },
  ] },
  { coluna: 'Em negociação', cor: 'c-neg', cards: [
    { nome: 'Beatriz Lima', meta: 'Orçamento visualizado', valor: 'R$ 6.500', destaque: true },
    { nome: 'Pedro Alves', meta: 'Retomar na sexta', valor: 'R$ 2.900' },
  ] },
  { coluna: 'Fechado', cor: 'c-fim', cards: [
    { nome: 'Mariana Lopes', meta: 'Clareamento', valor: 'R$ 1.200' },
    { nome: 'Eduardo Nunes', meta: 'Ortodontia', valor: 'R$ 4.800' },
  ] },
];

function Crm() {
  return (
    <section className="night inner crm-grid" aria-labelledby="crm-titulo">
      <h2 id="crm-titulo" data-r className="wide">Toda a recepção no mesmo número.</h2>
      <div>
        <ul className="feats">
          {RECURSOS_CRM.map(({ icon: Icon, t, d }, i) => (
            <li key={t} data-r style={{ '--i': i } as React.CSSProperties}>
              <span className="dot"><Icon className="ic" aria-hidden="true" /></span>
              <div><b>{t}</b><span>{d}</span></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="board-wrap" data-r aria-hidden="true">
        <i className="board-glow" />
        <div className="app">
          <div className="chrome"><Logo size="sm" tone="white" /> Funil de captação</div>
          <div className="colsx">
            {FUNIL.map(({ coluna, cor, cards }) => (
              <div key={coluna} className="colx">
                <p className="colx-h"><i className={cor} />{coluna}</p>
                {cards.map((c) => (
                  <div key={c.nome} className={`kard${c.destaque ? ' hot' : ''}`}>
                    <b>{c.nome}</b>
                    <span>{c.meta}</span>
                    {c.tag && <em>{c.tag}</em>}
                    {c.valor && <strong className="num">{c.valor}</strong>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="bot">
          <div className="top"><Bot className="ic" /> Robô de atendimento</div>
          <span className="bb">Olá! Sobre qual tratamento você quer saber?</span>
          <div className="btns"><span>Implante</span><span>Clareamento</span><span>Falar com a equipe</span></div>
        </div>
      </div>
    </section>
  );
}

// ─── WhatsApp oficial ────────────────────────────────────────────────────────

function WhatsAppOficial() {
  const pontos = [
    'Mensagens saem do número da clínica, com o nome dela, sem QR code nem celular ligado.',
    'Confirmação na hora em que marca e lembretes 1 semana, 3 dias, 1 dia antes ou no dia: você escolhe.',
    'Botões Confirmar, Reagendar e Cancelar: a resposta cai sozinha na agenda.',
    'O celular continua funcionando no WhatsApp Business, junto com o sistema.',
  ];
  return (
    <section className="wa" id="whatsapp-oficial" aria-labelledby="whatsapp-oficial-titulo">
      <div className="inner wa-grid">
        <div className="pho-wrap" data-r aria-hidden="true">
          <div className="chip c2"><BadgeCheck className="ic" /><span>Conta oficial<small>Número e nome da clínica</small></span></div>
          <div className="pho">
            <div className="pho-h">
              <i>CS</i>
              <span><b>Clínica Sorriso <BadgeCheck className="ic" /></b><small>Conta comercial oficial</small></span>
            </div>
            <div className="chat">
              <div className="msg">
                Olá, Ana! Passando para lembrar do seu horário na <b>Clínica Sorriso</b>: quinta-feira às 14:30, com a Dra. Paula (Limpeza).
                <div className="opts"><span className="tap">Confirmar</span><span>Reagendar</span><span>Cancelar</span></div>
              </div>
              <div className="rep">Confirmar</div>
            </div>
          </div>
          <div className="chip c1"><CalendarCheck className="ic" /><span>Confirmada na agenda<small>Sem ninguém digitar</small></span></div>
        </div>
        <div>
          <h2 id="whatsapp-oficial-titulo" data-r>O paciente responde.<br />A agenda já sabe.</h2>
          <p className="lede" data-r style={{ '--i': 1 } as React.CSSProperties}>
            O DreamClin conecta o número da clínica direto na Meta, o mesmo caminho das grandes empresas. Sem gambiarra e sem o
            risco de um aparelho desconectado deixar paciente sem aviso. Conectar leva poucos minutos.
          </p>
          <ul className="wa-list">
            {pontos.map((p, i) => (
              <li key={p} data-r style={{ '--i': i } as React.CSSProperties}>
                <Check className="ic" aria-hidden="true" /> {p}
              </li>
            ))}
          </ul>
          <Link className="lnk" href="/ajuda/conectar-whatsapp">Veja o passo a passo para conectar</Link>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

/** As perguntas da página; vão também para o Google (FAQPage, em `page.tsx`). */
export const FAQS = [
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
    a: 'Sim. CPF e telefone são criptografados (AES-256), o sistema segue a LGPD desde a arquitetura e cada clínica só acessa os próprios dados.',
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

function FAQ() {
  const faqs = FAQS;
  return (
    <section className="sheet" id="perguntas" aria-labelledby="perguntas-titulo">
      <div className="inner faq">
        <div className="faq-side">
          <h2 id="perguntas-titulo">Ficou alguma dúvida?</h2>
          <p className="lede">Teste, planos, troca e cancelamento: tudo aqui. Se faltar alguma coisa, fale com a gente.</p>
        </div>
        <div>
          {faqs.map(({ q, a }, i) => (
            <details key={q} className="q" open={i === 0}>
              <summary>
                {q}
                <span className="pm" aria-hidden="true"><Plus className="ic" /></span>
              </summary>
              <p>{a}</p>
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
    <section className="dawn" aria-labelledby="cta-final">
      <div className="inner">
        <h2 id="cta-final" data-r>Amanhã, teste com a agenda da sua clínica.</h2>
        <p data-r style={{ '--i': 1 } as React.CSSProperties}>
          Cadastre a equipe e marque as consultas de uma semana normal. Em {TRIAL_DAYS} dias você sabe se o sistema serve para a
          sua rotina. Não pedimos cartão. Se não assinar, nada é cobrado e seus dados ficam disponíveis para consulta.
        </p>
        <div className="acts" data-r style={{ '--i': 2 } as React.CSSProperties}>
          <Link href={TESTAR} className="btn btn-mint">
            Começar o teste grátis <ArrowRight className="ic" aria-hidden="true" />
          </Link>
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-glass">
              Falar com a gente<span className="sr-only"> no WhatsApp (abre em nova aba)</span>
            </a>
          ) : (
            <Link href="/sign-in" className="btn btn-glass">Já tenho conta</Link>
          )}
        </div>
      </div>
      <Lua className="sun" />
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
    <a href={href} target="_blank" rel="noopener noreferrer" className="float btn btn-mint">
      <MessageCircle className="ic" aria-hidden="true" />
      <span className="float-txt">Fale com a gente</span>
      <span className="sr-only"> pelo WhatsApp (abre em nova aba)</span>
    </a>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer({ whatsapp }: { whatsapp: string | null }) {
  return (
    <footer className="foot">
      <div className="inner">
        <div className="foot-g">
          <div>
            <Logo size="lg" tone="white" />
            <p className="foot-sobre">Agenda, prontuário, orçamentos e CRM com WhatsApp oficial para clínicas odontológicas e de estética.</p>
          </div>
          <nav aria-label="Produtos">
            <h3>Produtos</h3>
            <ul>
              <li><a href="#planos-completo">Completo</a></li>
              <li><a href="#planos-agenda">Agenda</a></li>
              <li><a href="#planos-crm">CRM</a></li>
              <li><a href="#como-funciona">Como funciona</a></li>
              <li><a href="#planos">Preços</a></li>
            </ul>
          </nav>
          <nav aria-label="Ajuda">
            <h3>Ajuda</h3>
            <ul>
              <li><a href="#perguntas">Perguntas frequentes</a></li>
              <li><Link href="/ajuda/conectar-whatsapp">Como conectar o WhatsApp</Link></li>
              <li><Link href={TESTAR}>Criar conta</Link></li>
              <li><Link href="/sign-in">Entrar</Link></li>
              {whatsapp && (
                <li>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    Fale com a gente no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
                  </a>
                </li>
              )}
            </ul>
          </nav>
          <div>
            <h3>Compromissos</h3>
            <ul>
              <li><ShieldCheck className="ic" aria-hidden="true" /> Conformidade com a LGPD</li>
              <li><Lock className="ic" aria-hidden="true" /> Dados sensíveis criptografados</li>
              <li><Accessibility className="ic" aria-hidden="true" /> Acessibilidade WCAG 2.1 AA</li>
            </ul>
          </div>
        </div>
        <div className="foot-legal">
          <p>
            © {new Date().getFullYear()} DreamClin. Um produto da{' '}
            <a
              href={COMPANY.maker.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {COMPANY.maker.name}
              <span className="sr-only"> (abre em nova aba)</span>
            </a>. Todos os direitos
            reservados.
          </p>
          <nav aria-label="Páginas legais">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos de uso</Link>
            <span>Feito no Brasil</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function LandingView({ plans, whatsapp }: { plans: PublicPlan[]; whatsapp: string | null }) {
  return (
    <div className={`lp ${outfit.variable}`}>
      <SvgDefs />
      <LandingMotion />
      <Header />
      <main id="main-content">
        <Hero />
        <TrustStrip />
        <Journey />
        <Products plans={plans} />
        <Features />
        <Crm />
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

export async function LandingPage() {
  const plans = await loadPublicPlans();
  return (
    <>
      {/* Para o Google e os assistentes de IA: o que é o DreamClin, preços e perguntas. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(homeJsonLd(plans, TRIAL_DAYS))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(faqJsonLd(FAQS))} />
      <LandingView plans={plans} whatsapp={salesWhatsAppUrl()} />
    </>
  );
}
