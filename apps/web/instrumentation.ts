/**
 * Ao subir o servidor. Em produção o relógio do CRM é o gateway, que chama
 * /api/cron/crm-tick a cada minuto. No desenvolvimento não há gateway, então o
 * próprio servidor faz esse papel — senão transmissões e automações com atraso
 * nunca andariam na tela local.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'development') return;
  if (process.env.WHATSAPP_GATEWAY_URL) return;
  const { runTick } = await import('./crm/tick');
  const g = globalThis as unknown as { __crmDevClock?: NodeJS.Timeout };
  if (g.__crmDevClock) clearInterval(g.__crmDevClock);
  g.__crmDevClock = setInterval(() => {
    runTick().catch((e) => console.error('[crm] relógio de desenvolvimento falhou:', e instanceof Error ? e.message : e));
  }, 20_000);
}
