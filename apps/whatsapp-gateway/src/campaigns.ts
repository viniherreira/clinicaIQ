import { prisma, decrypt } from './db.js';
import { env } from './env.js';
import { send } from './session-manager.js';

/**
 * Sending a bulk campaign is where a QR-paired line gets banned, so delivery is
 * deliberately slow and irregular: a randomised gap between messages, and a
 * longer breather every so often. A clinic sending 80 promos over an hour looks
 * like a busy receptionist; the same 80 in a minute looks like a bot.
 */
const MIN_GAP_MS = 12_000;
const MAX_GAP_MS = 28_000;
/** Extra pause after this many messages, mimicking a human stepping away. */
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 120_000;

const running = new Set<string>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));

function phoneOf(ciphertext: string, tenantId: string): string | null {
  try {
    const digits = decrypt(ciphertext, env.ENCRYPTION_MASTER_KEY, tenantId).replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.startsWith('55') ? digits : `55${digits}`;
  } catch {
    return null;
  }
}

/** `{nome}` is the one variable clinics actually asked for; keep it predictable. */
function personalise(template: string, patientName: string): string {
  const first = patientName.trim().split(/\s+/)[0] ?? patientName;
  return template.replace(/\{nome\}/gi, first);
}

/**
 * Runs a campaign to completion in the background. Safe to call twice — a
 * campaign already in flight is ignored rather than double-sent.
 */
export async function runCampaign(tenantId: string, campaignId: string): Promise<void> {
  if (running.has(campaignId)) return;
  running.add(campaignId);

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, message: true, status: true },
    });
    if (!campaign || campaign.status !== 'SENDING') return;

    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
      select: {
        id: true,
        patient: { select: { id: true, name: true, phoneEncrypted: true, whatsappOptOut: true } },
      },
    });

    let sent = 0;
    let failed = 0;
    let index = 0;

    for (const r of recipients) {
      index += 1;

      // Someone may have opted out while the campaign was in flight.
      if (r.patient.whatsappOptOut) {
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'FAILED', error: 'descadastrado' },
        });
        failed += 1;
        continue;
      }

      const phone = phoneOf(r.patient.phoneEncrypted, tenantId);
      if (!phone) {
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'FAILED', error: 'telefone inválido' },
        });
        failed += 1;
        continue;
      }

      const body = `${personalise(campaign.message, r.patient.name)}\n\n_Para não receber mais, responda SAIR._`;
      const result = await send(tenantId, phone, { text: body });

      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          error: result.success ? null : (result.error ?? 'falha no envio'),
        },
      });

      if (result.success) sent += 1;
      else failed += 1;

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sent, failed },
      });

      // A dead socket won't recover message-by-message; stop and let the clinic retry.
      if (!result.success && result.error === 'not-connected') break;

      if (index < recipients.length) {
        await wait(index % BATCH_SIZE === 0 ? BATCH_PAUSE_MS : jitter());
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'DONE', sent, failed, finishedAt: new Date() },
    });
  } catch (error) {
    console.error('[gateway] campaign failed', campaignId, error);
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: 'DONE', finishedAt: new Date() } })
      .catch(() => undefined);
  } finally {
    running.delete(campaignId);
  }
}
