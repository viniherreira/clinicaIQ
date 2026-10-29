import { NextResponse } from 'next/server';
import { runTick } from '@/crm/tick';
import { bearerMatches } from '@/lib/bearer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * O relógio do CRM (automações com atraso, transmissões, fila da API oficial,
 * robôs parados). Chamado a cada minuto pelo pg_cron do Supabase
 * (docs/producao/relogio-crm.sql), com o CRON_SECRET. O token do gateway de QR,
 * que também servia aqui, não vale mais: o gateway saiu do ar.
 */
function authorized(req: Request): boolean {
  return bearerMatches(req, process.env.CRON_SECRET);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runTick()) });
}

export const GET = handle;
export const POST = handle;
