'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { choosePlan, type BillingData, type PlanOption } from '../actions';

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

/** What each plan includes, in the order a clinic weighs them. */
function features(plan: PlanOption): string[] {
  return [
    plan.maxProfessionals === null
      ? 'Profissionais ilimitados'
      : `${plan.maxProfessionals} profissional${plan.maxProfessionals > 1 ? 'is' : ''}`,
    'Agenda, pacientes e prontuário',
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
  const [copied, setCopied] = useState<string | null>(null);

  const openCharge = data.charges.find((c) => c.status === 'PENDING' || c.status === 'OVERDUE');

  function pick(tier: string) {
    setError(null);
    setChoosing(tier);
    startTransition(async () => {
      const res = await choosePlan(tier);
      setChoosing(null);
      if (!res.ok) {
        setError(res.error ?? 'Não foi possível trocar de plano.');
        return;
      }
      router.refresh();
      if (res.invoiceUrl) window.open(res.invoiceUrl, '_blank', 'noopener');
    });
  }

  async function copyPix(payload: string, id: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked — the code is on screen and selectable.
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Planos e cobrança</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua assinatura do ClinicaIQ. Pague por PIX, boleto ou cartão.
        </p>
      </header>

      {data.sandbox && data.gatewayReady && (
        <p
          role="status"
          className="rounded-lg border border-dashed border-border bg-surface-alt px-4 py-2.5 text-sm text-muted-foreground"
        >
          <strong className="font-medium text-foreground">Ambiente de teste.</strong> As cobranças
          abaixo são fictícias e nenhum valor é debitado.
        </p>
      )}

      {/* Current state */}
      <section
        aria-labelledby="situacao"
        className={`card p-6 ${data.access.level === 'readonly' ? 'border-destructive/40' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                data.access.warning
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-success/10 text-success'
              }`}
            >
              {data.access.warning ? (
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2 id="situacao" className="text-sm font-semibold">
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
              <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
                {data.access.warning ?? 'Tudo certo. Obrigado por usar o ClinicaIQ.'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.professionalsInUse} profissional
                {data.professionalsInUse === 1 ? '' : 'is'} ativo
                {data.professionalsInUse === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {openCharge?.invoiceUrl && (
            <a
              href={openCharge.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary btn-md"
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Pagar {brl(openCharge.amountCents)}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>

        {openCharge?.pixPayload && (
          <div className="mt-5 rounded-lg border border-border bg-surface-alt p-4">
            <label htmlFor="pix" className="text-xs font-medium text-muted-foreground">
              PIX copia e cola
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="pix"
                readOnly
                value={openCharge.pixPayload}
                onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => copyPix(openCharge.pixPayload!, openCharge.id)}
                className="btn-outline btn-md shrink-0"
              >
                {copied === openCharge.id ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied === openCharge.id ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}
      </section>

      {!data.gatewayReady && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          A cobrança automática ainda não foi configurada. Fale com o suporte para ativar seu plano.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {/* Plans */}
      <section aria-labelledby="planos">
        <h2 id="planos" className="sr-only">
          Planos disponíveis
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {data.plans.map((plan) => {
            const busy = pending && choosing === plan.tier;
            const tooSmall =
              plan.maxProfessionals !== null && data.professionalsInUse > plan.maxProfessionals;

            return (
              <li key={plan.tier}>
                <article
                  className={`card flex h-full flex-col p-6 ${
                    plan.current ? 'border-primary ring-1 ring-primary' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold">{plan.name}</h3>
                    {plan.current && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Plano atual
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

                  <p className="mt-4">
                    <span className="text-3xl font-semibold tabular-nums">
                      {brl(plan.monthlyPriceCents)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </p>

                  <ul className="mt-4 flex-1 space-y-2">
                    {features(plan).map((f) => (
                      <li key={f} className="flex gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        <span>{f}</span>
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
                    className={`${plan.current ? 'btn-outline' : 'btn-primary'} btn-md mt-6 w-full justify-center`}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {plan.current ? 'Plano atual' : tooSmall ? 'Não comporta sua equipe' : 'Escolher'}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Invoices */}
      {data.charges.length > 0 && (
        <section aria-labelledby="faturas" className="card p-6">
          <h2 id="faturas" className="text-sm font-semibold">
            Faturas
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Histórico de faturas da assinatura</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">Vencimento</th>
                  <th scope="col" className="pb-2 font-medium">Valor</th>
                  <th scope="col" className="pb-2 font-medium">Situação</th>
                  <th scope="col" className="pb-2 font-medium">Pagamento</th>
                  <th scope="col" className="pb-2 text-right font-medium">Fatura</th>
                </tr>
              </thead>
              <tbody>
                {data.charges.map((c) => {
                  const s = CHARGE_STATUS[c.status] ?? CHARGE_STATUS.PENDING;
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 tabular-nums">{date(c.dueDate)}</td>
                      <td className="py-2.5 tabular-nums">{brl(c.amountCents)}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">
                        {c.paidAt ? date(c.paidAt) : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {c.invoiceUrl ? (
                          <a
                            href={c.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
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
        {pending ? 'Processando a troca de plano.' : ''}
      </p>
    </div>
  );
}
