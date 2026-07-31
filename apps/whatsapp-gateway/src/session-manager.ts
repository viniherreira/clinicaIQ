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
 * Whether the socket's websocket is genuinely open. Baileys exposes the raw
 * connection differently across versions, so probe the shapes we know and treat
 * "can't tell" as open — refusing to send on an unrecognised shape would break
 * every message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSocketOpen(sock: any): boolean {
  const ws = sock?.ws;
  if (!ws) return true;
  if (typeof ws.isOpen === 'boolean') return ws.isOpen;
  // Node's ws readyState: 1 === OPEN.
  const state = ws.readyState ?? ws.socket?.readyState;
  if (typeof state === 'number') return state === 1;
  return true;
}

/** Contacts already warmed up in this process, so we only pay the cost once. */
const warmed = new Set<string>();

/**
 * Prepares a first-time conversation before sending. WhatsApp needs an
 * end-to-end session with a contact the line has never messaged; without it the
 * server can accept a message (SERVER_ACK) that the recipient's device can never
 * decrypt, so it is never delivered — indistinguishable from success. Subscribing
 * to presence forces that key exchange, and the brief "typing" also makes an
 * automated send look like a person.
 */
async function warmUpContact(sock: WASocket, jid: string): Promise<void> {
  if (warmed.has(jid)) return;
  warmed.add(jid);
  try {
    await sock.presenceSubscribe(jid);
    await new Promise((r) => setTimeout(r, 600));
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise((r) => setTimeout(r, 900));
    await sock.sendPresenceUpdate('paused', jid);
  } catch {
    // Best effort: never block the send because the warm-up failed.
  }
}

/** Caps a promise so a slow WhatsApp lookup can't eat the whole send budget. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('lookup-timeout')), ms)),
  ]);
}

type JidResolution =
  | { jid: string } // confirmed on WhatsApp
  | { jid: null; reason: 'not-on-whatsapp' } // server answered: no account
  | { jid: null; reason: 'lookup-failed' }; // couldn't check (network/timeout)

/**
 * Resolves the correct WhatsApp jid for a Brazilian number. The line may exist
 * with or without the extra "9" after the area code depending on when it was
 * registered, so we ask the server which variant is real instead of guessing —
 * sending to the wrong variant looks "sent" but silently reaches no one.
 *
 * Distinguishes "the server says this number has no WhatsApp" (a real, reportable
 * failure) from "we couldn't reach the server to check" (transient — worth a
 * best-effort attempt rather than a hard failure).
 */
async function resolveJid(sock: WASocket, digits: string): Promise<JidResolution> {
  const candidates = new Set<string>([digits]);
  const m = /^55(\d{2})(\d{8,9})$/.exec(digits);
  if (m) {
    const [, ddd, rest] = m;
    if (rest.length === 9 && rest.startsWith('9')) candidates.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) candidates.add(`55${ddd}9${rest}`);
  }

  let queryWorked = false;
  for (const candidate of candidates) {
    try {
      const results = await withTimeout(sock.onWhatsApp(candidate), 8_000);
      // The call returning at all (even an empty list) proves the query channel
      // works; an empty list for every variant is then real evidence the number
      // has no WhatsApp account — usually a typo in the patient record.
      queryWorked = true;
      const hit = results?.find((r) => r?.exists);
      if (hit?.jid) return { jid: hit.jid };
    } catch {
      // This candidate couldn't be checked — try the next, then decide below.
    }
  }
  return { jid: null, reason: queryWorked ? 'not-on-whatsapp' : 'lookup-failed' };
}

/** Raw lookup for diagnostics: what does the server actually say about a number? */
export async function lookupNumber(
  tenantId: string,
  phone: string,
): Promise<{ ok: boolean; digits: string; tried: string[]; results: unknown; resolved: string | null }> {
  const session = sessions.get(tenantId);
  const digits = phone.replace(/\D/g, '');
  if (!session || session.status !== 'CONNECTED') {
    return { ok: false, digits, tried: [], results: 'not-connected', resolved: null };
  }

  const tried = [digits];
  const m = /^55(\d{2})(\d{8,9})$/.exec(digits);
  if (m) {
    const [, ddd, rest] = m;
    if (rest.length === 9 && rest.startsWith('9')) tried.push(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) tried.push(`55${ddd}9${rest}`);
  }

  const results: Record<string, unknown> = {};
  for (const candidate of tried) {
    try {
      results[candidate] = await withTimeout(session.sock.onWhatsApp(candidate), 8_000);
    } catch (e) {
      results[candidate] = `erro: ${e instanceof Error ? e.message : 'desconhecido'}`;
    }
  }

  const resolution = await resolveJid(session.sock, digits);
  return { ok: true, digits, tried, results, resolved: resolution.jid };
}

/**
 * WhatsApp's own delivery states (proto.WebMessageInfo.Status) mapped to ours.
 * PENDING (1) is skipped: it's the pre-send state we already record ourselves.
 */
const ACK_TO_STATUS: Record<number, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  0: 'FAILED', // ERROR
  2: 'SENT', // SERVER_ACK — WhatsApp's servers have it
  3: 'DELIVERED', // DELIVERY_ACK — reached the phone
  4: 'READ',
  5: 'READ', // PLAYED
};

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
 * WhatsApp is migrating chat identifiers from phone-number jids
 * (`5511…@s.whatsapp.net`) to opaque LIDs (`123…@lid`). A reply can arrive under
 * either, with the phone-number form carried in an `…Alt` field, so gather every
 * candidate on the key and keep the one that actually looks like a phone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function senderPhone(key: any): string | null {
  const candidates = [
    key?.remoteJid,
    key?.remoteJidAlt,
    key?.senderPn,
    key?.participant,
    key?.participantAlt,
  ].filter((v): v is string => typeof v === 'string');

  for (const jid of candidates) {
    if (jid.endsWith('@s.whatsapp.net')) {
      const digits = jid.split('@')[0].split(':')[0];
      if (/^\d{10,15}$/.test(digits)) return digits;
    }
  }
  return null;
}

/** Recent inbound events, newest first. Read-only diagnostics for /debug/inbound. */
export interface InboundTrace {
  at: string;
  jid: string;
  phone: string | null;
  text: string;
  buttonId?: string;
  forwarded: boolean;
  result: string;
}
const inboundTrace: InboundTrace[] = [];
export const recentInbound = (): InboundTrace[] => inboundTrace.slice(0, 25);

function trace(entry: InboundTrace): void {
  inboundTrace.unshift(entry);
  if (inboundTrace.length > 25) inboundTrace.length = 25;
}

/**
 * Hands a patient's reply to the Next.js app, which owns the appointment logic.
 * Best-effort: a failure here must never crash the socket.
 */
async function forwardInbound(
  tenantId: string,
  payload: { from: string; text: string; buttonId?: string; messageId?: string },
): Promise<string> {
  if (!env.APP_URL) return 'no-app-url';
  try {
    const res = await fetch(`${env.APP_URL}/api/whatsapp/inbound`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tenantId, ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
    return `${res.status} ${(await res.text()).slice(0, 80)}`;
  } catch (error) {
    // App unreachable or slow — the patient's reply still sits in the clinic's
    // WhatsApp for a human to read; we just couldn't auto-process it.
    return `erro: ${error instanceof Error ? error.message : 'desconhecido'}`;
  }
}

// ─── Socket lifecycle ─────────────────────────────────────────────────────────

/**
 * Opens (or reuses) the WhatsApp Web socket for a clinic. Resolves as soon as
 * the socket exists — pairing progress is reported through the session status,
 * which the web app polls.
 */
/**
 * Tears a socket down for good. Without this, a replaced socket keeps its event
 * handlers and its slot on WhatsApp's side; the server then treats the *newer*
 * connection as a duplicate and quietly drops messages sent through it — which
 * looks exactly like "marked as sent but never arrived".
 */
function destroy(sock: WASocket): void {
  try {
    sock.ev.removeAllListeners('connection.update');
    sock.ev.removeAllListeners('messages.upsert');
    sock.ev.removeAllListeners('creds.update');
  } catch {
    // Already torn down.
  }
  try {
    sock.end(undefined);
  } catch {
    // Socket was already closed.
  }
}

export async function connect(tenantId: string): Promise<Session> {
  const existing = sessions.get(tenantId);
  if (existing && !existing.closing) return existing;
  // Replacing a session: make sure the old socket is really gone first.
  if (existing) destroy(existing.sock);

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

  // Real delivery state. sendMessage resolves with a locally generated key long
  // before WhatsApp has seen the message, so "sent" on its own proves nothing —
  // these acks are the only evidence a message actually left and landed.
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      const id = u.key?.id;
      const status = u.update?.status;
      if (!id || typeof status !== 'number') continue;
      const mapped = ACK_TO_STATUS[status];
      if (!mapped) continue;
      await prisma.whatsAppMessage
        .updateMany({
          where: { externalId: id, tenantId },
          data: {
            status: mapped,
            ...(mapped === 'SENT' ? { sentAt: new Date() } : {}),
            ...(mapped === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
            ...(mapped === 'READ' ? { readAt: new Date() } : {}),
            ...(mapped === 'FAILED'
              ? { errorMessage: 'O WhatsApp recusou a mensagem (número pode não existir)' }
              : {}),
          },
        })
        .catch(() => undefined);
    }
  });

  // Patients replying "1"/"Confirmar" (or tapping a button) land here.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // ignore history replayed on connect
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const jid = m.key.remoteJid ?? '';
      // Skip groups, broadcasts and status updates; keep 1:1 chats under either
      // the phone-number jid or the newer LID form.
      if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;

      const text = m.message.conversation ?? m.message.extendedTextMessage?.text ?? '';
      const buttonId = extractButtonId(m.message);
      if (!text && !buttonId) continue;

      const phone = senderPhone(m.key);
      const result = phone
        ? await forwardInbound(tenantId, {
            from: phone,
            text,
            buttonId,
            messageId: m.key.id ?? undefined,
          })
        : 'sem telefone no jid';

      trace({
        at: new Date().toISOString(),
        jid,
        phone,
        text: text.slice(0, 40),
        buttonId,
        forwarded: Boolean(phone),
        result,
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
      destroy(sock);

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

      // Transient drop (network, phone offline, restart required). Keep retrying
      // indefinitely with a capped backoff: giving up would leave the clinic
      // silently unable to send until a human notices. The stored credentials
      // stay valid, so a reconnect usually succeeds once the phone is back.
      const retries = session.retries + 1;
      await persist(tenantId, {
        status: retries > 3 ? 'ERROR' : 'CONNECTING',
        qrCode: null,
        // Only claim the QR is needed once reconnecting has clearly stopped
        // helping — otherwise a 30-second blip would nag the clinic to re-pair.
        lastError:
          retries > 3
            ? 'Conexão instável com o WhatsApp. Se não voltar, reconecte lendo o QR code.'
            : null,
        disconnectedAt: new Date(),
      });

      const delay = Math.min(60_000, 2 ** Math.min(retries, 6) * 1000);
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
    destroy(session.sock);
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
  // The status flag can lag behind reality: if the underlying websocket died
  // without a close event, Baileys still accepts sendMessage and resolves with a
  // key, so the message is recorded as sent and silently never arrives. Check the
  // actual socket before claiming anything.
  if (!isSocketOpen(session.sock)) {
    session.status = 'CONNECTING';
    return { success: false, error: 'not-connected' };
  }

  const digits = to.replace(/\D/g, '');
  if (!digits) return { success: false, error: 'invalid-number' };

  // Resolve the real jid. Only send to a number the server confirms exists;
  // otherwise the message looks "sent" but reaches no one. A confirmed-absent
  // number is a reportable failure; a failed lookup falls back to a best-effort
  // attempt so a transient glitch doesn't block a valid contact.
  const resolution = await resolveJid(session.sock, digits);
  if (resolution.jid === null && resolution.reason === 'not-on-whatsapp') {
    return { success: false, error: 'numero-sem-whatsapp' };
  }
  const jid = resolution.jid ?? toJid(digits);

  await warmUpContact(session.sock, jid);

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
