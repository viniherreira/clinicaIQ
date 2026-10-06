'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, ExternalLink, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import {
  removeClinicLogo,
  saveDocumentSettings,
  uploadClinicLogo,
  type DocumentSettings,
} from '../actions';

const inputCls =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const textareaCls =
  'w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Tudo o que muda a cara dos papéis que a clínica entrega ao paciente:
 * logotipo, responsável técnico, condições do orçamento e cláusulas do
 * contrato — com pré-visualização usando os dados reais.
 */
export function DocumentsPanel({ settings }: { settings: DocumentSettings }) {
  return (
    <div className="space-y-6">
      <Readiness settings={settings} />
      <LogoSection settings={settings} />
      <TextsSection settings={settings} />
      <PreviewSection />
    </div>
  );
}

function Readiness({ settings }: { settings: DocumentSettings }) {
  const faltam = settings.checklist.filter((c) => !c.ok).length;
  return (
    <section aria-labelledby="docs-ready" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 id="docs-ready" className="text-base font-semibold">
        {faltam === 0 ? 'Documentos prontos' : 'Deixe os documentos completos'}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {faltam === 0
          ? 'Orçamentos, contratos e recibos já saem com todos os dados da clínica.'
          : `Falta${faltam > 1 ? 'm' : ''} ${faltam} ${faltam > 1 ? 'itens' : 'item'} para orçamentos, contratos e recibos saírem completos.`}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {settings.checklist.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-sm">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            {c.ok ? (
              <span>
                {c.label}
                <span className="sr-only"> — preenchido</span>
              </span>
            ) : (
              <a href={c.href} className="underline underline-offset-2 hover:no-underline">
                {c.label}
                <span className="sr-only"> — falta preencher</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LogoSection({ settings }: { settings: DocumentSettings }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function enviar(file: File) {
    setMessage(null);
    const fd = new FormData();
    fd.set('logo', file);
    startTransition(async () => {
      const res = await uploadClinicLogo(fd);
      setMessage(res.ok ? { ok: true, text: 'Logotipo atualizado.' } : { ok: false, text: res.message ?? 'Não foi possível enviar.' });
      if (inputRef.current) inputRef.current.value = '';
      if (res.ok) router.refresh();
    });
  }

  function remover() {
    setMessage(null);
    startTransition(async () => {
      const res = await removeClinicLogo();
      setMessage(res.ok ? { ok: true, text: 'Logotipo removido.' } : { ok: false, text: res.message ?? 'Não foi possível remover.' });
      if (res.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="logo-heading" className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id="logo-heading" className="text-base font-semibold">Logotipo</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sai no topo de todo orçamento, contrato e recibo. PNG ou JPG, até 1 MB — de preferência quadrado e com
          fundo transparente.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-5 p-5">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-alt">
          {settings.logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário, fora do otimizador
            <img src={settings.logoPreviewUrl} alt="Logotipo atual da clínica" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="text-xs text-muted-foreground">Sem logotipo</span>
          )}
        </div>
        <div className="space-y-2">
          {settings.storageReady ? (
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                id="logo-file"
                type="file"
                accept="image/png,image/jpeg"
                className="peer sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enviar(f);
                }}
              />
              <label
                htmlFor="logo-file"
                className={`btn-outline btn-md cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring ${pending ? 'pointer-events-none opacity-60' : ''}`}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                )}
                {settings.logoPreviewUrl ? 'Trocar logotipo' : 'Enviar logotipo'}
              </label>
              {settings.logoPreviewUrl && (
                <button type="button" onClick={remover} disabled={pending} className="btn-ghost btn-md hover:!bg-destructive/10 hover:!text-destructive">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
                </button>
              )}
            </div>
          ) : (
            <p className="max-w-sm text-sm text-muted-foreground">
              O envio de imagens ainda não está ativo nesta instalação. Os documentos saem normalmente, só que
              sem logotipo.
            </p>
          )}
          <p aria-live="polite" className={`text-sm ${message?.ok ? 'text-success' : 'text-destructive'}`}>
            {message?.text}
          </p>
        </div>
      </div>
    </section>
  );
}

function TextsSection({ settings }: { settings: DocumentSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rt, setRt] = useState(settings.technicalResponsible);
  const [registro, setRegistro] = useState(settings.technicalRegistration);
  const [quoteTerms, setQuoteTerms] = useState(settings.quoteTerms || settings.defaultQuoteTerms);
  const [contractTerms, setContractTerms] = useState(settings.contractTerms);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await saveDocumentSettings({
        technicalResponsible: rt,
        technicalRegistration: registro,
        quoteTerms,
        contractTerms,
      });
      setMessage(res.ok ? { ok: true, text: '✓ Salvo' } : { ok: false, text: res.message ?? 'Não foi possível salvar.' });
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      <section aria-labelledby="rt-heading" className="rounded-xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 id="rt-heading" className="text-base font-semibold">Responsável técnico</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem responde pela clínica no conselho. Assina pela clínica no contrato e no recibo quando o orçamento não
            tem um profissional definido.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="doc-rt" className="text-sm font-medium">Nome</label>
            <input id="doc-rt" value={rt} onChange={(e) => setRt(e.target.value)} maxLength={120} placeholder="Dra. Maria Silva" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="doc-reg" className="text-sm font-medium">Registro</label>
            <input id="doc-reg" value={registro} onChange={(e) => setRegistro(e.target.value)} maxLength={40} placeholder="CRO-SP 12345" className={inputCls} />
          </div>
        </div>
      </section>

      <section aria-labelledby="terms-heading" className="rounded-xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 id="terms-heading" className="text-base font-semibold">Textos dos documentos</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">O que sai impresso no fim do orçamento e no contrato.</p>
        </div>
        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor="doc-quote-terms" className="text-sm font-medium">Condições gerais do orçamento</label>
              {quoteTerms !== settings.defaultQuoteTerms && (
                <button
                  type="button"
                  onClick={() => setQuoteTerms(settings.defaultQuoteTerms)}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Voltar ao texto padrão
                </button>
              )}
            </div>
            <textarea
              id="doc-quote-terms"
              value={quoteTerms}
              onChange={(e) => setQuoteTerms(e.target.value)}
              rows={5}
              maxLength={2000}
              className={textareaCls}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="doc-contract-terms" className="text-sm font-medium">
              Cláusulas adicionais do contrato <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <p id="doc-contract-help" className="text-xs text-muted-foreground">
              Garantias, uso de imagem, regras próprias da clínica. Separe cada cláusula com uma linha em branco —
              elas entram numeradas antes da cláusula de foro.
            </p>
            <textarea
              id="doc-contract-terms"
              aria-describedby="doc-contract-help"
              value={contractTerms}
              onChange={(e) => setContractTerms(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder={'Os trabalhos protéticos têm garantia de 12 meses contra defeitos de confecção, condicionada às revisões semestrais.\n\nO(A) CONTRATANTE autoriza o registro fotográfico do tratamento para fins de documentação clínica.'}
              className={textareaCls}
            />
          </div>

          <p className="rounded-md bg-surface-alt px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            O contrato usa um modelo de referência com objeto, preço, obrigações das partes, rescisão, proteção de dados
            (LGPD) e foro, escrito dentro dos limites do Código de Defesa do Consumidor. Recomendamos que o advogado da
            clínica revise o modelo e as cláusulas adicionais antes do uso.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary btn-md">
          {pending ? 'Salvando...' : 'Salvar documentos'}
        </button>
        <span aria-live="polite" className={`text-sm ${message?.ok ? 'text-success' : 'text-destructive'}`}>
          {message?.text}
        </span>
      </div>
    </form>
  );
}

function PreviewSection() {
  const links = [
    { tipo: 'orcamento', label: 'Orçamento' },
    { tipo: 'contrato', label: 'Contrato' },
    { tipo: 'recibo', label: 'Recibo' },
  ];
  return (
    <section aria-labelledby="preview-heading" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 id="preview-heading" className="text-base font-semibold">Ver como fica</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Exemplos com os dados da sua clínica e um paciente fictício. Salve as alterações antes de abrir.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.tipo}
            href={`/configuracoes/exemplo/${l.tipo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline btn-md"
          >
            {l.label}
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        ))}
      </div>
    </section>
  );
}
