import { z } from 'zod';
import { addDays, format, isValid, parseISO, subMonths } from 'date-fns';

export const DATA_ISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')
  .refine((v) => {
    const d = parseISO(v);
    return isValid(d) && format(d, 'yyyy-MM-dd') === v;
  }, 'data inexistente no calendário');

/**
 * Um dia da agenda. Os agendamentos guardam a hora de parede em UTC
 * (app/agendar/[slug]/actions.ts faz igual), então o dia é 00:00Z a 23:59Z.
 */
export function diaDeParede(data: string): { inicio: Date; fim: Date } {
  return { inicio: new Date(`${data}T00:00:00.000Z`), fim: new Date(`${data}T23:59:59.999Z`) };
}

/**
 * Período de instantes reais (Payment.paidAt), de `inicio` até o fim de `fim`,
 * no relógio da clínica. Brasília não tem horário de verão desde 2019: -03:00.
 */
export function periodoReal(inicio: string, fim: string): { gte: Date; lt: Date } {
  const depois = format(addDays(parseISO(fim), 1), 'yyyy-MM-dd');
  return { gte: new Date(`${inicio}T00:00:00-03:00`), lt: new Date(`${depois}T00:00:00-03:00`) };
}

export function subtrairMeses(data: string, meses: number): string {
  return format(subMonths(parseISO(data), meses), 'yyyy-MM-dd');
}
