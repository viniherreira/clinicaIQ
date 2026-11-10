import { prisma, decrypt, type AppointmentStatus } from '@clinicaiq/db';
import {
  CloudApiError,
  getWhatsAppProvider,
  MockWhatsAppProvider,
  WHATSAPP_TEMPLATES,
  CONFIRMATION_BUTTONS,
  buildAppointmentCreatedBody,
  buildAppointmentConfirmationBody,
  buildQuoteSentBody,
  renderAppointmentTemplate,
  appointmentTemplateParams,
  quoteTemplateParams,
  type SendMessageParams,
  type SendMessageResult,
  type AppointmentMessageData,
  type WhatsAppProvider,
} from '@clinicaiq/whatsapp';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { normalizeBrazilPhone } from './phone';
import { siteUrl } from './company';
import { activeCloudAccount, cloudClient, type CloudAccount } from './cloud-account';
import { agendaParams, fillMetaBody, withButtonPrompt, type AgendaPurpose } from './agenda-templates';
import { approvedAgendaTemplate } from './agenda-templates-sync';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

function safeDecrypt(ciphertext: string | null | undefined, tenantId: string): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext, getMasterKey(), tenantId);
  } catch {
    return null;
  }
}

export { normalizeBrazilPhone };

const appUrl = siteUrl;

/** Meta only accepts business-initiated messages via pre-approved templates.
 *  While templates aren't approved yet (or when testing inside a 24h session
 *  window), keep this off to send the formatted body as plain text instead. */
function templatesEnabled(): boolean {
  return process.env.WHATSAPP_USE_TEMPLATES === 'true';
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Turns internal send-failure codes into something the clinic can act on. */
function friendlyError(code: string): string {
  const map: Record<string, string> = {
    'numero-sem-whatsapp':
      'WhatsApp não encontrado neste número. Confira o cadastro (DDD + 9 dígitos, ex: 11 99999-9999)',
    'patient-without-phone': 'Paciente sem telefone cadastrado',
    'not-configured': 'Não enviada: o WhatsApp da clínica ainda não está conectado. Conecte o número na tela WhatsApp',
    'birthday-unavailable': 'Não enviada: a mensagem de aniversário ainda não sai pela API oficial do WhatsApp',
    'quote-unavailable':
      'Não enviado pelo WhatsApp: o orçamento ainda não sai pela API oficial. Mande o link pela conversa do paciente',
    'automation-disabled': 'Envio desligado nas configurações',
    'invalid-number': 'Número de telefone inválido',
    'empty-body': 'Mensagem vazia',
    'template-pending':
      'Aguardando a Meta aprovar o texto desta mensagem. Acompanhe em Configurações › Comunicação',
  };
  return map[code] ?? code;
}

// ─── Provider routing ────────────────────────────────────────────────────────

export type WhatsAppAutomation = 'onCreate' | 'reminder' | 'birthday';

/**
 * Quem manda quando a clínica não tem a API oficial ligada: o número geral do
 * ambiente (Meta) ou, no desenvolvimento, o simulador. A API oficial de cada
 * clínica é tratada antes, em `prepareAppointmentMessage`.
 *
 * `skip` quando a clínica desligou essa mensagem ou não há por onde mandar.
 */
type ProviderOutcome =
  | { kind: 'send'; provider: WhatsAppProvider }
  | { kind: 'skip'; error: string };

/** A clínica deixou esta mensagem ligada? (Configurações › Comunicação) */
async function automationEnabled(tenantId: string, automation: WhatsAppAutomation): Promise<boolean> {
  const s = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { notifyOnCreate: true, notifyReminder: true, notifyBirthday: true },
  });
  return automation === 'onCreate'
    ? (s?.notifyOnCreate ?? true)
    : automation === 'reminder'
      ? (s?.notifyReminder ?? true)
      : (s?.notifyBirthday ?? false);
}

/** O envio geral do ambiente nunca é o simulador em produção. */
function envProviderReady(provider: WhatsAppProvider): boolean {
  return !(provider instanceof MockWhatsAppProvider && process.env.NODE_ENV === 'production');
}

async function resolveProvider(tenantId: string, automation: WhatsAppAutomation): Promise<ProviderOutcome> {
  if (!(await automationEnabled(tenantId, automation))) return { kind: 'skip', error: 'automation-disabled' };
  const provider = getWhatsAppProvider();
  // Em produção o simulador nunca entra: ele "envia" sem mandar nada, e a
  // clínica acharia que o paciente foi avisado. Melhor dizer que não saiu.
  if (!envProviderReady(provider)) return { kind: 'skip', error: 'not-configured' };
  return { kind: 'send', provider };
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface WhatsAppHealth {
  /** A clínica tem a API oficial ligada. */
  paired: boolean;
  /** Safe to send right now. */
  connected: boolean;
  /** Short, actionable sentence when something is wrong. */
  problem: string | null;
}

/** Se o WhatsApp da clínica consegue mandar agora (para a agenda avisar). */
export async function getWhatsAppHealth(tenantId: string): Promise<WhatsAppHealth> {
  const oficial = await prisma.whatsAppCloudAccount.findUnique({
    where: { tenantId },
    select: { active: true, status: true, lastError: true },
  });
  if (oficial?.active) {
    if (oficial.status === 'CONNECTED') return { paired: true, connected: true, problem: null };
    return {
      paired: true,
      connected: false,
      problem: `A conexão com o WhatsApp oficial parou${oficial.lastError ? ` (${oficial.lastError})` : ''}. As confirmações estão pausadas.`,
    };
  }

  // Sem a API oficial. Se o envio geral também não manda nada de verdade (o
  // simulador, em produção), a clínica precisa saber.
  return {
    paired: false,
    connected: false,
    problem: envProviderReady(getWhatsAppProvider())
      ? null
      : 'O WhatsApp da clínica ainda não está conectado, então as confirmações não estão saindo. Conecte o número na tela WhatsApp.',
  };
}

interface OutboxEntry {
  tenantId: string;
  patientId: string;
  appointmentId?: string;
  quoteId?: string;
  templateName: string;
  content: string;
  /** Lembrete da agenda: quantos dias antes da consulta. */
  reminderDays?: number;
}

/**
 * Logs a message that was never attempted, so the clinic can see *why* in the
 * history instead of wondering why a patient got nothing. Deliberately silent
 * for `automation-disabled` — that's the clinic's own setting, not a fault.
 */
async function recordSkip(error: string, entry: OutboxEntry): Promise<void> {
  if (error === 'automation-disabled') return;
  await prisma.whatsAppMessage
    .create({
      data: {
        tenantId: entry.tenantId,
        patientId: entry.patientId,
        appointmentId: entry.appointmentId ?? null,
        quoteId: entry.quoteId ?? null,
        direction: 'OUTBOUND',
        templateName: entry.templateName,
        content: entry.content,
        reminderDays: entry.reminderDays ?? null,
        status: 'FAILED',
        errorMessage: friendlyError(error),
      },
    })
    .catch(() => undefined);
}

/**
 * Opens an outbox row before anything is attempted.
 *
 * Written first on purpose. The send runs inside `after()`, where a timeout or a
 * function killed mid-flight used to leave no trace at all — the patient got
 * nothing and the clinic had nothing on screen to tell them so. With the row
 * already in place, the worst case is a retry instead of a silent loss.
 */
async function openOutboxRow(entry: OutboxEntry): Promise<string | null> {
  const row = await prisma.whatsAppMessage
    .create({
      data: {
        tenantId: entry.tenantId,
        patientId: entry.patientId,
        appointmentId: entry.appointmentId ?? null,
        quoteId: entry.quoteId ?? null,
        direction: 'OUTBOUND',
        templateName: entry.templateName,
        content: entry.content,
        reminderDays: entry.reminderDays ?? null,
        status: 'PENDING',
        attempts: 1,
        lastAttemptAt: new Date(),
      },
      select: { id: true },
    })
    .catch(() => null);
  return row?.id ?? null;
}

/**
 * Records how the attempt went. Meta answers about acceptance synchronously, so
 * SENT is honest; delivery and read come later through the webhook. There is no
 * retry queue for these messages: a failure is final and says why.
 *
 * Guarded by `externalId: null` so a status the webhook already wrote is never
 * overwritten.
 */
async function closeAttempt(messageId: string, result: SendMessageResult): Promise<void> {
  await prisma.whatsAppMessage
    .updateMany({
      where: { id: messageId, externalId: null },
      data: result.success
        ? { status: 'SENT', externalId: result.messageId ?? null, sentAt: new Date(), errorMessage: null }
        : { status: 'FAILED', errorMessage: friendlyError(result.error ?? 'send-failed') },
    })
    .catch(() => undefined);
}

// ─── Outbound: appointments ──────────────────────────────────────────────────

/** A send that has been recorded and is ready to hand to its provider. */
export interface PreparedSend {
  rowId: string;
  provider: WhatsAppProvider;
  params: SendMessageParams;
}

/**
 * Either something left to send, or an outcome already settled — the automation
 * is off, the patient has no phone, the row was queued for the outbox.
 */
export type Preparation =
  | { kind: 'send'; send: PreparedSend }
  | { kind: 'done'; result: SendMessageResult };

/**
 * Records the "created" or "reminder" message and works out how to send it,
 * without sending anything yet.
 *
 * Split from the send so a caller can do this part *synchronously*, while it
 * still controls the request. `after()` is an optimisation, not a guarantee: if
 * the platform never runs the callback, the booking prepared here still left a
 * row in the history. Prepared inside `after()`, it left no trace at all.
 */
export async function prepareAppointmentMessage(
  appointmentId: string,
  kind: 'created' | 'reminder',
  opts: { reminderDays?: number } = {},
): Promise<Preparation> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      tenantId: true,
      startTime: true,
      patient: { select: { id: true, name: true, phoneEncrypted: true } },
      professional: { select: { name: true } },
      procedure: { select: { name: true } },
      tenant: { select: { name: true } },
      unit: { select: { name: true } },
    },
  });
  if (!appt) return { kind: 'done', result: { success: false, error: 'appointment-not-found' } };
  // Com mais de uma unidade, o paciente precisa saber qual: "Clínica Sorriso – Centro".
  const unidades = appt.unit ? await prisma.clinicUnit.count({ where: { tenantId: appt.tenantId, active: true } }) : 0;
  const clinicName =
    appt.unit && unidades > 1 && appt.unit.name !== appt.tenant.name ? `${appt.tenant.name} (${appt.unit.name})` : appt.tenant.name;

  const phone = safeDecrypt(appt.patient.phoneEncrypted, appt.tenantId);
  if (!phone) return { kind: 'done', result: { success: false, error: 'patient-without-phone' } };

  const data: AppointmentMessageData = {
    patientName: appt.patient.name,
    clinicName,
    professionalName: appt.professional.name,
    procedureName: appt.procedure?.name ?? null,
    dateLabel: format(appt.startTime, "EEEE, dd/MM", { locale: ptBR }),
    timeLabel: format(appt.startTime, 'HH:mm'),
  };

  const isReminder = kind === 'reminder';
  const reminderDays = isReminder ? opts.reminderDays : undefined;
  const templateName = isReminder
    ? WHATSAPP_TEMPLATES.appointmentConfirmation
    : WHATSAPP_TEMPLATES.appointmentCreated;

  // Texto escolhido pela clínica, quando houver. O padrão continua valendo para
  // quem nunca editou — e é o que aparece pré-preenchido na tela, para editar
  // ser mudar uma frase e não escrever do zero.
  const escolhido = await prisma.whatsAppSession.findUnique({
    where: { tenantId: appt.tenantId },
    select: { createdMessage: true, reminderMessage: true },
  });
  const salvo = (isReminder ? escolhido?.reminderMessage : escolhido?.createdMessage)?.trim();
  const personalizado = salvo ? withButtonPrompt(salvo) : undefined;

  const body = personalizado
    ? renderAppointmentTemplate(personalizado, data)
    : isReminder
      ? buildAppointmentConfirmationBody(data)
      : buildAppointmentCreatedBody(data);

  const automation = isReminder ? 'reminder' : 'onCreate';
  // A API oficial da clínica ganha de tudo: sai pelo número dela, com o modelo aprovado.
  const cloud = await activeCloudAccount(appt.tenantId);
  if (cloud) {
    if (!(await automationEnabled(appt.tenantId, automation))) {
      return { kind: 'done', result: { success: false, error: 'automation-disabled' } };
    }
    return prepareCloudAppointment(cloud, {
      tenantId: appt.tenantId,
      patientId: appt.patient.id,
      appointmentId: appt.id,
      templateName,
      reminderDays,
      purpose: isReminder ? 'APPOINTMENT_REMINDER' : 'APPOINTMENT_CREATED',
      to: normalizeBrazilPhone(phone),
      data,
      fallbackBody: body,
    });
  }

  const outcome = await resolveProvider(appt.tenantId, automation);
  if (outcome.kind === 'skip') {
    await recordSkip(outcome.error, {
      tenantId: appt.tenantId,
      patientId: appt.patient.id,
      appointmentId: appt.id,
      templateName,
      reminderDays,
      content: body,
    });
    return { kind: 'done', result: { success: false, error: outcome.error } };
  }

  // The row exists before the send does — see openOutboxRow.
  const rowId = await openOutboxRow({
    tenantId: appt.tenantId,
    patientId: appt.patient.id,
    appointmentId: appt.id,
    templateName,
    reminderDays,
    content: body,
  });
  if (!rowId) return { kind: 'done', result: { success: false, error: 'outbox-write-failed' } };

  return {
    kind: 'send',
    send: {
      rowId,
      provider: outcome.provider,
      params: {
        to: normalizeBrazilPhone(phone),
        body,
        ref: rowId,
        // With approved templates: the structured template + its {{1}}..{{5}}
        // params (business-initiated, no 24h window). The webhook still
        // understands a typed "1"/"2"/"confirmar" either way.
        ...(templatesEnabled()
          ? { templateName, templateParams: appointmentTemplateParams(data) }
          : { buttons: CONFIRMATION_BUTTONS.map((b) => ({ ...b })) }),
      },
    },
  };
}

/**
 * O aviso da agenda pela API oficial: o modelo aprovado mais novo do aviso, com
 * as variáveis na ordem dele e os botões que a clínica escolheu. Sem modelo
 * aprovado ainda, fica registrado no histórico e nada sai.
 */
async function prepareCloudAppointment(
  account: CloudAccount,
  m: {
    tenantId: string;
    patientId: string;
    appointmentId: string;
    templateName: string;
    reminderDays?: number;
    purpose: AgendaPurpose;
    to: string;
    data: AppointmentMessageData;
    fallbackBody: string;
  },
): Promise<Preparation> {
  const entry = {
    tenantId: m.tenantId,
    patientId: m.patientId,
    appointmentId: m.appointmentId,
    templateName: m.templateName,
    reminderDays: m.reminderDays,
  };
  const modelo = await approvedAgendaTemplate(m.tenantId, m.purpose);
  if (!modelo) {
    await recordSkip('template-pending', { ...entry, content: m.fallbackBody });
    return { kind: 'done', result: { success: false, error: 'template-pending' } };
  }
  const params = agendaParams(modelo.varKeys, m.data);
  const content = fillMetaBody(modelo.body, params);

  const rowId = await openOutboxRow({ ...entry, content });
  if (!rowId) return { kind: 'done', result: { success: false, error: 'outbox-write-failed' } };

  const provider: WhatsAppProvider = {
    async sendMessage(p) {
      try {
        const api = cloudClient(account);
        const crm = await import('@/crm/agenda-mirror');
        // Paciente escreveu nas últimas 24 horas: sai como mensagem comum com os
        // mesmos botões, que é grátis e não depende de cartão na Meta. Se a Meta
        // disser que a janela fechou nesse meio-tempo, vai o modelo aprovado.
        let r: { id: string } | null = null;
        if (await crm.patientWindowOpen(m.tenantId, p.to, m.patientId).catch(() => false)) {
          r = await api
            .sendButtons(p.to, content, modelo.buttons.map((b) => ({ id: b.payload, title: b.text })))
            .catch((e) => {
              if (e instanceof CloudApiError && e.windowClosed) return null;
              throw e;
            });
        }
        r ??= await api.sendTemplate(p.to, modelo.name, modelo.language, params, modelo.buttons.map((b) => b.payload));
        const externalId = r.id;
        // Com o CRM, o aviso aparece na conversa do paciente que já é do CRM.
        // Falhar aqui não desfaz o envio.
        await crm
          .mirrorAgendaToCrm(m.tenantId, { phone: p.to, text: content, externalId, buttons: modelo.buttons, patientId: m.patientId })
          .catch((e) => console.error('[agenda] aviso não foi para o CRM', e instanceof Error ? e.message : e));
        return { success: true, messageId: externalId };
      } catch (e) {
        return { success: false, error: e instanceof CloudApiError ? e.userMessage : 'send-failed' };
      }
    },
    parseWebhook: () => null,
  };
  return { kind: 'send', send: { rowId, provider, params: { to: m.to, body: content, ref: rowId } } };
}

/** Hands a prepared send to its provider and settles the history row. */
export async function deliverPrepared(send: PreparedSend): Promise<SendMessageResult> {
  const result = await send.provider.sendMessage(send.params);
  await closeAttempt(send.rowId, result);
  return result;
}

/**
 * Prepare and send in one go, for callers already running in the background —
 * the reminder cron and the BullMQ worker, where there is no response to race.
 */
export async function dispatchAppointmentMessage(
  appointmentId: string,
  kind: 'created' | 'reminder',
  opts: { reminderDays?: number } = {},
): Promise<SendMessageResult> {
  const prepared = await prepareAppointmentMessage(appointmentId, kind, opts);
  return prepared.kind === 'done' ? prepared.result : deliverPrepared(prepared.send);
}

// ─── Outbound: quotes ────────────────────────────────────────────────────────

export async function dispatchQuoteMessage(quoteId: string): Promise<SendMessageResult> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      tenantId: true,
      publicToken: true,
      total: true,
      validUntil: true,
      patient: { select: { id: true, name: true, phoneEncrypted: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!quote) return { success: false, error: 'quote-not-found' };

  const phone = safeDecrypt(quote.patient.phoneEncrypted, quote.tenantId);
  if (!phone) return { success: false, error: 'patient-without-phone' };

  const quoteData = {
    patientName: quote.patient.name,
    clinicName: quote.tenant.name,
    totalLabel: formatBRL(Number(quote.total)),
    validUntilLabel: format(quote.validUntil, 'dd/MM/yyyy'),
    link: `${appUrl()}/orcamento/${quote.publicToken}`,
  };
  const body = buildQuoteSentBody(quoteData);

  // Pela API oficial, mensagem que a clínica começa precisa de modelo aprovado,
  // e o orçamento ainda não tem um: fica registrado por que não saiu.
  const outcome: ProviderOutcome = (await activeCloudAccount(quote.tenantId))
    ? { kind: 'skip', error: 'quote-unavailable' }
    : await resolveProvider(quote.tenantId, 'onCreate');
  if (outcome.kind === 'skip') {
    await recordSkip(outcome.error, {
      tenantId: quote.tenantId,
      patientId: quote.patient.id,
      quoteId: quote.id,
      templateName: WHATSAPP_TEMPLATES.quoteSent,
      content: body,
    });
    return { success: false, error: outcome.error };
  }

  const rowId = await openOutboxRow({
    tenantId: quote.tenantId,
    patientId: quote.patient.id,
    quoteId: quote.id,
    templateName: WHATSAPP_TEMPLATES.quoteSent,
    content: body,
  });
  if (!rowId) return { success: false, error: 'outbox-write-failed' };

  const result = await outcome.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    ref: rowId,
    ...(templatesEnabled()
      ? { templateName: WHATSAPP_TEMPLATES.quoteSent, templateParams: quoteTemplateParams(quoteData) }
      : {}),
  });

  await closeAttempt(rowId, result);
  return result;
}

// ─── Outbound: birthdays ─────────────────────────────────────────────────────

/**
 * A mensagem de aniversário. Saía só pelo número da clínica pareado por QR; pela
 * API oficial ela é marketing e precisa de um modelo aprovado, que ainda não
 * existe. Até lá não sai nada (e a tela WhatsApp não deixa ligar).
 */
export async function dispatchBirthdayMessage(patientId: string): Promise<SendMessageResult> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { tenantId: true, active: true, deletedAt: true },
  });
  if (!patient || !patient.active || patient.deletedAt) {
    return { success: false, error: 'patient-unavailable' };
  }
  if (!(await automationEnabled(patient.tenantId, 'birthday'))) return { success: false, error: 'automation-disabled' };
  return { success: false, error: 'birthday-unavailable' };
}

// ─── Inbound: patient responses (webhook) ────────────────────────────────────

const BUTTON_TO_STATUS: Record<string, AppointmentStatus> = {
  confirm: 'CONFIRMED',
  reschedule: 'RESCHEDULED',
  cancel: 'CANCELLED',
};

/** Maps a button id (preferred) or free text to an appointment status. The
 *  numbered replies are still understood from older messages that asked for them. */
export function resolveResponseStatus(
  buttonReplyId?: string,
  text?: string,
): AppointmentStatus | null {
  if (buttonReplyId && BUTTON_TO_STATUS[buttonReplyId]) return BUTTON_TO_STATUS[buttonReplyId];
  const t = (text ?? '').trim().toLowerCase();
  if (/^1\b/.test(t) || /\bconfirm/.test(t)) return 'CONFIRMED';
  if (/^2\b/.test(t) || /remarc|reagend/.test(t)) return 'RESCHEDULED';
  // Cancel isn't offered as an option, but an explicit "cancelar" is respected.
  if (/\bcancel/.test(t)) return 'CANCELLED';
  return null;
}

/**
 * Resolves which appointment an inbound message refers to by matching the
 * sender's phone against recent confirmation messages (bounded window). Meta
 * webhooks identify the sender only by phone, and phones are encrypted at rest,
 * so we decrypt the small set of candidates rather than querying by plaintext.
 */
export async function resolveAppointmentByPhone(
  fromPhone: string,
  tenantId?: string,
): Promise<string | null> {
  const target = normalizeBrazilPhone(fromPhone);
  if (!target) return null;

  // Match against both the booking and reminder messages, since a patient may
  // reply to either. A week's window covers appointments booked well ahead.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.whatsAppMessage.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      direction: 'OUTBOUND',
      templateName: {
        in: [WHATSAPP_TEMPLATES.appointmentConfirmation, WHATSAPP_TEMPLATES.appointmentCreated],
      },
      createdAt: { gte: since },
      appointment: { status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] } },
    },
    select: {
      tenantId: true,
      appointmentId: true,
      patient: { select: { phoneEncrypted: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  for (const c of candidates) {
    if (!c.appointmentId) continue;
    const phone = safeDecrypt(c.patient.phoneEncrypted, c.tenantId);
    if (phone && normalizeBrazilPhone(phone) === target) return c.appointmentId;
  }
  return null;
}

/**
 * Applies a patient's response to an appointment: updates the status and records
 * the INBOUND message. Returns whether a change was made.
 */
export async function applyAppointmentResponse(
  appointmentId: string,
  opts: { buttonReplyId?: string; text?: string; externalId?: string; tenantId?: string },
): Promise<boolean> {
  const status = resolveResponseStatus(opts.buttonReplyId, opts.text);
  if (!status) return false;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, tenantId: true, patientId: true },
  });
  if (!appt) return false;

  // O único chamador hoje deriva o id de uma busca já escopada, então nada
  // vaza. Mas esta função é exportada: conferir o tenant quando ele é conhecido
  // impede que um chamador futuro confirme o agendamento de outra clínica.
  if (opts.tenantId && appt.tenantId !== opts.tenantId) return false;

  // A Meta reenvia o mesmo evento quando não recebe 200 a tempo: a resposta já registrada não conta de novo.
  if (
    opts.externalId &&
    (await prisma.whatsAppMessage.findFirst({
      where: { tenantId: appt.tenantId, externalId: opts.externalId, direction: 'INBOUND' },
      select: { id: true },
    }))
  ) {
    return false;
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status },
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: appt.tenantId,
      patientId: appt.patientId,
      appointmentId: appt.id,
      direction: 'INBOUND',
      content: opts.text ?? opts.buttonReplyId ?? '',
      status: 'READ',
      externalId: opts.externalId ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: appt.tenantId,
      action: `WHATSAPP_RESPONSE_${status}`,
      entity: 'Appointment',
      entityId: appt.id,
    },
  });

  return true;
}

/**
 * Marks the patient behind a phone number as opted out of campaigns. Phones are
 * encrypted at rest, so we decrypt the tenant's patients to find the match —
 * bounded by tenant, and only for patients who could actually be messaged.
 */
export async function optOutByPhone(fromPhone: string, tenantId: string): Promise<boolean> {
  const target = normalizeBrazilPhone(fromPhone);
  if (!target) return false;

  const patients = await prisma.patient.findMany({
    where: { tenantId, deletedAt: null, whatsappOptOut: false },
    select: { id: true, phoneEncrypted: true },
    take: 5000,
  });

  for (const p of patients) {
    const phone = safeDecrypt(p.phoneEncrypted, tenantId);
    if (phone && normalizeBrazilPhone(phone) === target) {
      await prisma.patient.update({ where: { id: p.id }, data: { whatsappOptOut: true } });
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'WHATSAPP_OPT_OUT',
          entity: 'Patient',
          entityId: p.id,
        },
      });
      return true;
    }
  }
  return false;
}

/** Updates delivery status (delivered/read/failed) for a message by externalId. */
export async function applyMessageStatus(
  externalId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  /** Motivo da Meta quando falhou, para a clínica ver por que não chegou. */
  error?: string | null,
): Promise<void> {
  const map: Record<string, { status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; field?: 'deliveredAt' | 'readAt' }> = {
    sent: { status: 'SENT' },
    delivered: { status: 'DELIVERED', field: 'deliveredAt' },
    read: { status: 'READ', field: 'readAt' },
    failed: { status: 'FAILED' },
  };
  const m = map[status];
  if (!m) return;

  await prisma.whatsAppMessage.updateMany({
    where: { externalId },
    data: {
      status: m.status,
      ...(m.field ? { [m.field]: new Date() } : {}),
      ...(m.status === 'FAILED' && error ? { errorMessage: error } : {}),
    },
  });
}
