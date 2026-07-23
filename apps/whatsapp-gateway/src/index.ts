import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './env.js';
import { connect, disconnect, getStatus, restoreSessions, sendText } from './session-manager.js';

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

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(requireToken);

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

app.post(
  '/sessions/:tenantId/messages',
  asyncRoute(async (req, res) => {
    const { to, body } = req.body ?? {};
    if (typeof to !== 'string' || typeof body !== 'string' || !to.trim() || !body.trim()) {
      res.status(400).json({ success: false, error: 'to-and-body-required' });
      return;
    }
    res.json(await sendText(tenantIdOf(req), to, body));
  }),
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[gateway] unhandled error', error);
  res.status(500).json({ error: 'internal-error' });
});

app.listen(env.PORT, () => {
  console.log(`[gateway] listening on :${env.PORT}`);
  restoreSessions()
    .then((n) => console.log(`[gateway] restored ${n} session(s)`))
    .catch((e) => console.error('[gateway] restore failed', e));
});
