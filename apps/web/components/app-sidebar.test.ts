import { describe, expect, it } from 'vitest';
import { activeHref, navFor, CLINIC_NAV, CRM_NAV } from './app-sidebar';

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
    expect(hrefs('OWNER')).toHaveLength(CLINIC_NAV.length);
    expect(hrefs('ADMIN')).toHaveLength(CLINIC_NAV.length);
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
    const declaradas = CLINIC_NAV.map((i) => i.capability).filter(Boolean);
    for (const proibida of NUNCA_NO_MENU) {
      expect(declaradas).not.toContain(proibida);
    }
    expect(hrefs('RECEPTIONIST')).toEqual(hrefs('OWNER'));
    expect(hrefs('PROFESSIONAL')).toEqual(hrefs('OWNER'));
  });

  it('não existe rota de plano solta no menu', () => {
    expect(CLINIC_NAV.map((i) => i.href)).not.toContain('/planos');
  });

  it('relatórios não voltam a ser um item separado do financeiro', () => {
    // Eram duas telas com o mesmo período, os mesmos filtros e a mesma tabela.
    expect(CLINIC_NAV.map((i) => i.href)).not.toContain('/relatorios');
  });

  it('o dashboard fica para todo mundo que tem login', () => {
    for (const papel of ['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', '']) {
      expect(hrefs(papel)).toContain('/dashboard');
    }
  });

  it('todo item fora o dashboard declara a permissão que exige', () => {
    const semTrava = CLINIC_NAV.filter((i) => !i.capability).map((i) => i.href);
    expect(semTrava).toEqual(['/dashboard']);
  });
});

describe('navFor — espaço do CRM', () => {
  const crm = (role: string) => navFor(role, 'crm').map((i) => i.href);

  it('o menu da clínica não muda por causa do CRM', () => {
    for (const papel of ['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL']) {
      expect(hrefs(papel).some((h) => h.startsWith('/crm'))).toBe(false);
    }
  });

  it('a recepção trabalha o funil; só dono e admin configuram', () => {
    expect(crm('RECEPTIONIST')).toEqual(['/crm', '/crm/conversas', '/crm/leads', '/crm/tarefas']);
    expect(crm('OWNER')).toEqual(CRM_NAV.map((i) => i.href));
    expect(crm('ADMIN')).toContain('/crm/configuracoes');
  });

  it('o profissional não vê nada do CRM', () => {
    expect(crm('PROFESSIONAL')).toEqual([]);
  });

  it('todo item do CRM declara a permissão que exige', () => {
    expect(CRM_NAV.every((i) => i.capability)).toBe(true);
  });
});

describe('activeHref', () => {
  it('acende o item mais específico, não o Funil em toda página do CRM', () => {
    expect(activeHref(CRM_NAV, '/crm')).toBe('/crm');
    expect(activeHref(CRM_NAV, '/crm/leads/abc')).toBe('/crm/leads');
    expect(activeHref(CRM_NAV, '/crm/configuracoes')).toBe('/crm/configuracoes');
  });

  it('no menu da clínica continua igual', () => {
    expect(activeHref(CLINIC_NAV, '/pacientes/123/editar')).toBe('/pacientes');
    expect(activeHref(CLINIC_NAV, '/dashboard')).toBe('/dashboard');
    expect(activeHref(CLINIC_NAV, '/crm-indisponivel')).toBeUndefined();
  });
});
