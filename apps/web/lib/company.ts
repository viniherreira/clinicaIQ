/**
 * Quem está por trás do ClinicaIQ, para o rodapé e as páginas legais.
 *
 * A Meta (verificação da empresa) e a LGPD pedem que o site diga qual empresa
 * responde pelo serviço. Os dados vêm das variáveis públicas da Vercel, para
 * trocar sem mexer no código; sem elas, o rodapé só não mostra a linha.
 */
export const COMPANY = {
  brand: 'ClinicaIQ',
  /** Razão social, como no cartão CNPJ. */
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? '',
  /** CNPJ formatado: 00.000.000/0001-00. */
  cnpj: process.env.NEXT_PUBLIC_COMPANY_CNPJ ?? '',
  /** Para falar sobre dados pessoais (encarregado, LGPD art. 41). */
  privacyEmail: process.env.NEXT_PUBLIC_COMPANY_PRIVACY_EMAIL ?? '',
  /** Cidade e estado da sede, para o foro dos Termos. */
  city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? '',
};

/** "Fulano de Tal · CNPJ 00.000.000/0001-00", ou vazio sem os dados. */
export function companyLine(): string {
  return [COMPANY.legalName, COMPANY.cnpj && `CNPJ ${COMPANY.cnpj}`].filter(Boolean).join(' · ');
}
