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
  /** Configuração da clínica: profissionais, horários, procedimentos, WhatsApp. */
  | 'configuracoes'
  /** Assinatura e cobrança do SaaS. */
  | 'planos'
  /** Disparo de mensagem em massa. */
  | 'campanhas';

/**
 * O que cada papel alcança.
 *
 * A recepcionista marca consulta e recebe pagamento, mas não abre prontuário —
 * histórico de saúde não é necessário para agendar, e o acesso mínimo é o que a
 * LGPD espera. O profissional é o inverso: precisa do prontuário inteiro e não
 * tem nada que fazer no financeiro nem na assinatura.
 */
const GRANTS: Record<Role, readonly Capability[]> = {
  OWNER: ['agenda', 'pacientes', 'prontuario', 'financeiro', 'configuracoes', 'planos', 'campanhas'],
  ADMIN: ['agenda', 'pacientes', 'prontuario', 'financeiro', 'configuracoes', 'planos', 'campanhas'],
  RECEPTIONIST: ['agenda', 'pacientes', 'financeiro', 'campanhas'],
  PROFESSIONAL: ['agenda', 'pacientes', 'prontuario'],
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
  planos: 'o plano e a cobrança',
  campanhas: 'as campanhas',
};

export function capabilityDeniedMessage(capability: Capability): string {
  return `Seu perfil não tem acesso a ${LABEL[capability]}. Fale com o responsável pela clínica.`;
}
