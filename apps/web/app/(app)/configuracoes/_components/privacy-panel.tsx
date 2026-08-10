'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  declararAceiteDeCampanhaParaTodos,
  type AuditEntry,
  type PrivacySummary,
} from '../actions';

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
  INVITE_REVOKED: 'cancelou convite',
  WHATSAPP_DISCONNECTED: 'desconectou o WhatsApp',
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
  Invitation: 'convite',
  WhatsAppSession: 'WhatsApp',
  PatientFile: 'arquivo',
};

function descreve(e: AuditEntry): string {
  if (e.action.startsWith('MARKETING_CONSENT_DECLARADO_EM_BLOCO_')) {
    const n = e.action.split('_').pop();
    return `declarou aceite de campanha para ${n} paciente(s)`;
  }
  if (e.action.startsWith('ROLE_')) return 'mudou o perfil de acesso';
  if (e.action.startsWith('TOOTH_')) return 'atualizou o odontograma';
  if (e.action.startsWith('INVITE_ACCEPTED_')) return 'aceitou o convite e entrou na equipe';
  if (e.action.startsWith('INVITE_')) return 'convidou alguém para a equipe';
  return ROTULO_ACAO[e.action] ?? e.action.toLowerCase().replace(/_/g, ' ');
}

/**
 * Um número com um significado. A barra dá a proporção sem virar gráfico —
 * quatro cartões iguais lado a lado só informam se dá para comparar de relance.
 */
function Stat({
  label,
  value,
  total,
  hint,
  tone = 'neutro',
}: {
  label: string;
  value: number;
  total?: number;
  hint?: string;
  tone?: 'neutro' | 'ok' | 'atencao';
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
  const cor =
    tone === 'ok' ? 'bg-success' : tone === 'atencao' ? 'bg-amber-500' : 'bg-muted-foreground/40';

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums leading-none">{value}</span>
        {pct !== null && (
          <span className="text-sm tabular-nums text-muted-foreground">de {total}</span>
        )}
      </p>
      {pct !== null && (
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-alt"
          role="img"
          aria-label={`${pct}% de ${total}`}
        >
          <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {hint && <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p>}
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const semCampanha = summary.pacientes - summary.autorizaramCampanha;

  function declarar() {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      const r = await declararAceiteDeCampanhaParaTodos();
      if (!r.ok) setErro(r.message ?? 'Não foi possível registrar.');
      else {
        setResultado(`${r.marcados} paciente(s) marcados como autorizados.`);
        setConfirmando(false);
        router.refresh();
      }
    });
  }

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
            precisa de autorização específica — são coisas diferentes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <Stat label="Pacientes ativos" value={summary.pacientes} />
          <Stat
            label="Aceitaram o tratamento"
            value={summary.aceitaramTratamento}
            total={summary.pacientes}
            tone="ok"
            hint="Obrigatório no cadastro."
          />
          <Stat
            label="Autorizaram campanha"
            value={summary.autorizaramCampanha}
            total={summary.pacientes}
            tone={semCampanha > 0 ? 'atencao' : 'ok'}
            hint={semCampanha > 0 ? `${semCampanha} ainda não foram perguntados.` : 'Todos.'}
          />
        </div>

        {semCampanha > 0 && (
          <div className="mx-5 mb-5 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-medium">Todos os pacientes já autorizaram?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se a sua clínica já tem o aceite dessas pessoas — no papel, no balcão ou na ficha
              antiga — registre aqui de uma vez. Fica gravado no registro de atividades com o seu
              nome e a data, e quem já respondeu <strong>SAIR</strong> continua de fora.
            </p>

            {!confirmando ? (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Registrar aceite de {semCampanha} paciente(s)
              </button>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  Confirma que essas {semCampanha} pessoas autorizaram?
                </span>
                <button
                  type="button"
                  onClick={declarar}
                  disabled={pending}
                  className="btn-primary btn-md"
                >
                  {pending ? 'Registrando…' : 'Sim, registrar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        {resultado && (
          <p
            role="status"
            className="mx-5 mb-5 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
          >
            {resultado}
          </p>
        )}
        {erro && (
          <p
            role="alert"
            className="mx-5 mb-5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {erro}
          </p>
        )}

        {summary.excluidosMasNoBanco > 0 && (
          <div className="mx-5 mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
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
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Quem fez o quê, da ação mais recente para a mais antiga
              </caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2.5 font-medium">Quando</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Quem</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">O quê</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-alt/50">
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
