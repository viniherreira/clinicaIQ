'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Printer, QrCode } from 'lucide-react';

/**
 * Turns patients into people the clinic's line has already talked to.
 *
 * WhatsApp's anti-abuse scoring treats an automated message to someone who has
 * never contacted the number as an approach to a stranger, and quietly declines
 * to deliver it — the single strongest predictor of the failures measured on
 * this install (see docs/WHATSAPP_ENTREGA.md). Once the patient sends the first
 * message, that stops applying and confirmations start arriving.
 *
 * So the fix isn't a better message, it's changing who speaks first.
 */
export function OptInCard({ phoneNumber }: { phoneNumber: string | null }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'texto' | null>(null);

  const link = phoneNumber
    ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent('Oi! Quero receber os lembretes das minhas consultas por aqui.')}`
    : null;

  const convite =
    'Salve o número da clínica e mande um "oi" no WhatsApp para receber ' +
    'lembretes e confirmar suas consultas por lá.';

  useEffect(() => {
    if (!link) return;
    let alive = true;
    // Loaded on demand: the QR only matters on this screen, and bundling the
    // generator into every page would cost every other route.
    void import('qrcode').then(async (mod) => {
      const url = await mod.toDataURL(link, { margin: 1, width: 480 });
      if (alive) setQr(url);
    });
    return () => {
      alive = false;
    };
  }, [link]);

  async function copy(what: 'link' | 'texto', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — the text is
      // on screen and selectable, so this is a convenience, not the only path.
    }
  }

  if (!link) return null;

  return (
    <section aria-labelledby="optin-title" className="card p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <QrCode className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="optin-title" className="text-sm font-semibold">
            Convide o paciente a falar primeiro
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O WhatsApp entrega muito mais quando o paciente já conversou com a clínica. Depois que
            ele manda a primeira mensagem, os lembretes passam a chegar normalmente.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[auto_1fr]">
        <figure className="mx-auto text-center md:mx-0">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt={`QR code que abre uma conversa no WhatsApp com a clínica`}
              className="h-40 w-40 rounded-lg border border-border bg-white p-2"
            />
          ) : (
            <div
              className="h-40 w-40 animate-pulse rounded-lg border border-border bg-surface-alt"
              aria-hidden="true"
            />
          )}
          <figcaption className="mt-2 text-xs text-muted-foreground">
            Imprima e deixe na recepção
          </figcaption>
        </figure>

        <div className="space-y-4">
          <div>
            <label htmlFor="optin-link" className="text-xs font-medium text-muted-foreground">
              Link para o site, e-mail ou assinatura
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="optin-link"
                readOnly
                value={link}
                className="input flex-1 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy('link', link)}
                className="btn-outline btn-md shrink-0"
              >
                {copied === 'link' ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="sr-only md:not-sr-only">
                  {copied === 'link' ? 'Copiado' : 'Copiar'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="optin-texto" className="text-xs font-medium text-muted-foreground">
              Texto pronto para a recepção
            </label>
            <div className="mt-1 flex gap-2">
              <textarea
                id="optin-texto"
                readOnly
                rows={2}
                value={convite}
                className="input flex-1 resize-none text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy('texto', convite)}
                className="btn-outline btn-md shrink-0 self-start"
              >
                {copied === 'texto' ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="sr-only md:not-sr-only">
                  {copied === 'texto' ? 'Copiado' : 'Copiar'}
                </span>
              </button>
            </div>
          </div>

          <button type="button" onClick={() => window.print()} className="btn-outline btn-md">
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir o QR code
          </button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {copied === 'link' ? 'Link copiado.' : copied === 'texto' ? 'Texto copiado.' : ''}
      </p>
    </section>
  );
}
