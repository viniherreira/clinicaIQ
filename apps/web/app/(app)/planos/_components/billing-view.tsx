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
import { choosePlan, saveDocument, type BillingData, type PlanOption } from '../actions';
import type { BillingMethod } from '@/lib/asaas';
import { formatDocument, onlyDigits } from '@/lib/document';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

const CHARGE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Em aberto', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  PAID: { label: 'Paga', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' },
  OVERDUE: { label: 'Vencida', cls: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' },
  REFUNDED: { label: 'Estornada', cls: 'bg-surface-alt text-muted-foreground' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-surface-alt text-muted-foreground' },
};

function features(plan: PlanOption): string[] {
  return [
    plan.maxProfessionals === null
      ? 'Profissionais ilimitados'
      : `${plan.maxProfessionals} profissional${plan.maxProfessionals > 1 ? 'is' : ''}`,
    'Agenda, pacientes e prontuário',
    'Orçamentos em PDF',
    plan.whatsappEnabled ? 'Confirmação por WhatsApp' : null,
    plan.campaignsEnabled ? 'Campanhas em massa' : null,
    plan.assistantEnabled ? 'Assistente de IA' : null,
    plan.advancedReports ? 'Relatórios completos' : null,
  ].filter((f): f is string => f !== null);
}

export function BillingView({ data }: { data: BillingData }) {
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

  function pick(tier: string) {
    setError(null);
    setChoosing(tier);
    startTransition(async () => {
      const res = await choosePlan(tier, method);
      setChoosing(null);
      if (!res.ok) {
        setError(res.error ?? 'Não foi possível trocar de plano.');
        if (res.needsDocument) {
          document.getElementById('documento')?.focus();
        }
        return;
      }
      router.refresh();
      if (res.invoiceUrl) window.open(res.invoiceUrl, '_blank', 'noopener');
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

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Planos e cobrança</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Escolha o plano que acompanha o tamanho da sua clínica. Pague por PIX, boleto ou cartão,
          cancele quando quiser.
        </p>
      </header>

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
                  ? 'Avaliação gratuita'
                  : data.access.status === 'ACTIVE'
                    ? 'Assinatura em dia'
                    : data.access.status === 'PAST_DUE'
                      ? 'Pagamento em atraso'
                      : data.access.status === 'CANCELLED'
                        ? 'Assinatura encerrada'
                        : 'Acesso limitado'}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {data.access.warning ?? 'Tudo certo por aqui. Obrigado por usar o ClinicaIQ.'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {data.professionalsInUse}
                </span>{' '}
                profissional{data.professionalsInUse === 1 ? '' : 'is'} ativo
                {data.professionalsInUse === 1 ? '' : 's'}
                {data.document && <> · {data.document}</>}
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
      <section aria-labelledby="planos">
        <h2 id="planos" className="sr-only">
          Planos disponíveis
        </h2>

        {!openCharge && (
          <fieldset className="mb-6">
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
        <ul className="grid items-start gap-5 lg:grid-cols-3">
          {data.plans.map((plan, index) => {
            const busy = pending && choosing === plan.tier;
            const tooSmall =
              plan.maxProfessionals !== null && data.professionalsInUse > plan.maxProfessionals;
            // O do meio é o que serve à maioria das clínicas — destacá-lo poupa
            // a decisão de quem não quer comparar tabela.
            const featured = index === 1 && !plan.current;

            return (
              <li key={plan.tier} className={featured ? 'lg:-mt-3' : undefined}>
                <article
                  className={`relative flex h-full flex-col rounded-2xl border bg-surface p-6 transition-shadow hover:shadow-md ${
                    plan.current
                      ? 'border-primary ring-2 ring-primary/20'
                      : featured
                        ? 'border-primary/50 shadow-sm'
                        : 'border-border'
                  }`}
                >
                  {(plan.current || featured) && (
                    <span
                      className={`absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                        plan.current
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      }`}
                    >
                      {plan.current ? (
                        'Plano atual'
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" aria-hidden="true" /> Mais escolhido
                        </>
                      )}
                    </span>
                  )}

                  <h3 className="mt-2 text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1.5 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">
                    {plan.description}
                  </p>

                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">
                      {brl(plan.monthlyPriceCents)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </p>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {features(plan).map((f) => (
                      <li key={f} className="flex gap-2.5 text-sm">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => pick(plan.tier)}
                    disabled={plan.current || pending || tooSmall || !data.gatewayReady}
                    title={
                      tooSmall
                        ? `Você tem ${data.professionalsInUse} profissionais ativos; este plano permite ${plan.maxProfessionals}.`
                        : undefined
                    }
                    className={`${
                      plan.current || !featured ? 'btn-outline' : 'btn-primary'
                    } btn-md mt-7 w-full justify-center`}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {plan.current ? (
                      'Seu plano'
                    ) : tooSmall ? (
                      'Não comporta sua equipe'
                    ) : (
                      <>
                        Escolher {plan.name}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Todos os planos incluem acessibilidade WCAG 2.1 AA, backup diário e suporte por WhatsApp.
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
                        {c.paidAt ? date(c.paidAt) : '—'}
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
                          <span className="text-muted-foreground">—</span>
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

      <p aria-live="polite" className="sr-only">
        {pending ? 'Processando.' : ''}
      </p>
    </div>
  );
}
