import { NextResponse } from 'next/server';
import { reconcileSubscriptions } from '@/lib/subscription-sync';
import { bearerMatches } from '@/lib/bearer';

/**
 * Reconciliação diária dos status de assinatura.
 *
 * Continua existindo como rota própria para dar para rodar sob demanda, mas o
 * agendamento mora no cron de lembretes: o plano Hobby da Vercel só permite dois
 * crons por projeto, e gastar um slot com isto custaria os aniversários. A
 * lógica está em `lib/subscription-sync.ts`, chamada pelos dois.
 */

function authorized(req: Request): boolean {
  return bearerMatches(req, process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await reconcileSubscriptions();
  return NextResponse.json({ ok: true, ...result });
}
