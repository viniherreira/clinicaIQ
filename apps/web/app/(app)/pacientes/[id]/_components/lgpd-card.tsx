'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { anonymizePatientAction } from '../actions';

/**
 * Direitos do paciente (LGPD art. 18), na ficha: baixar tudo o que a clínica
 * tem dele e anonimizar o cadastro. Só aparece para dono e administrador; a
 * action confere de novo.
 */
export function LgpdCard({ patientId, anonimizado }: { patientId: string; anonimizado: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [palavra, setPalavra] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  function anonimizar() {
    setErro(null);
    startTransition(async () => {
      const r = await anonymizePatientAction(patientId, palavra);
      if (!r.ok) setErro(r.message ?? 'Não foi possível anonimizar.');
      else {
        setAberto(false);
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="lgpd-heading" className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
      <h2 id="lgpd-heading" className="text-sm font-semibold">
        Dados do paciente (LGPD)
      </h2>
      <a
        href={`/pacientes/${patientId}/exportar`}
        className="block text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Baixar todos os dados do paciente
      </a>

      {anonimizado ? (
        <p className="text-xs text-muted-foreground">Cadastro anonimizado. O prontuário continua guardado.</p>
      ) : !aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-xs font-medium text-destructive underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Anonimizar cadastro
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs leading-relaxed">
            Apaga nome, CPF, contatos, endereço, notas da equipe e o que o CRM tem desta pessoa. O
            prontuário (anamnese, evoluções, odontograma, imagens, orçamentos e pagamentos) fica
            guardado pelo prazo legal. <strong>Não tem volta.</strong>
          </p>
          <label htmlFor="lgpd-confirmacao" className="block text-xs font-medium">
            Digite ANONIMIZAR para confirmar
          </label>
          <input
            id="lgpd-confirmacao"
            value={palavra}
            onChange={(e) => setPalavra(e.target.value)}
            autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={anonimizar}
              disabled={pending || palavra.trim().toUpperCase() !== 'ANONIMIZAR'}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pending ? 'Anonimizando…' : 'Anonimizar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                setPalavra('');
                setErro(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
