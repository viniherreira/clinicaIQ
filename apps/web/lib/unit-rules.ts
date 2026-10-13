/**
 * Unidades da clínica (filiais), sem banco — testado em `unit-rules.test.ts`.
 *
 * A principal é a de menor `order`. Agendamento e expediente sem unidade
 * (de antes das unidades) contam como da principal.
 */

export interface UnitLite {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

export function mainUnit<T extends UnitLite>(units: readonly T[]): T | undefined {
  return [...units].sort((a, b) => a.order - b.order)[0];
}

/** As unidades que a pessoa vê. `unitIds` vazio = todas; nenhuma ativa sobrando = a principal. */
export function allowedUnits<T extends UnitLite>(units: readonly T[], unitIds: readonly string[]): T[] {
  const ativas = units.filter((u) => u.active).sort((a, b) => a.order - b.order);
  if (unitIds.length === 0) return ativas;
  const minhas = ativas.filter((u) => unitIds.includes(u.id));
  if (minhas.length) return minhas;
  const main = mainUnit(units);
  return main ? [main] : [];
}

/** A unidade escolhida (cookie) se a pessoa pode vê-la; senão a primeira dela. */
export function pickUnit<T extends UnitLite>(allowed: readonly T[], chosen: string | undefined | null): T | undefined {
  return allowed.find((u) => u.id === chosen) ?? allowed[0];
}

/** O agendamento (ou o expediente do dia) é desta unidade? */
export function inUnit(itemUnitId: string | null | undefined, unitId: string, mainId: string): boolean {
  return (itemUnitId ?? mainId) === unitId;
}

/** Filtro do Prisma para os agendamentos da unidade. */
export function unitAppointmentWhere(unitId: string, mainId: string) {
  return unitId === mainId ? { OR: [{ unitId }, { unitId: null }] } : { unitId };
}
