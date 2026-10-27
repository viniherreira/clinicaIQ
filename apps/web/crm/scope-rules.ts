import type { Prisma } from '@clinicaiq/db';

/**
 * Os filtros do que cada pessoa enxerga no CRM. Puro, para as listas, as
 * contagens e os testes usarem; as guardas das actions estão em `scope.ts`.
 */

export type Viewer = { userId: string; ownOnly?: boolean };

const deleOuSemNinguem = (userId: string) => [{ assignedToId: userId }, { assignedToId: null }];

/** Filtro de negócios para quem vê só os seus; `null` = vê tudo. */
export function leadScope(v: Viewer): Prisma.LeadWhereInput | null {
  return v.ownOnly ? { OR: deleOuSemNinguem(v.userId) } : null;
}

/** Filtro de conversas para quem vê só as suas; `null` = vê tudo. */
export function conversationScope(v: Viewer): Prisma.ConversationWhereInput | null {
  return v.ownOnly ? { OR: deleOuSemNinguem(v.userId) } : null;
}

/** Filtro de tarefas: as dele, ou as de negócios que ele enxerga. */
export function taskScope(v: Viewer): Prisma.LeadTaskWhereInput | null {
  return v.ownOnly ? { OR: [{ assignedToId: v.userId }, { lead: { OR: deleOuSemNinguem(v.userId) } }] } : null;
}

