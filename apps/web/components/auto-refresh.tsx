'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Busca a página de novo no servidor de tempos em tempos (`router.refresh()`),
 * como o Kommo: o lead que chegou pelo WhatsApp aparece no funil sem F5. Só
 * com a aba visível, e nunca no meio de algo (`paused`: arrastando um card,
 * janela aberta, salvando). Voltar para a aba atualiza na hora.
 */
export function AutoRefresh({ every = 10_000, paused = false }: { every?: number; paused?: boolean }) {
  const router = useRouter();
  const pausado = useRef(paused);
  useEffect(() => {
    pausado.current = paused;
  }, [paused]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible' && !pausado.current) router.refresh();
    };
    const t = setInterval(tick, every);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, every]);

  return null;
}
