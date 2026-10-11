'use client';

import { useEffect, useState } from 'react';

/**
 * O número de conversas não lidas no menu. O servidor manda o valor ao desenhar
 * a página; a tela de Conversas, que já pergunta ao servidor a cada poucos
 * segundos, avisa as mudanças por um evento — sem recarregar a página.
 */
const EVENT = 'crm:unread';

export function announceUnread(count: number): void {
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: count }));
}

export function useLiveUnread(fromServer: number): number {
  const [count, setCount] = useState(fromServer);
  useEffect(() => setCount(fromServer), [fromServer]);
  useEffect(() => {
    const on = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return count;
}
