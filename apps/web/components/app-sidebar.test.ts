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

/** Só existem dentro de Configurações, nunca como item de menu. */
const NUNCA_NO_MENU = ['equipe', 'planos', 'privacidade'];

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

  it('o menu é o mesmo para todo mundo — o que é de dono mora nas Configurações', () => {
    // Plano, equipe e privacidade são abas dentro de Configurações, e é lá que a
    // trava age. Botar qualquer uma delas no menu seria um segundo lugar para a
    // mesma coisa, com uma segunda chance de esquecer a trava.
    const declaradas = NAV.map((i) => i.capability).filter(Boolean);
    for (const proibida of NUNCA_NO_MENU) {
      expect(declaradas).not.toContain(proibida);
    }
    expect(hrefs('RECEPTIONIST')).toEqual(hrefs('OWNER'));
    expect(hrefs('PROFESSIONAL')).toEqual(hrefs('OWNER'));
  });

  it('não existe rota de plano solta no menu', () => {
    expect(NAV.map((i) => i.href)).not.toContain('/planos');
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
