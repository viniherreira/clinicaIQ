/**
 * As regras da distribuição de leads e conversas, guardadas em
 * `Tenant.settings.crmDistribution`. Puro: lê o JSON aceitando o que vier e
 * escolhe quem recebe — testado em `distribution-rules.test.ts`.
 *
 * Como os modelos de distribuição do Kommo:
 * - Rodízio: um para cada, na ordem — recebe quem recebeu há mais tempo.
 * - Menos ocupado: quem tem menos negócios abertos; empate, o rodízio decide.
 *
 * "Só quem está disponível" tira do rodízio quem marcou Ausente. Se ninguém
 * estiver disponível, distribui entre todos que recebem: um lead sem ninguém
 * olhando é o pior resultado possível.
 */

export type DistributionMode = 'rotation' | 'load';

/** No robô e nas automações por etapa, "mudar responsável" para a vez de alguém. */
export const DISTRIBUTE = 'distribute';

export interface DistributionSettings {
  /** Lead novo do WhatsApp e conversa sem responsável recebem alguém sozinhos. */
  enabled: boolean;
  mode: DistributionMode;
  onlyAvailable: boolean;
}

export const DISTRIBUTION_DEFAULTS: DistributionSettings = { enabled: false, mode: 'rotation', onlyAvailable: true };

export const DISTRIBUTION_MODE_INFO: Record<DistributionMode, { label: string; description: string }> = {
  rotation: { label: 'Rodízio', description: 'Um para cada, na ordem. Todo mundo recebe a mesma quantidade.' },
  load: { label: 'Menos ocupado', description: 'Vai para quem tem menos negócios abertos no momento.' },
};

export function readDistribution(settings: unknown): DistributionSettings {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).crmDistribution : undefined;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DISTRIBUTION_DEFAULTS;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    mode: o.mode === 'load' || o.mode === 'rotation' ? o.mode : d.mode,
    onlyAvailable: typeof o.onlyAvailable === 'boolean' ? o.onlyAvailable : d.onlyAvailable,
  };
}

export interface Candidate {
  id: string;
  available: boolean;
  /** Última vez que recebeu pela distribuição. Nulo = nunca recebeu. */
  lastAssignedAt: Date | null;
  /** Negócios abertos de que é responsável. */
  openLeads: number;
  /** Desempate estável: quem entrou antes na equipe. */
  createdAt: Date;
}

/** Quem recebe, em ordem de preferência. Vazio = ninguém recebe leads. */
export function rankCandidates(candidates: readonly Candidate[], s: Pick<DistributionSettings, 'mode' | 'onlyAvailable'>): string[] {
  const disponiveis = s.onlyAvailable ? candidates.filter((c) => c.available) : candidates;
  const pool = disponiveis.length ? disponiveis : candidates;
  const t = (d: Date | null) => (d ? d.getTime() : -Infinity);
  return [...pool]
    .sort(
      (a, b) =>
        (s.mode === 'load' ? a.openLeads - b.openLeads : 0) ||
        t(a.lastAssignedAt) - t(b.lastAssignedAt) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    )
    .map((c) => c.id);
}
