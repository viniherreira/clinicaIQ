'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * O CRM tem tema próprio, guardado à parte do resto do sistema: escuro
 * azul-marinho (o padrão, como o Kommo) ou claro. Quem usa a clínica no claro
 * pode ficar com o CRM no escuro, e o contrário.
 */
const KEY = 'crmTheme';
type CrmMode = 'dark' | 'light';

/** Liga o tema do CRM antes de a página aparecer (sem piscar o tema errado). */
export const CRM_THEME_SCRIPT = `(function(){var c=document.documentElement.classList,t;try{t=localStorage.getItem('${KEY}')}catch(e){}if(t==='light'){c.remove('dark','crm-navy');c.add('crm-light')}else{c.remove('crm-light');c.add('dark','crm-navy')}})()`;

function readMode(): CrmMode {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function apply(mode: CrmMode) {
  const c = document.documentElement.classList;
  c.toggle('dark', mode === 'dark');
  c.toggle('crm-navy', mode === 'dark');
  c.toggle('crm-light', mode === 'light');
}

/** O tema escolhido pela pessoa para o resto do sistema (o mesmo do app/layout.tsx). */
function userWantsDark() {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

/** Mantém o tema do CRM e, ao sair dele (voltar à clínica sem recarregar), devolve o da pessoa. */
export function CrmTheme() {
  useEffect(() => {
    apply(readMode());
    return () => {
      const c = document.documentElement.classList;
      c.remove('crm-navy', 'crm-light');
      c.toggle('dark', userWantsDark());
    };
  }, []);
  return null;
}

/** O botão de tema no topo do CRM. */
export function CrmThemeToggle() {
  const [mode, setMode] = useState<CrmMode | null>(null);

  useEffect(() => setMode(readMode()), []);

  function toggle() {
    const next: CrmMode = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sem armazenamento: vale até recarregar */
    }
  }

  const escuro = mode !== 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={escuro ? 'Mudar o CRM para o tema claro' : 'Mudar o CRM para o tema escuro'}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {mode && escuro ? <Sun className="h-[18px] w-[18px]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>
  );
}
