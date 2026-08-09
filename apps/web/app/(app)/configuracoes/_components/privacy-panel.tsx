'use client';

import type { AuditEntry, PrivacySummary } from '../actions';

/**
 * O que a clínica precisa conseguir responder se um paciente — ou um fiscal —
 * perguntar: quem autorizou o quê, e quem mexeu em quê.
 *
 * A auditoria já era gravada há meses e nenhuma tela a mostrava. Registro que
 * ninguém consegue ler não serve como registro.
 */

const ROTULO_ACAO: Record<string, string> = {
  CREATE: 'criou',
  UPDATE: 'alterou',
  DELETE: 'excluiu',
  ACTIVATE: 'ativou',
  DEACTIVATE: 'desativou',
  ANAMNESIS_SAVE: 'salvou anamnese',
  APPOINTMENT_DELETED: 'excluiu agendamento',
  QUOTE_ACCEPTED: 'orçamento aceito pelo paciente',
  QUOTE_REJECTED: 'orçamento recusado pelo paciente',
  USER_ACTIVATE: 'devolveu acesso',
  USER_DEACTIVATE: 'removeu acesso',
};

const ROTULO_ENTIDADE: Record<string, string> = {
  Patient: 'paciente',
  Professional: 'profissional',
  Procedure: 'procedimento',
  Quote: 'orçamento',
  Payment: 'pagamento',
  Appointment: 'agendamento',
  Evolution: 'evolução',
  Tenant: 'dados da clínica',
  User: 'usuário',
};

function descreve(e: AuditEntry): string {
  if (e.action.startsWith('ROLE_')) return 'mudou o perfil de acesso';
  if (e.action.startsWith('TOOTH_')) return 'atualizou o odontograma';
  return ROTULO_ACAO[e.action] ?? e.action.toLowerCase().replace(/_/g, ' ');
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PrivacyPanel({
  summary,
  audit,
}: {
  summary: PrivacySummary;
  audit: AuditEntry[];
}) {
  const semCampanha = summary.pacientes - summary.autorizaramCampanha;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="consent-heading"
        className="rounded-xl border border-border bg-surface shadow-card"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="consent-heading" className="text-base font-semibold">
            Consentimentos
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Atender o paciente e guardar o prontuário tem base legal própria. Mandar promoção
            precisa de autorização específica — e são coisas diferentes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pacientes ativos" value={summary.pacientes} />
          <Stat
            label="Aceitaram o tratamento de dados"
            value={summary.aceitaramTratamento}
            hint="Obrigatório no cadastro."
          />
          <Stat
            label="Autorizaram campanha"
            value={summary.autorizaramCampanha}
            hint={semCampanha > 0 ? `${semCampanha} ainda não foram perguntados.` : undefined}
          />
          <Stat
            label="Pediram para sair"
            value={summary.pediramSair}
            hint="Responderam SAIR no WhatsApp."
          />
        </div>

        {summary.excluidosMasNoBanco > 0 && (
          <div className="mx-5 mb-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>{summary.excluidosMasNoBanco} paciente(s) excluídos</strong> continuam
            guardados. Hoje “excluir” apenas tira da lista — o prontuário tem prazo de guarda
            obrigatório pelo conselho, então apagar de vez ainda não é automático.
          </div>
        )}
      </section>

      <section
        aria-labelledby="audit-heading"
        className="rounded-xl border border-border bg-surface shadow-card"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="audit-heading" className="text-base font-semibold">
            Registro de atividades
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Últimas {audit.length} ações registradas nesta clínica.
          </p>
        </div>

        {audit.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Quem fez o quê, da ação mais recente para a mais antiga
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Quando</th>
                  <th scope="col" className="px-5 py-2 font-medium">Quem</th>
                  <th scope="col" className="px-5 py-2 font-medium">O quê</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-2.5">{e.userName ?? '—'}</td>
                    <td className="px-5 py-2.5">
                      {descreve(e)}{' '}
                      <span className="text-muted-foreground">
                        · {ROTULO_ENTIDADE[e.entity] ?? e.entity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
