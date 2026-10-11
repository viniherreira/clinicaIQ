/**
 * Relógio do CRM no desenvolvimento. Em produção quem chama /api/cron/crm-tick
 * a cada minuto é o gateway; localmente não há gateway, então o próprio
 * servidor faz esse papel — senão transmissões e automações com atraso nunca
 * andariam na tela local.
 */
if (process.env.NODE_ENV === 'development' && !process.env.WHATSAPP_GATEWAY_URL) {
  const g = globalThis as unknown as { __crmDevClock?: NodeJS.Timeout };
  if (g.__crmDevClock) clearInterval(g.__crmDevClock);
  g.__crmDevClock = setInterval(() => {
    import('./crm/tick')
      .then(({ runTick }) => runTick())
      .catch((e) => console.error('[crm] relógio de desenvolvimento falhou:', e instanceof Error ? e.message : e));
  }, 20_000);
}

export {};
