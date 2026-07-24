import { prisma, type WhatsAppConnectionStatus } from './db.js';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { usePostgresAuthState } from './auth-state.js';
import { env } from './env.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'warn' });

interface Session {
  tenantId: string;
  sock: WASocket;
  status: WhatsAppConnectionStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  /** Set while a deliberate logout is in flight so we don't auto-reconnect. */
  closing: boolean;
  /** Backoff attempts since the last successful open. */
  retries: number;
}

const sessions = new Map<string, Session>();

// ─── DB mirror ────────────────────────────────────────────────────────────────

/**
 * The gateway holds the live socket; the database holds what the web app reads.
 * Every state change is mirrored here so the UI can poll a single source.
 */
async function persist(
  tenantId: string,
  data: {
    status?: WhatsAppConnectionStatus;
    qrCode?: string | null;
    qrExpiresAt?: Date | null;
    phoneNumber?: string | null;
    displayName?: string | null;
    lastError?: string | null;
    connectedAt?: Date | null;
    disconnectedAt?: Date | null;
  },
): Promise<void> {
  await prisma.whatsAppSession.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}

// ─── Phone helpers ────────────────────────────────────────────────────────────

/** Baileys jids look like `5511999999999@s.whatsapp.net`. */
const toJid = (digits: string) => `${digits}@s.whatsapp.net`;

/**
 * Brazilian mobile numbers exist on WhatsApp both with and without the extra
 * "9" after the area code, depending on when the line was registered. Ask the
 * server which variant actually exists instead of guessing.
 */
async function resolveJid(sock: WASocket, digits: string): Promise<string | null> {
  const candidates = new Set<string>([digits]);
  const m = /^55(\d{2})(\d{8,9})$/.exec(digits);
  if (m) {
    const [, ddd, rest] = m;
    if (rest.length === 9 && rest.startsWith('9')) candidates.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) candidates.add(`55${ddd}9${rest}`);
  }

  for (const candidate of candidates) {
    try {
      const result = (await sock.onWhatsApp(candidate))?.[0];
      if (result?.exists) return result.jid;
    } catch {
      // Lookup is best-effort; fall through to the next candidate.
    }
  }
  return null;
}

// ─── Inbound replies ──────────────────────────────────────────────────────────

/** Pulls the tapped-button id out of whichever reply shape WhatsApp used. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractButtonId(message: any): string | undefined {
  if (message?.buttonsResponseMessage?.selectedButtonId) {
    return message.buttonsResponseMessage.selectedButtonId;
  }
  if (message?.templateButtonReplyMessage?.selectedId) {
    return message.templateButtonReplyMessage.selectedId;
  }
  const paramsJson = message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (paramsJson) {
    try {
      return JSON.parse(paramsJson)?.id;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Hands a patient's reply to the Next.js app, which owns the appointment logic.
 * Best-effort: a failure here must never crash the socket.
 */
async function forwardInbound(
  tenantId: string,
  payload: { from: string; text: string; buttonId?: string; messageId?: string },
): Promise<void> {
  if (!env.APP_URL) return;
  try {
    await fetch(`${env.APP_URL}/api/whatsapp/inbound`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tenantId, ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // App unreachable or slow — the patient's reply still sits in the clinic's
    // WhatsApp for a human to read; we just couldn't auto-process it.
  }
}

// ─── Socket lifecycle ─────────────────────────────────────────────────────────

/**
 * Opens (or reuses) the WhatsApp Web socket for a clinic. Resolves as soon as
 * the socket exists — pairing progress is reported through the session status,
 * which the web app polls.
 */
export async function connect(tenantId: string): Promise<Session> {
  const existing = sessions.get(tenantId);
  if (existing && !existing.closing) return existing;

  const { state, saveCreds, clear } = await usePostgresAuthState(tenantId);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.appropriate('ClinicaIQ'),
    syncFullHistory: false,
    // The clinic's line is for outbound notifications; we don't want to appear
    // online or mark the staff's own chats as read.
    markOnlineOnConnect: false,
  });

  const session: Session = {
    tenantId,
    sock,
    status: 'CONNECTING',
    qrDataUrl: null,
    phoneNumber: null,
    closing: false,
    retries: existing?.retries ?? 0,
  };
  sessions.set(tenantId, session);
  await persist(tenantId, { status: 'CONNECTING', lastError: null });

  sock.ev.on('creds.update', saveCreds);

  // Patients replying "1"/"Confirmar" (or tapping a button) land here.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // ignore history replayed on connect
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const jid = m.key.remoteJid ?? '';
      if (!jid.endsWith('@s.whatsapp.net')) continue; // private chats only, no groups/status
      const text = m.message.conversation ?? m.message.extendedTextMessage?.text ?? '';
      const buttonId = extractButtonId(m.message);
      if (!text && !buttonId) continue;
      await forwardInbound(tenantId, {
        from: jid.split('@')[0],
        text,
        buttonId,
        messageId: m.key.id ?? undefined,
      });
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      session.qrDataUrl = dataUrl;
      session.status = 'QR_PENDING';
      await persist(tenantId, {
        status: 'QR_PENDING',
        qrCode: dataUrl,
        qrExpiresAt: new Date(Date.now() + env.QR_TTL_MS),
        lastError: null,
      });
    }

    if (connection === 'open') {
      const rawId = sock.user?.id ?? '';
      const phoneNumber = rawId.split(':')[0].split('@')[0] || null;
      session.status = 'CONNECTED';
      session.qrDataUrl = null;
      session.phoneNumber = phoneNumber;
      session.retries = 0;
      await persist(tenantId, {
        status: 'CONNECTED',
        qrCode: null,
        qrExpiresAt: null,
        phoneNumber,
        displayName: sock.user?.name ?? null,
        lastError: null,
        connectedAt: new Date(),
        disconnectedAt: null,
      });
    }

    if (connection === 'close') {
      // Baileys wraps the close reason in a Boom error; we only need the code.
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sessions.delete(tenantId);

      if (session.closing || loggedOut) {
        // Credentials are dead — drop them so the next connect starts a fresh
        // pairing instead of looping on a rejected session.
        await clear();
        await persist(tenantId, {
          status: 'DISCONNECTED',
          qrCode: null,
          qrExpiresAt: null,
          phoneNumber: null,
          displayName: null,
          lastError: loggedOut && !session.closing ? 'Sessão encerrada pelo celular.' : null,
          disconnectedAt: new Date(),
        });
        return;
      }

      // Transient drop (network, restart required, replaced session): back off
      // and retry, giving up after a handful of attempts so we don't hammer.
      const retries = session.retries + 1;
      if (retries > 5) {
        await persist(tenantId, {
          status: 'ERROR',
          qrCode: null,
          lastError: 'Conexão perdida. Reconecte lendo o QR code novamente.',
          disconnectedAt: new Date(),
        });
        return;
      }

      const delay = Math.min(30_000, 2 ** retries * 1000);
      setTimeout(() => {
        connect(tenantId)
          .then((s) => {
            s.retries = retries;
          })
          .catch(() => undefined);
      }, delay);
    }
  });

  return session;
}

export async function disconnect(tenantId: string): Promise<void> {
  const session = sessions.get(tenantId);
  if (session) {
    session.closing = true;
    try {
      await session.sock.logout();
    } catch {
      // Already gone on WhatsApp's side — the local cleanup below still applies.
    }
    sessions.delete(tenantId);
  }

  await prisma.whatsAppAuthKey.deleteMany({ where: { tenantId } });
  await persist(tenantId, {
    status: 'DISCONNECTED',
    qrCode: null,
    qrExpiresAt: null,
    phoneNumber: null,
    displayName: null,
    lastError: null,
    disconnectedAt: new Date(),
  });
}

export interface SessionStatus {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  live: boolean;
}

export async function getStatus(tenantId: string): Promise<SessionStatus> {
  const session = sessions.get(tenantId);
  if (session) {
    return {
      status: session.status,
      qrCode: session.qrDataUrl,
      phoneNumber: session.phoneNumber,
      live: true,
    };
  }

  const row = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { status: true, qrCode: true, phoneNumber: true },
  });
  return {
    status: row?.status ?? 'DISCONNECTED',
    qrCode: null,
    phoneNumber: row?.phoneNumber ?? null,
    live: false,
  };
}

// ─── Sending ──────────────────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface QuickReply {
  id: string;
  title: string;
}

/**
 * Sends a message, optionally with tappable quick-reply buttons. Buttons over
 * the WhatsApp Web protocol are unofficial and don't render on every device, so
 * the caller always bakes a numbered fallback ("responda 1 ou 2") into `body`:
 * if the buttons show, the patient taps; if not, the text still works. If the
 * button payload is rejected outright, we retry as plain text so the message
 * (with its instructions) never fails to arrive.
 */
export async function send(
  tenantId: string,
  to: string,
  opts: { text: string; buttons?: QuickReply[] },
): Promise<SendResult> {
  const session = sessions.get(tenantId);
  if (!session || session.status !== 'CONNECTED') {
    return { success: false, error: 'not-connected' };
  }

  const digits = to.replace(/\D/g, '');
  if (!digits) return { success: false, error: 'invalid-number' };

  const jid = (await resolveJid(session.sock, digits)) ?? toJid(digits);

  const withButtons =
    opts.buttons && opts.buttons.length > 0
      ? {
          text: opts.text,
          interactiveButtons: opts.buttons.map((b) => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.title, id: b.id }),
          })),
        }
      : { text: opts.text };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sent = await session.sock.sendMessage(jid, withButtons as any);
    return { success: true, messageId: sent?.key?.id ?? undefined };
  } catch (error) {
    if (opts.buttons && opts.buttons.length > 0) {
      try {
        const sent = await session.sock.sendMessage(jid, { text: opts.text });
        return { success: true, messageId: sent?.key?.id ?? undefined };
      } catch (retry) {
        return { success: false, error: retry instanceof Error ? retry.message : 'send-failed' };
      }
    }
    return { success: false, error: error instanceof Error ? error.message : 'send-failed' };
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

/**
 * Restores every clinic that was connected before the last restart, so a deploy
 * doesn't silently stop their notifications.
 */
export async function restoreSessions(): Promise<number> {
  const rows = await prisma.whatsAppSession.findMany({
    where: { status: { in: ['CONNECTED', 'CONNECTING', 'QR_PENDING'] } },
    select: { tenantId: true },
  });

  let restored = 0;
  for (const row of rows) {
    const hasCreds = await prisma.whatsAppAuthKey.findUnique({
      where: { tenantId_key: { tenantId: row.tenantId, key: 'creds' } },
      select: { id: true },
    });
    if (!hasCreds) {
      await persist(row.tenantId, { status: 'DISCONNECTED', qrCode: null });
      continue;
    }
    try {
      await connect(row.tenantId);
      restored += 1;
    } catch {
      await persist(row.tenantId, { status: 'ERROR', lastError: 'Falha ao restaurar a sessão.' });
    }
  }
  return restored;
}
