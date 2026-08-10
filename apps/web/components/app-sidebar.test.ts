import { describe, expect, it } from 'vitest';
import { navFor, NAV } from './app-sidebar';

/**
 * O que cada perfil enxerga no menu.
 *
 * Vale um teste porque o erro aqui é silencioso: um módulo novo entra na lista
 * com a permissão errada e passa a aparecer — ou a sumir — para a clínica
 * inteira, sem nada quebrar.
 */

const hrefs = (role: string) => navFor(role).map((i) => i.href);
const SO_ADMIN = ['/planos'];

describe('navFor', () => {
  it('dono e administrador enxergam tudo', () => {
    expect(hrefs('OWNER')).toHaveLength(NAV.length);
    expect(hrefs('ADMIN')).toHaveLength(NAV.length);
  });

  it('quem atende enxerga o dia a dia inteiro', () => {
    for (const papel of ['RECEPTIONIST', 'PROFESSIONAL']) {
      const vistos = hrefs(papel);
      for (const rota of [
        '/dashboard',
        '/agenda',
        '/pacientes',
        '/procedimentos',
        '/orcamentos',
        '/financeiro',
        '/relatorios',
        '/whatsapp',
        '/campanhas',
        '/configuracoes',
      ]) {
        expect(vistos, `${papel} deveria ver ${rota}`).toContain(rota);
      }
    }
  });

  it('plano e cobrança só aparecem para dono e admin', () => {
    for (const rota of SO_ADMIN) {
      expect(hrefs('RECEPTIONIST')).not.toContain(rota);
      expect(hrefs('PROFESSIONAL')).not.toContain(rota);
      expect(hrefs('OWNER')).toContain(rota);
    }
  });

  it('papel desconhecido não vira admin', () => {
    for (const rota of SO_ADMIN) {
      expect(hrefs('DONO_SUPREMO')).not.toContain(rota);
      expect(hrefs('')).not.toContain(rota);
    }
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
