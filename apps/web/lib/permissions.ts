/**
 * Quem pode o quê dentro de uma clínica.
 *
 * O enum `Role` existe no schema desde o começo e nunca foi consultado: qualquer
 * pessoa com login na clínica podia apagar profissional, ler prontuário
 * completo e trocar o plano. Hoje não há impacto porque todo mundo é OWNER, mas
 * no dia em que uma clínica cadastrar a recepcionista isso vira problema — e o
 * prontuário é dado sensível de saúde (LGPD art. 11).
 *
 * Módulo puro de propósito: sem Prisma, sem Clerk, sem `server-only`. A regra é
 * uma tabela e uma função, e as duas dão para testar sem banco.
 */

export type Role = 'OWNER' | 'ADMIN' | 'RECEPTIONIST' | 'PROFESSIONAL';

export type Capability =
  /** Agenda: marcar, remarcar, cancelar, bloquear horário. */
  | 'agenda'
  /** Cadastro do paciente: nome, contato, observações administrativas. */
  | 'pacientes'
  /** Prontuário clínico: anamnese, evolução, odontograma, exames. */
  | 'prontuario'
  /** Dinheiro: pagamentos, orçamentos, relatórios financeiros. */
  | 'financeiro'
  /** Configuração do dia a dia: horários, procedimentos, WhatsApp, mensagens. */
  | 'configuracoes'
  /** Disparo de mensagem em massa. */
  | 'campanhas'
  /** Quem entra na clínica: convidar, trocar perfil, tirar acesso, excluir
   *  profissional. É a chave da porta — quem tem isto pode dar isto a si mesmo. */
  | 'equipe'
  /** Assinatura e cobrança do SaaS. */
  | 'planos'
  /** LGPD: consentimentos, exclusão de dados e o registro de quem fez o quê. */
  | 'privacidade'
  /** CRM: leads, funil, tarefas e conversão em paciente. */
  | 'crm'
  /** CRM: etapas do funil, tags, motivos de perda e excluir lead. */
  | 'crm_config';

/**
 * O que cada papel alcança.
 *
 * A clínica trabalha junto: quem atende precisa ver a agenda cheia, o cadastro,
 * o prontuário e quanto o paciente deve, sem depender do dono estar por perto.
 * Repartir isso em quatro perfis fazia a recepcionista bater numa parede no meio
 * do atendimento — e o dono acabaria dando o login dele para ela, que é o pior
 * dos dois mundos.
 *
 * O que fica trancado é o que não dá para desfazer nem faz parte de atender:
 * mexer em quem tem acesso, na cobrança e nos dados pessoais sob a LGPD.
 */
const ADMIN_ONLY: readonly Capability[] = ['equipe', 'planos', 'privacidade'];

const DIA_A_DIA: readonly Capability[] = [
  'agenda',
  'pacientes',
  'prontuario',
  'financeiro',
  'configuracoes',
  'campanhas',
];

/**
 * O CRM é trabalho de quem capta: a recepção move os leads, o dono e o admin
 * também arrumam o funil. O profissional fica de fora nesta primeira versão —
 * quem atende na cadeira não toca a captação.
 *
 * O papel é só metade da porta: a clínica também precisa ter o módulo
 * contratado (`Subscription.crmEnabled`), conferido em `crm/guard.ts`.
 */
const CRM: readonly Capability[] = ['crm'];
const CRM_ADMIN: readonly Capability[] = ['crm', 'crm_config'];

const GRANTS: Record<Role, readonly Capability[]> = {
  OWNER: [...DIA_A_DIA, ...ADMIN_ONLY, ...CRM_ADMIN],
  ADMIN: [...DIA_A_DIA, ...ADMIN_ONLY, ...CRM_ADMIN],
  RECEPTIONIST: [...DIA_A_DIA, ...CRM],
  PROFESSIONAL: DIA_A_DIA,
};

/**
 * Papel usado quando não conseguimos determinar o de verdade. O menor de todos:
 * se a consulta falhar ou o valor vier estranho, o certo é conceder de menos.
 */
export const LEAST_PRIVILEGE: Role = 'PROFESSIONAL';

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && value in GRANTS;
}

export function can(role: string | null | undefined, capability: Capability): boolean {
  const papel = isRole(role) ? role : LEAST_PRIVILEGE;
  return GRANTS[papel].includes(capability);
}

/** Rótulos para a mensagem que a pessoa lê na tela. */
const LABEL: Record<Capability, string> = {
  agenda: 'a agenda',
  pacientes: 'o cadastro de pacientes',
  prontuario: 'o prontuário clínico',
  financeiro: 'o financeiro',
  configuracoes: 'as configurações da clínica',
  campanhas: 'as campanhas',
  equipe: 'a gestão de quem tem acesso',
  planos: 'o plano e a cobrança',
  privacidade: 'os dados de privacidade e o histórico de alterações',
  crm: 'o CRM',
  crm_config: 'a configuração do funil do CRM',
};

export function capabilityDeniedMessage(capability: Capability): string {
  return `Seu perfil não tem acesso a ${LABEL[capability]}. Fale com o responsável pela clínica.`;
}
