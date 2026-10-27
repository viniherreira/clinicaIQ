/**
 * Os três produtos à venda e o que cada um liga. Puro: a cobrança, o cadastro,
 * a tela de plano e a página de vendas leem daqui.
 *
 * O produto não é gravado: sai das duas bandeiras da assinatura
 * (`clinicEnabled` e `crmEnabled`). Assim não existe um terceiro campo que
 * possa discordar dos módulos que de fato estão ligados.
 * Spec: docs/specs/2026-10-26-planos-teste-e-funis-design.md
 */

export type Product = 'AGENDA' | 'CRM' | 'COMPLETO';
export type Tier = 'ESSENCIAL' | 'PROFISSIONAL' | 'CLINICA';

/** Na ordem da vitrine: o Completo primeiro, é o que a maioria leva. */
export const PRODUCTS: readonly Product[] = ['COMPLETO', 'AGENDA', 'CRM'];
export const TIERS: readonly Tier[] = ['ESSENCIAL', 'PROFISSIONAL', 'CLINICA'];

export const PRODUCT_INFO: Record<Product, { name: string; tagline: string; includes: string[] }> = {
  COMPLETO: {
    name: 'Completo',
    tagline: 'Agenda e CRM integrados: o funil anda sozinho com a agenda.',
    includes: ['Tudo da Agenda', 'Tudo do CRM', 'Funil que anda com a agenda e os orçamentos'],
  },
  AGENDA: {
    name: 'Agenda',
    tagline: 'A rotina da clínica: agenda, prontuário, orçamentos e financeiro.',
    includes: [
      'Agenda por profissional e agendamento online',
      'Pacientes, prontuário e odontograma',
      'Orçamentos com link de aprovação e PDF',
      'Financeiro e relatórios',
      'Confirmação e lembretes no WhatsApp oficial',
    ],
  },
  CRM: {
    name: 'CRM',
    tagline: 'Captação de pacientes: funil, WhatsApp da equipe, robô e transmissões.',
    includes: [
      'Funis de captação em quadro',
      'Conversas do WhatsApp oficial com a equipe',
      'Robô de atendimento e transmissões',
      'Tarefas, painel de vendas e importação',
    ],
  },
};

export interface Modules {
  clinicEnabled: boolean;
  crmEnabled: boolean;
}

export function productOf(m: Modules): Product {
  if (m.clinicEnabled && m.crmEnabled) return 'COMPLETO';
  return m.clinicEnabled ? 'AGENDA' : 'CRM';
}

export function modulesOf(product: Product): Modules {
  return { clinicEnabled: product !== 'CRM', crmEnabled: product !== 'AGENDA' };
}

/** O que a tabela `plans` guarda de preço. */
export interface PlanPrices {
  monthlyPriceCents: number;
  crmPackagePriceCents: number;
  crmOnlyPriceCents: number;
  crmIncludedSeats: number;
  crmSeatPriceCents: number;
}

/** O preço de vitrine de um produto num tamanho, com os usuários incluídos. */
export function productPriceCents(plan: PlanPrices, product: Product): number {
  if (product === 'AGENDA') return plan.monthlyPriceCents;
  if (product === 'CRM') return plan.crmOnlyPriceCents;
  return plan.monthlyPriceCents + plan.crmPackagePriceCents;
}

/** Quanto o Completo economiza frente a Agenda + CRM comprados separados. */
export function bundleSavingsCents(plan: PlanPrices): number {
  return Math.max(0, plan.monthlyPriceCents + plan.crmOnlyPriceCents - productPriceCents(plan, 'COMPLETO'));
}

/** O produto existe nesse tamanho? (Sem preço do CRM sozinho, o CRM não é vendido.) */
export const productAvailable = (plan: PlanPrices, product: Product) =>
  product === 'AGENDA' || (product === 'CRM' ? plan.crmOnlyPriceCents > 0 : plan.crmPackagePriceCents > 0);

/** Os endereços (`?plano=completo&tamanho=profissional`) usam minúsculas sem acento. */
export function parseProduct(value: unknown): Product | null {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (PRODUCTS as readonly string[]).includes(v) ? (v as Product) : null;
}

export function parseTier(value: unknown): Tier | null {
  const v = typeof value === 'string' ? value.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
  return (TIERS as readonly string[]).includes(v) ? (v as Tier) : null;
}

export const productSlug = (p: Product) => p.toLowerCase();
export const tierSlug = (t: Tier) => t.toLowerCase();

/** O que o site manda para o cadastro quando a pessoa escolhe um plano. */
export const DEFAULT_CHOICE: { product: Product; tier: Tier } = { product: 'COMPLETO', tier: 'PROFISSIONAL' };

export function signUpHref(product: Product, tier: Tier): string {
  return `/sign-up?plano=${productSlug(product)}&tamanho=${tierSlug(tier)}`;
}
