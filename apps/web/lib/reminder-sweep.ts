import 'server-only';
import { addDays, format, parseISO } from 'date-fns';
import { prisma } from '@clinicaiq/db';
import { WHATSAPP_TEMPLATES } from '@clinicaiq/whatsapp';
import { readReminderDays } from './agenda-options';
import { dispatchAppointmentMessage } from './whatsapp';
import { clinicToday } from './tz';

/** Marcada há menos que isto não recebe lembrete hoje: o aviso do agendamento acabou de sair. */
const JUST_BOOKED_MS = 12 * 60 * 60 * 1000;
/** "No dia": o cron roda de manhã (9h), então só as consultas a partir das 10h. */
const SAME_DAY_FROM = '10:00';

export interface ReminderRound {
  days: number;
  date: string;
  candidates: number;
  sent: number;
  failed: number;
}

/**
 * Os lembretes que vencem hoje. Cada clínica escolhe os dias (1 semana, 3 dias,
 * 2 dias, 1 dia antes, no dia); quem nunca escolheu fica com 1 dia antes. Uma
 * rodada por dia escolhido, e cada consulta recebe cada lembrete uma vez só.
 * `tenantId` limita a uma clínica (o teste usa; o cron passa por todas).
 */
export async function sendDueReminders(opts: { tenantId?: string } = {}): Promise<ReminderRound[]> {
  const sessoes = await prisma.whatsAppSession.findMany({
    where: opts.tenantId ? { tenantId: opts.tenantId } : undefined,
    select: { tenantId: true, reminderDays: true, notifyOnCreate: true },
  });
  const diasDe = new Map(sessoes.map((s) => [s.tenantId, readReminderDays(s.reminderDays)]));
  const avisaAoMarcar = new Set(sessoes.filter((s) => s.notifyOnCreate).map((s) => s.tenantId));
  const rodadas = [...new Set([1, ...[...diasDe.values()].flat()])].sort((a, b) => b - a);
  const comDia = (days: number) => sessoes.filter((s) => diasDe.get(s.tenantId)?.includes(days)).map((s) => s.tenantId);

  const today = clinicToday();
  const recemMarcada = new Date(Date.now() - JUST_BOOKED_MS);
  const porDia: ReminderRound[] = [];

  for (const days of rodadas) {
    // Appointments are stored as wall-clock-in-UTC, so "N days from now in the
    // clinic" is the UTC calendar day matching that clinic date. On the day
    // itself, only what is still ahead of the morning run.
    const date = format(addDays(parseISO(today), days), 'yyyy-MM-dd');
    const from = new Date(`${date}T${days === 0 ? SAME_DAY_FROM : '00:00'}:00.000Z`);
    const to = new Date(`${date}T23:59:59.999Z`);
    const comOutrosDias = sessoes.map((s) => s.tenantId).filter((t) => !comDia(days).includes(t));

    const appointments = await prisma.appointment.findMany({
      where: {
        AND: [
          // Sem nada salvo, a clínica fica no padrão (1 dia antes).
          { tenantId: days === 1 ? { notIn: comOutrosDias } : { in: comDia(days) } },
          ...(opts.tenantId ? [{ tenantId: opts.tenantId }] : []),
        ],
        startTime: { gte: from, lte: to },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
        messages: {
          none: {
            direction: 'OUTBOUND',
            templateName: WHATSAPP_TEMPLATES.appointmentConfirmation,
            // Os lembretes de antes eram todos de 1 dia e não guardavam o dia.
            OR: days === 1 ? [{ reminderDays: 1 }, { reminderDays: null }] : [{ reminderDays: days }],
          },
        },
      },
      select: { id: true, tenantId: true, createdAt: true },
      take: 500,
    });

    const rodada: ReminderRound = { days, date, candidates: 0, sent: 0, failed: 0 };
    for (const appt of appointments) {
      // Marcou há pouco: acabou de receber o aviso do agendamento.
      const avisada = !diasDe.has(appt.tenantId) || avisaAoMarcar.has(appt.tenantId);
      if (avisada && appt.createdAt > recemMarcada) continue;
      rodada.candidates++;
      try {
        const res = await dispatchAppointmentMessage(appt.id, 'reminder', { reminderDays: days });
        if (res.success) rodada.sent++;
        else rodada.failed++;
      } catch {
        rodada.failed++;
      }
    }
    porDia.push(rodada);
  }
  return porDia;
}
