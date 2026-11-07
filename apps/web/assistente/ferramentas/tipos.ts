import type { z } from 'zod';
import type { TenantPrismaClient } from '@clinicaiq/db';
import type { Capability, Role } from '@/lib/permissions';

/** Quem pergunta e de onde. Montado pela rota, nunca pelo modelo. */
export interface Contexto {
  tenantId: string;
  userId: string;
  role: Role;
  /** Hoje no relógio da clínica, AAAA-MM-DD. */
  hoje: string;
  db: TenantPrismaClient;
}

/**
 * Uma consulta que o modelo pode pedir. Só leitura, sempre filtrada pela
 * clínica do contexto e exigindo `capability` do papel de quem pergunta.
 */
export interface Ferramenta<S extends z.ZodTypeAny = z.ZodTypeAny> {
  nome: string;
  /** Lida pelo modelo: diga quando usar e o que volta. */
  descricao: string;
  capability: Capability;
  entrada: S;
  executar(ctx: Contexto, input: z.infer<S>): Promise<unknown>;
}

/** Ajuda o TypeScript a inferir o tipo da entrada em cada arquivo. */
export function ferramenta<S extends z.ZodTypeAny>(f: Ferramenta<S>): Ferramenta<S> {
  return f;
}

export const LIMITE_LINHAS = 50;

export function limitar<T>(linhas: T[], max = LIMITE_LINHAS): { itens: T[]; total: number; cortado: boolean } {
  return { itens: linhas.slice(0, max), total: linhas.length, cortado: linhas.length > max };
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** "R$ 1.234,56". O Intl usa espaço fixo (U+00A0), então ele é trocado por espaço comum. */
export const reais = (cents: number) => brl.format(cents / 100).replace(/\u00a0/g, ' ');
