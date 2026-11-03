import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';

export const dynamic = 'force-dynamic';

/**
 * Para o monitor de site fora do ar (UptimeRobot, Better Stack…): 200 quando o
 * app responde e o banco também; 503 quando o banco não responde. Público e sem
 * nenhum dado: só diz se está de pé.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
