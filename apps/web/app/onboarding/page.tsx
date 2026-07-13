'use client';

import { useState, useTransition } from 'react';
import { completeOnboarding } from './actions';
import { LogoMark } from '@/components/logo';

export default function OnboardingPage() {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await completeOnboarding(null, formData);
        if (result.success) {
          window.location.href = '/dashboard';
        } else {
          setFieldErrors(result.errors);
        }
      } catch (err) {
        console.error('Onboarding error:', err);
        setServerError('Ocorreu um erro inesperado. Tente novamente.');
      }
    });
  }

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit">
            <LogoMark size="lg" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Configure sua clínica</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estas informações aparecem nos orçamentos e documentos gerados. Você ajusta tudo depois em Configurações.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-surface p-6 shadow-sm">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium">
              Nome da clínica <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              placeholder="Ex: Clínica Odonto Silva"
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {fieldErrors.name && (
              <p id="name-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.name[0]}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="document" className="block text-sm font-medium">
              CNPJ <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="document"
              name="document"
              type="text"
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              aria-describedby={fieldErrors.document ? 'document-error' : undefined}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {fieldErrors.document && (
              <p id="document-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.document[0]}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-sm font-medium">
              Telefone / WhatsApp <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="(11) 99999-9999"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>

          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="touch-target w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {isPending ? 'Criando conta...' : 'Ir para o ClinicaIQ'}
          </button>
        </form>
      </div>
    </main>
  );
}
