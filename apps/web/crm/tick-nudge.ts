import { after } from 'next/server';

/**
 * O relógio do CRM também anda com o uso: cada página do CRM (e a tela de
 * Conversas, que se atualiza sozinha) dá um toque, no máximo um por minuto
 * por servidor, depois de responder. Assim automações com atraso, transmissões
 * e robôs parados andam mesmo sem o gateway, enquanto alguém usa o CRM.
 *
 * Com ninguém usando, quem chama é o Supabase (pg_cron, ver
 * `docs/producao/relogio-crm.sql`) ou o gateway, em /api/cron/crm-tick. Rodar
 * junto não duplica nada: cada parte do relógio reserva o que vai fazer.
 */
const INTERVALO_MS = 60_000;
let ultimo = 0;

export function nudgeTick(now: number = Date.now()): void {
  if (now - ultimo < INTERVALO_MS) return;
  ultimo = now;
  try {
    after(async () => {
      try {
        const { runTick } = await import('./tick');
        await runTick();
      } catch (e) {
        console.error('[crm] relógio pelo uso falhou:', e instanceof Error ? e.message : e);
      }
    });
  } catch {
    // Fora de uma requisição (testes, scripts): não há "depois de responder".
  }
}
