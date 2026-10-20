/**
 * Quem está por trás do DreamClin, para o rodapé e as páginas legais.
 *
 * A Meta (verificação da empresa) e a LGPD pedem que o site diga qual empresa
 * responde pelo serviço. Os dados vêm das variáveis públicas da Vercel, para
 * trocar sem mexer no código; sem elas, o rodapé só não mostra a linha.
 */
export const COMPANY = {
  brand: 'DreamClin',
  /** Razão social, como no cartão CNPJ. */
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? '',
  /** CNPJ formatado: 00.000.000/0001-00. */
  cnpj: process.env.NEXT_PUBLIC_COMPANY_CNPJ ?? '',
  /** Para falar sobre dados pessoais (encarregado, LGPD art. 41). */
  privacyEmail: process.env.NEXT_PUBLIC_COMPANY_PRIVACY_EMAIL ?? '',
  /** Cidade e estado da sede, para o foro dos Termos. */
  city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? '',
  /** WhatsApp de vendas e suporte, com DDD. */
  whatsapp: process.env.NEXT_PUBLIC_COMPANY_WHATSAPP ?? '',
};

/** Texto que já vem escrito quando a pessoa abre a conversa pelo site. */
export const SALES_GREETING = 'Olá! Vim pelo site do DreamClin e quero saber mais.';

/**
 * Link `wa.me` para falar com a gente, ou `null` sem um número válido — aí o
 * site esconde o botão em vez de levar para um número quebrado. Aceita o
 * número com ou sem 55, com qualquer pontuação.
 */
export function salesWhatsAppUrl(number: string = COMPANY.whatsapp, text: string = SALES_GREETING): string | null {
  let digits = number.replace(/\D/g, '');
  // Com "+", o código do país foi escrito: só aceitamos o do Brasil.
  const explicitCountry = number.trim().startsWith('+');
  if (!explicitCountry && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** "Fulano de Tal · CNPJ 00.000.000/0001-00", ou vazio sem os dados. */
export function companyLine(): string {
  return [COMPANY.legalName, COMPANY.cnpj && `CNPJ ${COMPANY.cnpj}`].filter(Boolean).join(' · ');
}

/**
 * Endereço público do sistema, para os links que saem por WhatsApp e e-mail
 * (aceitar orçamento, convite da equipe). `NEXT_PUBLIC_APP_URL` manda; sem ela,
 * produção usa o domínio oficial e o resto, a máquina local.
 */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_ENV === 'production' ? 'https://www.dreamclin.com' : 'http://localhost:3000');
  return url.replace(/\/+$/, '');
}
