import { describe, expect, it } from 'vitest';
import { navFor, NAV } from './app-sidebar';

/**
 * O que cada perfil enxerga no menu.
 *
 * Vale um teste porque o erro aqui é silencioso: um módulo novo entra na lista
 * sem `capability` e passa a aparecer para a clínica inteira, sem nada quebrar.
 */

const hrefs = (role: string) => navFor(role).map((i) => i.href);

describe('navFor', () => {
  it('dono e administrador enxergam tudo', () => {
    expect(hrefs('OWNER')).toHaveLength(NAV.length);
    expect(hrefs('ADMIN')).toHaveLength(NAV.length);
  });

  it('recepção não enxerga configurações, procedimentos, WhatsApp nem plano', () => {
    const vistos = hrefs('RECEPTIONIST');
    expect(vistos).toContain('/agenda');
    expect(vistos).toContain('/pacientes');
    expect(vistos).toContain('/financeiro');
    expect(vistos).toContain('/campanhas');
    expect(vistos).not.toContain('/configuracoes');
    expect(vistos).not.toContain('/procedimentos');
    expect(vistos).not.toContain('/whatsapp');
    expect(vistos).not.toContain('/planos');
  });

  it('profissional fica com agenda e pacientes, sem dinheiro', () => {
    const vistos = hrefs('PROFESSIONAL');
    expect(vistos).toContain('/agenda');
    expect(vistos).toContain('/pacientes');
    expect(vistos).not.toContain('/financeiro');
    expect(vistos).not.toContain('/orcamentos');
    expect(vistos).not.toContain('/relatorios');
    expect(vistos).not.toContain('/configuracoes');
  });

  it('papel desconhecido cai no menor privilégio, não no maior', () => {
    const inventado = hrefs('DONO_SUPREMO');
    expect(inventado).toEqual(hrefs('PROFESSIONAL'));
  });

  it('o dashboard fica para todo mundo que tem login', () => {
    for (const papel of ['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', '']) {
      expect(hrefs(papel)).toContain('/dashboard');
    }
  });

  it('todo item fora o dashboard declara a permissão que exige', () => {
    const semTrava = NAV.filter((i) => !i.capability).map((i) => i.href);
    expect(semTrava).toEqual(['/dashboard']);
  });
});
