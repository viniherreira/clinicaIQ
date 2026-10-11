import type { TenantPrismaClient } from '@clinicaiq/db';
import { clinicNowWall } from './clock';

/**
 * O que o card mostra da clínica — a próxima avaliação e o orçamento em
 * aberto — lido direto da agenda e dos orçamentos, nunca copiado para o CRM.
 *
 * Se um aviso da automação se perder, o card pode ficar numa etapa atrasada
 * (a recepção arrasta), mas a data e o valor que ele mostra estão sempre
 * certos.
 *
 * Duas consultas para o quadro inteiro, não duas por card.
 */

export interface LiveInfo {
  /** Hora de parede em UTC, no formato da agenda (ver `lib/tz.ts`). */
  nextAppointment?: { startTime: Date; professionalName: string };
  openQuote?: { id: string; number: number; totalCents: number };
}

export async function liveInfoForLeads(
  db: TenantPrismaClient,
  leads: readonly { id: string; patientId: string | null }[],
  now: Date = new Date(),
): Promise<Map<string, LiveInfo>> {
  const patientIds = [...new Set(leads.map((l) => l.patientId).filter((id): id is string => Boolean(id)))];
  const result = new Map<string, LiveInfo>();
  if (patientIds.length === 0) return result;

  const [consultas, orcamentos] = await Promise.all([
    db.appointment.findMany({
      where: {
        patientId: { in: patientIds },
        startTime: { gt: clinicNowWall(now) },
        status: { notIn: ['CANCELLED', 'MISSED'] },
      },
      orderBy: { startTime: 'asc' },
      select: { patientId: true, startTime: true, professional: { select: { name: true } } },
    }),
    db.quote.findMany({
      where: { patientId: { in: patientIds }, status: { in: ['DRAFT', 'SENT', 'VIEWED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, patientId: true, number: true, total: true },
    }),
  ]);

  // A lista vem ordenada: o primeiro de cada paciente é o que interessa.
  const proxima = new Map<string, LiveInfo['nextAppointment']>();
  for (const c of consultas) {
    if (!proxima.has(c.patientId)) proxima.set(c.patientId, { startTime: c.startTime, professionalName: c.professional.name });
  }
  const aberto = new Map<string, LiveInfo['openQuote']>();
  for (const q of orcamentos) {
    if (!aberto.has(q.patientId)) {
      aberto.set(q.patientId, { id: q.id, number: q.number, totalCents: Math.round(Number(q.total) * 100) });
    }
  }

  for (const lead of leads) {
    if (!lead.patientId) continue;
    const info: LiveInfo = {};
    const c = proxima.get(lead.patientId);
    const q = aberto.get(lead.patientId);
    if (c) info.nextAppointment = c;
    if (q) info.openQuote = q;
    if (c || q) result.set(lead.id, info);
  }
  return result;
}
