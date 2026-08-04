import express, { type NextFunction, type Request, type Response } from 'express';
import { runCampaign } from './campaigns.js';
import { prisma } from './db.js';
import { env, envProblems, logEnvSummary } from './env.js';
import { retryPendingMessages, sweepStuckMessages } from './outbox.js';
import {
  connect,
  disconnect,
  getStatus,
  lookupNumber,
  probeSend,
  recentInbound,
  replayParkedAcks,
  restoreSessions,
  send,
  type QuickReply,
} from './session-manager.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

/** Every route except /health requires the shared token the web app holds. */
function requireToken(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== env.GATEWAY_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Express 5 types route params as `string | string[]`; ours is always single. */
const tenantIdOf = (req: Request): string => String(req.params.tenantId);

/**
 * Public and unauthenticated: it's the one thing reachable when a deploy is
 * misconfigured, so it reports *why* rather than just failing. Names only —
 * never the values.
 */
app.get('/health', (_req, res) => {
  const ok = envProblems.length === 0;
  res.status(ok ? 200 : 503).json({
    ok,
    ...(ok ? {} : { missingEnv: envProblems }),
    port: env.PORT,
    // Without APP_URL the gateway still sends, but patients' replies go nowhere
    // — the appointment never flips to Confirmado. Surface it here.
    appUrl: env.APP_URL || null,
    repliesWired: Boolean(env.APP_URL),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use(requireToken);

/**
 * Last inbound events the gateway saw, for debugging "the patient replied and
 * nothing happened". Token-protected: it echoes message fragments.
 */
app.get('/debug/inbound', (_req, res) => {
  res.json({ events: recentInbound() });
});

/**
 * What does WhatsApp actually say about a number? Answers "it says the patient
 * has no WhatsApp, but they do" without guessing. Token-protected: it takes a
 * phone number.
 */
app.get(
  '/debug/lookup/:tenantId/:phone',
  asyncRoute(async (req, res) => {
    res.json(await lookupNumber(tenantIdOf(req), String(req.params.phone)));
  }),
);

/**
 * The discriminating experiment for "sent but never arrives": one instrumented
 * send that reports jid resolution, Signal session creation *and* persistence,
 * and the full ack trajectory. Sends a real message — deliberate use only.
 *
 *   POST /debug/probe/:tenantId  { "phone": "5511...", "text": "..." }
 */
app.post(
  '/debug/probe/:tenantId',
  asyncRoute(async (req, res) => {
    const { phone, text } = req.body ?? {};
    if (typeof phone !== 'string' || !phone.trim()) {
      res.status(400).json({ error: 'phone-required' });
      return;
    }
    try {
      res.json(
        await probeSend(
          tenantIdOf(req),
          phone,
          typeof text === 'string' && text.trim() ? text : 'Teste de diagnóstico ClinicaIQ.',
        ),
      );
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : 'probe-failed' });
    }
  }),
);

/** Starts pairing (or reuses a live socket). The QR arrives via GET shortly after. */
app.post(
  '/sessions/:tenantId/connect',
  asyncRoute(async (req, res) => {
    const tenantId = tenantIdOf(req);
    await connect(tenantId);
    res.json(await getStatus(tenantId));
  }),
);

app.get(
  '/sessions/:tenantId',
  asyncRoute(async (req, res) => {
    res.json(await getStatus(tenantIdOf(req)));
  }),
);

app.delete(
  '/sessions/:tenantId',
  asyncRoute(async (req, res) => {
    await disconnect(tenantIdOf(req));
    res.json({ ok: true });
  }),
);

/**
 * Accepts a campaign and returns immediately — delivery is paced over minutes to
 * hours, far longer than any HTTP request should stay open. Progress is written
 * to the campaign row, which the app polls.
 */
app.post(
  '/sessions/:tenantId/campaigns',
  asyncRoute(async (req, res) => {
    const { campaignId } = req.body ?? {};
    if (typeof campaignId !== 'string' || !campaignId.trim()) {
      res.status(400).json({ ok: false, error: 'campaignId-required' });
      return;
    }
    void runCampaign(tenantIdOf(req), campaignId);
    res.status(202).json({ ok: true });
  }),
);

app.post(
  '/sessions/:tenantId/messages',
  asyncRoute(async (req, res) => {
    const { to, body, buttons, ref } = req.body ?? {};
    if (typeof to !== 'string' || typeof body !== 'string' || !to.trim() || !body.trim()) {
      res.status(400).json({ success: false, error: 'to-and-body-required' });
      return;
    }
    const quickReplies: QuickReply[] | undefined = Array.isArray(buttons)
      ? buttons
          .filter((b) => b && typeof b.id === 'string' && typeof b.title === 'string')
          .map((b) => ({ id: b.id, title: b.title }))
      : undefined;
    res.json(
      await send(tenantIdOf(req), to, {
        text: body,
        buttons: quickReplies,
        // The app's outbox row, stamped with WhatsApp's id the moment the socket
        // accepts — so a reply this request never receives can't cause a resend.
        ref: typeof ref === 'string' && ref ? ref : undefined,
      }),
    );
  }),
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[gateway] unhandled error', error);
  res.status(500).json({ error: 'internal-error' });
});

// A WhatsApp socket can reject from a background event handler (a dropped
// connection, a malformed frame). Node's default is to kill the process on an
// unhandled rejection, which would take every other clinic's line down with it.
// Log and keep serving instead — a single broken session must not be fatal.
process.on('unhandledRejection', (reason) => {
  console.error('[gateway] unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[gateway] uncaught exception:', error);
});

/**
 * Stamps a single row in Postgres on boot and every 30s after. Hosting dashboards
 * hide runtime logs behind a UI; this makes "is the gateway actually alive, and
 * on which port?" answerable with a query, and a jumping bootedAt exposes a
 * crash loop that a green "deployed" badge would hide.
 */
function startHeartbeat(): void {
  const write = (note: string) =>
    prisma.gatewayHeartbeat
      .upsert({
        where: { id: 'gateway' },
        create: { id: 'gateway', port: env.PORT, note },
        update: { port: env.PORT, note },
      })
      .catch((e) => console.error('[gateway] heartbeat failed:', e?.message ?? e));

  void write('boot');
  const timer = setInterval(() => void write('alive'), 30_000);
  timer.unref();
}

logEnvSummary();

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`[gateway] listening on :${env.PORT}`);

  if (envProblems.length > 0) {
    // Stay up so /health can report the problem, but don't touch the database or
    // open sockets we know can't work.
    console.error(
      `[gateway] NAO configurado — faltando: ${envProblems.join(', ')}. ` +
        `Defina no painel do host e faça redeploy. GET /health lista o que falta.`,
    );
    return;
  }

  startHeartbeat();

  // An ack can beat the row it belongs to into existence; the replay applies the
  // ones that arrived early. Frequent and cheap — it only touches memory unless
  // something is actually parked.
  setInterval(
    () => void replayParkedAcks().catch((e) => console.error('[gateway] replay falhou:', e?.message ?? e)),
    5_000,
  ).unref();

  // The outbox: anything the app failed to hand over goes out from here. This is
  // what makes a booking survive a reconnect, a redeploy or a timeout.
  const retry = () =>
    void retryPendingMessages().catch((e) =>
      console.error('[gateway] outbox falhou:', e?.message ?? e),
    );
  retry();
  setInterval(retry, 30_000).unref();

  // Close out messages whose ack was lost to a restart, so the screen stops
  // showing "Saindo…" for something that reached nobody.
  const sweep = () =>
    void sweepStuckMessages().catch((e) => console.error('[gateway] sweep falhou:', e?.message ?? e));
  sweep();
  setInterval(sweep, 5 * 60_000).unref();

  restoreSessions()
    .then((n) => console.log(`[gateway] restored ${n} session(s)`))
    .catch((e) => console.error('[gateway] restore failed', e));
});
