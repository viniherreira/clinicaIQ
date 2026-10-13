'use client';

import { useEffect } from 'react';

/** Liga o tema do CRM antes de a página aparecer (sem piscar o claro). */
export const CRM_THEME_SCRIPT = `document.documentElement.classList.add('dark','crm-navy')`;

/** O tema escolhido pela pessoa para o resto do sistema (o mesmo do app/layout.tsx). */
function userWantsDark() {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

/**
 * O CRM é sempre escuro, azul-marinho, como o Kommo. Ao sair do CRM (voltar à
 * clínica sem recarregar), devolve o tema que a pessoa escolheu.
 */
export function CrmTheme() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('dark', 'crm-navy');
    return () => {
      html.classList.remove('crm-navy');
      html.classList.toggle('dark', userWantsDark());
    };
  }, []);
  return null;
}
