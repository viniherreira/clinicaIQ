'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Building2,
  CreditCard,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cancelPlan, choosePlan, saveDocument, switchTrialPlan, type BillingData } from '../actions';
import type { BillingMethod } from '@/lib/asaas';
import { bundleSavingsCents, planFeatures, productAvailable, productPriceCents, PRODUCT_INFO, PRODUCTS, tierPitch, type Product } from '@/lib/products';
import { formatDocument, onlyDigits } from '@/lib/document';
import { clinicToday } from '@/lib/tz';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Vencimento e pagamento são guardados como dia "de parede", à meia-noite UTC —
 * a mesma convenção da agenda (ver lib/tz.ts).
 *
 * Formatar isso no fuso do navegador jogava a data um dia para trás no Brasil:
 * a cobrança que vence dia 11 aparecia como dia 10, no histórico e no aviso de
 * vencimento. Numa tela de cobrança, um dia de erro é a diferença entre "pago"
 * e "vencido".
 */
const diaDe = (iso: string) => iso.slice(0, 10);
const date = (iso: string) => diaDe(iso).split('-').reverse().join('/');
/** O fim do teste é um instante (cadastro + 14 dias), não um dia de parede: vai no fuso da clínica. */
const dataSP = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
/** Preço de vitrine, sem centavos: cabe no cartão estreito. */
const brlInteiro = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const CHARGE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Em aberto', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  PAID: { label: 'Paga', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' },
  OVERDUE: { label: 'Vencida', cls: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' },
  REFUNDED: { label: 'Estornada', cls: 'bg-surface-alt text-muted-foreground' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-surface-alt text-muted-foreground' },
};

/** "em 31 dias", "amanhã", "hoje", "há 3 dias" — a data sozinha obriga a
 *  clínica a fazer a conta de cabeça. */
function quando(iso: string): string {
  // Meio-dia dos dois lados para o horário de verão não comer um dia na conta.
  const alvo = Date.parse(`${diaDe(iso)}T12:00:00Z`);
  const hoje = Date.parse(`${clinicToday()}T12:00:00Z`);
  const dias = Math.round((alvo - hoje) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  return dias > 0 ? `em ${dias} dias` : `há ${Math.abs(dias)} dias`;
}

/** A forma de pagamento não é gravada; a própria cobrança denuncia qual foi. */
function formaDaCobranca(c: {
  pixPayload: string | null;
  bankSlipUrl: string | null;
}): string {
  if (c.pixPayload) return 'PIX';
  if (c.bankSlipUrl) return 'Boleto';
  return 'Cartão';
}

/**
 * O quadro que responde "estou em dia, e até quando?" sem clique nenhum.
 *
 * Antes a tela dizia a situação por extenso mas escondia a data: para saber até
 * quando estava paga, a clínica tinha que descer até o histórico e inferir pelo
 * vencimento da última cobrança. Numa tela de cobrança, a data é o dado.
 */
function ResumoAssinatura({ data }: { data: BillingData }) {
  const plano = data.plans.find((p) => p.current);
  const paga = data.charges
    .filter((c) => c.status === 'PAID' && c.paidAt)
    .sort((a, b) => (a.paidAt! < b.paidAt! ? 1 : -1))[0];

  const atrasada = data.access.status === 'PAST_DUE' || (data.access.level === 'readonly' && !data.access.trialEnded);
  const emTeste = data.access.status === 'TRIALING';

  const itens: { rotulo: string; valor: React.ReactNode }[] = [];

  itens.push({
    rotulo: emTeste ? 'Plano do teste' : 'Plano',
    valor: plano ? (
      <>
        {PRODUCT_INFO[data.product].name} {plano.name}
        <span className="text-muted-foreground"> · {brl(productPriceCents(plano, data.product))}/mês</span>
      </>
    ) : (
      <span className="text-muted-foreground">Nenhum</span>
    ),
  });

  if ((emTeste || data.access.trialEnded) && data.trialEndsAt) {
    itens.push({
      rotulo: 'Teste grátis até',
      valor: (
        <>
          <span className="tabular-nums">{dataSP(data.trialEndsAt)}</span>
          {data.access.daysLeft !== null && emTeste && (
            <span className="text-muted-foreground">
              {' '}
              · {data.access.daysLeft === 1 ? 'falta 1 dia' : `faltam ${data.access.daysLeft} dias`}
            </span>
          )}
        </>
      ),
    });
  } else if (data.currentPeriodEnd) {
    itens.push({
      rotulo: atrasada ? 'Venceu em' : 'Pago até',
      valor: (
        <>
          <span className={`tabular-nums ${atrasada ? 'text-destructive' : ''}`}>
            {date(data.currentPeriodEnd)}
          </span>
          <span className="text-muted-foreground"> · {quando(data.currentPeriodEnd)}</span>
        </>
      ),
    });
  }

  itens.push({
    rotulo: 'Renovação',
    valor: data.renewsAutomatically ? (
      <>
        Automática
        <span className="text-muted-foreground"> · cobrança gerada sozinha todo mês</span>
      </>
    ) : (
      <span className="text-muted-foreground">Manual. Escolha um plano para ativar</span>
    ),
  });

  if (paga) {
    itens.push({
      rotulo: 'Último pagamento',
      valor: (
        <>
          <span className="tabular-nums">{brl(paga.amountCents)}</span>
          <span className="text-muted-foreground">
            {' '}
            em {date(paga.paidAt!)} · {formaDaCobranca(paga)}
          </span>
        </>
      ),
    });
  }

  if (data.product !== 'CRM') {
    itens.push({
      rotulo: 'Profissionais ativos',
      valor: (
        <>
          <span className="tabular-nums">{data.professionalsInUse}</span>
          {plano?.maxProfessionals != null && (
            <span className="text-muted-foreground"> de {plano.maxProfessionals} no plano</span>
          )}
        </>
      ),
    });
  }

  if (data.document) {
    itens.push({ rotulo: 'CPF/CNPJ na cobrança', valor: data.document });
  }

  return (
    <dl className="grid gap-x-8 gap-y-3 border-t border-border bg-surface-alt/40 px-6 py-5 sm:grid-cols-2">
      {itens.map((i) => (
        <div key={i.rotulo} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {i.rotulo}
          </dt>
          <dd className="text-sm font-medium">{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Cortesia({ data, embutido }: { data: BillingData; embutido: boolean }) {
  const plano = data.plans.find((p) => p.current);
  return (
    <div className={embutido ? 'space-y-8' : 'mx-auto max-w-6xl space-y-8 p-6 lg:p-8'}>
      {!embutido && (
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight">Plano</h1>
        </header>
      )}
      <section
        aria-labelledby="cortesia"
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      >
        <div className="flex gap-4 p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="cortesia" className="font-semibold">
              Cortesia ativa
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Sua clínica tem acesso completo ao DreamClin, sem mensalidade. Nenhuma cobrança é
              gerada enquanto a cortesia estiver ativa.
            </p>
          </div>
        </div>
        <dl className="grid gap-x-8 gap-y-3 border-t border-border bg-surface-alt/40 px-6 py-5 sm:grid-cols-2">
          {[
            { rotulo: 'Plano', valor: `${plano?.name ?? 'Clínica'} · todos os recursos` },
            { rotulo: 'Mensalidade', valor: 'Isenta' },
            { rotulo: 'Profissionais ativos', valor: String(data.professionalsInUse) },
            { rotulo: 'Validade', valor: 'Sem prazo' },
          ].map((i) => (
            <div
              key={i.rotulo}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {i.rotulo}
              </dt>
              <dd className="text-sm font-medium">{i.valor}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** O que muda nos módulos ao trocar de produto, dito antes de confirmar. */
function mudancaDeModulos(de: Product, para: Product): string | null {
  if (de === para) return null;
  const sai = de !== 'AGENDA' && para === 'AGENDA' ? 'O CRM sai agora; os leads e as conversas ficam guardados para quando voltar.'
    : de !== 'CRM' && para === 'CRM' ? 'A agenda sai agora; pacientes, agendamentos e orçamentos ficam guardados para quando voltar.'
      : null;
  const entra = para === 'COMPLETO' ? 'Agenda e CRM ficam ligados e integrados na hora.' : null;
  return [sai, entra].filter(Boolean).join(' ') || null;
}

export function BillingView({
  data,
  embutido = false,
}: {
  data: BillingData;
  /** Renderizado dentro da aba de Configurações, não como página inteira. */
  embutido?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [doc, setDoc] = useState(data.document);
  const [docError, setDocError] = useState<string | null>(null);
  const [docSaved, setDocSaved] = useState(false);
  const [method, setMethod] = useState<BillingMethod>('PIX');
  const [qr, setQr] = useState<string | null>(null);
  // O produto em exibição nos cartões, e o plano escolhido esperando confirmação.
  const [produto, setProduto] = useState<Product>(data.product);
  const [escolha, setEscolha] = useState<{ tier: string; product: Product } | null>(null);

  const openCharge = data.charges.find((c) => c.status === 'PENDING' || c.status === 'OVERDUE');
  const needsDocument = !data.document;

  // The PIX code is drawn here rather than fetched as an image: Asaas returns a
  // base64 PNG, and storing or proxying it would be kilobytes per charge for
  // something the browser renders from the payload we already have.
  useEffect(() => {
    const payload = openCharge?.pixPayload;
    if (!payload) {
      setQr(null);
      return;
    }
    let alive = true;
    void import('qrcode').then(async (mod) => {
      const url = await mod.toDataURL(payload, { margin: 1, width: 320 });
      if (alive) setQr(url);
    });
    return () => {
      alive = false;
    };
  }, [openCharge?.pixPayload]);

  function pick(tier: string, product: Product) {
    setError(null);
    setChoosing(tier);
    startTransition(async () => {
      const res = await choosePlan(tier, method, product);
      setChoosing(null);
      if (!res.ok) {
        setError(res.error ?? 'Não foi possível trocar de plano.');
        if (res.needsDocument) {
          document.getElementById('documento')?.focus();
        }
        return;
      }
      setEscolha(null);
      router.refresh();
      if (res.invoiceUrl) window.open(res.invoiceUrl, '_blank', 'noopener');
    });
  }

  /** No teste, sem assinar: só troca o plano do teste. */
  function trocarTeste(tier: string, product: Product) {
    setError(null);
    setChoosing(tier);
    startTransition(async () => {
      const res = await switchTrialPlan(tier, product);
      setChoosing(null);
      if (!res.ok) return setError(res.error ?? 'Não foi possível trocar o plano do teste.');
      setEscolha(null);
      router.refresh();
    });
  }

  function submitDocument() {
    setDocError(null);
    startTransition(async () => {
      const res = await saveDocument(doc);
      if (!res.ok) {
        setDocError(res.error ?? 'Não foi possível salvar.');
        return;
      }
      setDocSaved(true);
      setError(null);
      router.refresh();
    });
  }

  async function copyPix(payload: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the code is on screen and selectable.
    }
  }

  // Cortesia não tem o que escolher, pagar nem cancelar. Mostrar a grade de
  // planos aqui seria convidar a clínica a contratar o que já tem de graça.
  if (data.access.complimentary) {
    return <Cortesia data={data} embutido={embutido} />;
  }

  return (
    // Dentro da aba de Configurações a moldura já existe: a página tem o próprio
    // título, a largura e o respiro. Repetir tudo aqui empurraria o conteúdo
    // para dentro duas vezes e colocaria dois <h1> na mesma tela.
    <div className={embutido ? 'space-y-8' : 'mx-auto max-w-6xl space-y-8 p-6 lg:p-8'}>
      {embutido ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Escolha o plano que acompanha o tamanho da sua clínica. Pague por PIX, boleto ou cartão,
          cancele quando quiser.
        </p>
      ) : (
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight">Planos e cobrança</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Escolha o plano que acompanha o tamanho da sua clínica. Pague por PIX, boleto ou cartão,
            cancele quando quiser.
          </p>
        </header>
      )}

      {data.sandbox && data.gatewayReady && (
        <p
          role="status"
          className="rounded-xl border border-dashed border-border bg-surface-alt px-4 py-3 text-sm text-muted-foreground"
        >
          <strong className="font-medium text-foreground">Ambiente de teste.</strong> As cobranças
          são fictícias e nenhum valor é debitado.
        </p>
      )}

      {/* Status + fatura em aberto */}
      <section
        aria-labelledby="situacao"
        className={`overflow-hidden rounded-2xl border bg-surface shadow-sm ${
          data.access.level === 'readonly' ? 'border-destructive/40' : 'border-border'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-5 p-6">
          <div className="flex gap-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                data.access.warning
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {data.access.warning ? (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2 id="situacao" className="font-semibold">
                {data.access.status === 'TRIALING'
                  ? 'Teste grátis'
                  : data.access.trialEnded
                    ? 'Teste grátis encerrado'
                    : data.access.status === 'ACTIVE'
                    ? 'Assinatura em dia'
                    : data.access.status === 'PAST_DUE'
                      ? 'Pagamento em atraso'
                      : data.access.status === 'CANCELLED'
                        ? // Cancelada ainda tem o período pago pela frente;
                          // "encerrada" só depois que ele acaba.
                          data.access.level === 'full'
                          ? 'Assinatura cancelada'
                          : 'Assinatura encerrada'
                        : 'Acesso limitado'}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {data.access.warning ?? 'Tudo certo por aqui. Obrigado por usar o DreamClin.'}
              </p>
            </div>
          </div>

          {openCharge?.invoiceUrl && (
            <a
              href={openCharge.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary btn-md shadow-sm"
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Pagar {brl(openCharge.amountCents)}
              <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            </a>
          )}
        </div>

        <ResumoAssinatura data={data} />

        {openCharge?.pixPayload && (
          <div className="border-t border-border bg-surface-alt/60 p-6">
            <div className="flex flex-wrap items-start gap-6">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt="QR code do PIX para pagar a fatura"
                  className="h-40 w-40 shrink-0 rounded-xl border border-border bg-white p-2"
                />
              ) : (
                <div
                  className="h-40 w-40 shrink-0 animate-pulse rounded-xl border border-border bg-surface"
                  aria-hidden="true"
                />
              )}

              <div className="min-w-[260px] flex-1">
                <h3 className="flex items-center gap-2 font-semibold">
                  <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
                  Pague por PIX
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Aponte a câmera do banco para o código, ou use o copia e cola abaixo.
                </p>

                <label htmlFor="pix" className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  PIX copia e cola
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="pix"
                    readOnly
                    value={openCharge.pixPayload}
                    onFocus={(e) => e.currentTarget.select()}
                    className="input flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => copyPix(openCharge.pixPayload!)}
                    className="btn-outline btn-md shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                {openCharge.bankSlipUrl && (
                  <a
                    href={openCharge.bankSlipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Prefiro o boleto
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* CPF/CNPJ — pedido aqui porque é aqui que ele faz falta */}
      {needsDocument && (
        <section
          aria-labelledby="doc-title"
          className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-6"
        >
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="doc-title" className="font-semibold">
                Falta o CPF ou CNPJ da clínica
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                É exigido para emitir a nota e gerar o boleto ou o PIX. Pode ser o CNPJ da clínica ou
                o seu CPF, se você atende como pessoa física.
              </p>

              <div className="mt-4 flex max-w-md flex-wrap gap-2">
                <div className="min-w-[220px] flex-1">
                  <label htmlFor="documento" className="sr-only">
                    CPF ou CNPJ
                  </label>
                  <input
                    id="documento"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="CNPJ 00.000.000/0000-00 ou CPF 000.000.000-00"
                    value={doc}
                    onChange={(e) => {
                      const digits = onlyDigits(e.target.value).slice(0, 14);
                      setDoc(digits.length === 11 || digits.length === 14 ? formatDocument(digits) : digits);
                      setDocError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && submitDocument()}
                    aria-invalid={docError ? true : undefined}
                    aria-describedby={docError ? 'doc-erro' : undefined}
                    className="input w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitDocument}
                  disabled={pending || !doc}
                  className="btn-primary btn-md shrink-0"
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Salvar
                </button>
              </div>

              {docError && (
                <p id="doc-erro" role="alert" className="mt-2 text-sm text-destructive">
                  {docError}
                </p>
              )}
              {docSaved && !docError && (
                <p role="status" className="mt-2 text-sm text-success">
                  Salvo. Agora é só escolher o plano.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {!data.gatewayReady && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          A cobrança automática ainda não foi configurada. Fale com o suporte para ativar seu plano.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {/* Planos */}
      <section aria-labelledby="planos" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 id="planos" className="text-lg font-semibold">
              {data.trialOpen ? 'Escolha o plano para depois do teste' : 'Planos'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{PRODUCT_INFO[produto].tagline}</p>
          </div>
          <div role="radiogroup" aria-label="Produto" className="inline-flex rounded-full border border-border bg-surface p-1 shadow-sm">
            {PRODUCTS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={produto === p}
                onClick={() => {
                  setProduto(p);
                  setEscolha(null);
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  produto === p ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {PRODUCT_INFO[p].name}
              </button>
            ))}
          </div>
        </div>

        <ul className="grid items-start gap-5 lg:grid-cols-3">
          {data.plans
            .filter((plan) => productAvailable(plan, produto))
            .map((plan, index) => {
              const busy = pending && choosing === plan.tier;
              const atual = plan.current && produto === data.product;
              const tooSmall =
                produto !== 'CRM' && plan.maxProfessionals !== null && data.professionalsInUse > plan.maxProfessionals;
              // O do meio é o que serve à maioria das clínicas — destacá-lo poupa
              // a decisão de quem não quer comparar tabela.
              const featured = index === 1 && !atual;
              const economia = produto === 'COMPLETO' ? bundleSavingsCents(plan) : 0;
              const escolhido = escolha?.tier === plan.tier && escolha.product === produto;
              // Assinado e em dia: o plano atual não tem o que fazer. No teste (ou
              // sem assinatura), o atual é justamente o que se assina.
              const travado = atual && data.renewsAutomatically;

              return (
                <li key={plan.tier} className={featured ? 'lg:-mt-3' : undefined}>
                  <article
                    className={`relative flex h-full flex-col rounded-2xl border bg-surface p-6 transition-shadow hover:shadow-md ${
                      atual || escolhido
                        ? 'border-primary ring-2 ring-primary/20'
                        : featured
                          ? 'border-primary/50 shadow-sm'
                          : 'border-border'
                    }`}
                  >
                    {(atual || featured) && (
                      <span
                        className={`absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                          atual ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        }`}
                      >
                        {atual ? (
                          data.trialOpen ? 'No seu teste' : 'Plano atual'
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3" aria-hidden="true" /> Mais escolhido
                          </>
                        )}
                      </span>
                    )}

                    <h3 className="mt-2 text-lg font-semibold">
                      {PRODUCT_INFO[produto].name} {plan.name}
                    </h3>
                    <p className="mt-1.5 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">
                      {tierPitch(plan, produto)}
                    </p>

                    <p className="mt-5 flex flex-wrap items-baseline gap-x-1">
                      <span className="text-4xl font-semibold tracking-tight tabular-nums">
                        {brlInteiro(productPriceCents(plan, produto))}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </p>
                    <p className="mt-1.5 min-h-[1.25rem] text-sm text-muted-foreground">
                      {economia > 0 ? (
                        <>
                          Economiza <span className="font-medium text-emerald-700 dark:text-emerald-400">{brlInteiro(economia)}/mês</span> frente a
                          Agenda + CRM separados
                        </>
                      ) : null}
                    </p>

                    <ul className="mt-6 flex-1 space-y-2.5">
                      {planFeatures(plan, produto).map((f) => (
                        <li key={f} className="flex gap-2.5 text-sm">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          <span className="leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setEscolha({ tier: plan.tier, product: produto });
                        // A confirmação aparece logo abaixo da grade.
                        setTimeout(() => document.getElementById('confirmar-plano')?.focus(), 0);
                      }}
                      disabled={travado || pending || tooSmall || (!data.gatewayReady && !data.trialOpen)}
                      aria-pressed={escolhido}
                      title={
                        tooSmall
                          ? `Você tem ${data.professionalsInUse} profissionais ativos; este plano permite ${plan.maxProfessionals}.`
                          : undefined
                      }
                      className={`${(atual && !travado) || (featured && !travado) ? 'btn-primary' : 'btn-outline'} btn-md mt-7 w-full justify-center`}
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {travado ? (
                        'Seu plano'
                      ) : tooSmall ? (
                        'Não comporta sua equipe'
                      ) : atual ? (
                        <>
                          Assinar este plano
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          {data.renewsAutomatically ? 'Trocar para este' : 'Escolher este'}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </article>
                </li>
              );
            })}
        </ul>

        {escolha && (() => {
          const plan = data.plans.find((p) => p.tier === escolha.tier);
          if (!plan) return null;
          const nome = `${PRODUCT_INFO[escolha.product].name} ${plan.name}`;
          const valor = brl(productPriceCents(plan, escolha.product));
          const mesmo = plan.current && escolha.product === data.product;
          const aviso = mudancaDeModulos(data.product, escolha.product);
          const assinando = !data.renewsAutomatically;
          return (
            <div
              id="confirmar-plano"
              tabIndex={-1}
              role="region"
              aria-labelledby="confirmar-plano-titulo"
              className="rounded-2xl border border-primary/40 bg-primary/[0.03] p-6 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <h3 id="confirmar-plano-titulo" className="font-semibold">
                {assinando ? `Assinar o ${nome}` : `Trocar para o ${nome}`}
                <span className="font-normal text-muted-foreground"> · {valor}/mês</span>
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {data.trialOpen && data.trialEndsAt
                  ? `Você não paga nada hoje: a primeira cobrança só vence em ${dataSP(data.trialEndsAt)}, quando o teste termina. `
                  : assinando
                    ? 'A primeira cobrança sai hoje, na forma de pagamento escolhida. '
                    : `O valor novo vale a partir da próxima fatura${data.currentPeriodEnd ? `, em ${date(data.currentPeriodEnd)}` : ''}, sem cobrança proporcional. `}
                {aviso}
                {' '}Sem fidelidade: dá para trocar ou cancelar quando quiser.
              </p>

              {assinando && !openCharge && (
                <fieldset className="mt-4">
                  <legend className="text-sm font-medium">Como você prefere pagar?</legend>
                  <div className="mt-2.5 inline-flex flex-wrap gap-2" role="radiogroup" aria-label="Forma de pagamento">
                    {(
                      [
                        { id: 'PIX', label: 'PIX', icon: QrCode, hint: 'liberação imediata' },
                        { id: 'BOLETO', label: 'Boleto', icon: Barcode, hint: 'compensa em 1 dia útil' },
                        { id: 'CREDIT_CARD', label: 'Cartão', icon: CreditCard, hint: 'renova sozinho' },
                      ] as const
                    ).map(({ id, label, icon: Icon, hint }) => {
                      const on = method === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setMethod(id)}
                          className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                            on
                              ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/30'
                              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${on ? 'text-primary' : ''}`} aria-hidden="true" />
                          <span>
                            <span className="block text-sm font-medium">{label}</span>
                            <span className="block text-xs text-muted-foreground">{hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => pick(escolha.tier, escolha.product)}
                  disabled={pending || !data.gatewayReady}
                  className="btn-primary btn-md"
                >
                  {pending && choosing === escolha.tier && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {assinando ? 'Assinar agora' : 'Confirmar a troca'}
                </button>
                {data.trialOpen && !mesmo && (
                  <button
                    type="button"
                    onClick={() => trocarTeste(escolha.tier, escolha.product)}
                    disabled={pending}
                    className="btn-outline btn-md"
                  >
                    Continuar testando com este plano
                  </button>
                )}
                <button type="button" onClick={() => setEscolha(null)} disabled={pending} className="btn-ghost btn-md">
                  Voltar
                </button>
              </div>
            </div>
          );
        })()}

        <p className="text-center text-sm text-muted-foreground">
          Todos os planos incluem acessibilidade WCAG 2.1 AA, backup diário e suporte por WhatsApp. As conversas do WhatsApp são
          cobradas pela Meta direto da clínica.
        </p>
      </section>

      {/* Faturas */}
      {data.charges.length > 0 && (
        <section aria-labelledby="faturas" className="rounded-2xl border border-border bg-surface p-6">
          <h2 id="faturas" className="font-semibold">
            Faturas
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Histórico de faturas da assinatura</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="pb-2.5 font-medium">Vencimento</th>
                  <th scope="col" className="pb-2.5 font-medium">Valor</th>
                  <th scope="col" className="pb-2.5 font-medium">Situação</th>
                  <th scope="col" className="pb-2.5 font-medium">Pagamento</th>
                  <th scope="col" className="pb-2.5 text-right font-medium">Fatura</th>
                </tr>
              </thead>
              <tbody>
                {data.charges.map((c) => {
                  const s = CHARGE_STATUS[c.status] ?? CHARGE_STATUS.PENDING;
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-3 tabular-nums">{date(c.dueDate)}</td>
                      <td className="py-3 font-medium tabular-nums">{brl(c.amountCents)}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-3 tabular-nums text-muted-foreground">
                        {c.paidAt ? date(c.paidAt) : '-'}
                      </td>
                      <td className="py-3 text-right">
                        {c.invoiceUrl ? (
                          <a
                            href={c.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            Abrir
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <CancelarAssinatura data={data} />

      <p aria-live="polite" className="sr-only">
        {pending ? 'Processando.' : ''}
      </p>
    </div>
  );
}

/**
 * A saída.
 *
 * Toda tela de cobrança precisa de uma, visível — quando não tem, a clínica
 * cancela ligando, reclamando, ou parando de pagar, e nenhum dos três é bom. Ela
 * fica discreta e no fim da tela, sem competir com os planos, mas sem esconder.
 *
 * A confirmação não é um "tem certeza?" genérico: diz a data até quando o acesso
 * continua e o que acontece com os dados. É a dúvida real de quem está com o
 * dedo no botão.
 */
function CancelarAssinatura({ data }: { data: BillingData }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const jaCancelada = data.access.status === 'CANCELLED';
  const semAssinatura = !data.currentTier;
  if (semAssinatura) return null;

  if (jaCancelada) {
    return (
      <section className="rounded-2xl border border-border bg-surface-alt/40 p-6">
        <h2 className="font-semibold">Assinatura cancelada</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {data.currentPeriodEnd && new Date(data.currentPeriodEnd) > new Date() ? (
            <>
              Não haverá nova cobrança. Você continua com acesso completo até{' '}
              <strong className="text-foreground">{date(data.currentPeriodEnd)}</strong>. Depois
              disso, a clínica fica em modo consulta, e nada é apagado.
            </>
          ) : (
            <>
              A clínica está em modo consulta: dá para ver e imprimir tudo, mas não gravar. Seus
              dados continuam aqui. Escolha um plano acima para voltar a usar.
            </>
          )}
        </p>
      </section>
    );
  }

  function cancelar() {
    setErro(null);
    iniciar(async () => {
      const r = await cancelPlan();
      if (!r.ok) {
        setErro(r.error ?? 'Não foi possível cancelar.');
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="cancelar-titulo"
      className="rounded-2xl border border-border bg-surface p-6"
    >
      <h2 id="cancelar-titulo" className="font-semibold">
        Cancelar assinatura
      </h2>

      {!confirmando ? (
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Você pode cancelar quando quiser, sem multa e sem precisar falar com ninguém.
          </p>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Cancelar assinatura
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">Confirmar o cancelamento?</p>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
            <li>
              • Nenhuma cobrança nova será gerada
              {data.currentPeriodEnd && (
                <>
                  , e você <strong className="text-foreground">continua usando tudo até {date(data.currentPeriodEnd)}</strong>
                </>
              )}
              .
            </li>
            <li>• Depois dessa data, a clínica fica em modo consulta: dá para ver e imprimir, não gravar.</li>
            <li>• Nenhum paciente, agendamento ou prontuário é apagado.</li>
            <li>• Dá para voltar a qualquer momento escolhendo um plano aqui.</li>
          </ul>

          {erro && (
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendente}
              onClick={cancelar}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pendente ? 'Cancelando…' : 'Sim, cancelar'}
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() => {
                setConfirmando(false);
                setErro(null);
              }}
              className="btn-outline btn-md"
            >
              Manter assinatura
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
