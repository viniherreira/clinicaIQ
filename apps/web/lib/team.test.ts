import { describe, expect, it } from 'vitest';
import { consequenciasDaRemocao, podeMexerNoPapel, podeRemover, type MembroDaEquipe } from './team';

const dono: MembroDaEquipe = { id: 'u-dono', nome: 'Michele', role: 'OWNER', ativo: true };
const admin: MembroDaEquipe = { id: 'u-admin', nome: 'Paulo', role: 'ADMIN', ativo: true };
const recepcao: MembroDaEquipe = { id: 'u-rec', nome: 'Ana', role: 'RECEPTIONIST', ativo: true };
const profissional: MembroDaEquipe = { id: 'u-prof', nome: 'Léo', role: 'PROFESSIONAL', ativo: true };

const remover = (atorId: string, alvoId: string, equipe: MembroDaEquipe[]) =>
  podeRemover({
    atorId,
    atorRole: equipe.find((m) => m.id === atorId)?.role ?? 'PROFESSIONAL',
    alvoId,
    equipe,
  });

describe('podeRemover', () => {
  it('dono remove quem trabalha na clínica', () => {
    expect(remover('u-dono', 'u-rec', [dono, recepcao])).toEqual({ ok: true });
    expect(remover('u-dono', 'u-prof', [dono, profissional])).toEqual({ ok: true });
  });

  it('recepção e profissional não removem ninguém', () => {
    // Server Action é endereço HTTP público: esconder o botão não basta.
    for (const ator of [recepcao, profissional]) {
      const r = remover(ator.id, 'u-prof', [dono, recepcao, profissional]);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('perfil');
    }
  });

  it('ninguém remove a si mesmo', () => {
    // Quem se remove por engano precisaria do acesso que acabou de perder para
    // desfazer.
    const r = remover('u-dono', 'u-dono', [dono, admin]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('seu próprio acesso');
  });

  it('o último administrador não sai', () => {
    const outroAdmin: MembroDaEquipe = { id: 'u-admin2', nome: 'Rita', role: 'ADMIN', ativo: true };
    const r = remover('u-admin', 'u-admin2', [dono, admin, outroAdmin, recepcao]);
    expect(r.ok).toBe(true); // ainda sobram o dono e o admin

    const sozinho = remover('u-dono', 'u-admin', [dono, admin]);
    expect(sozinho.ok).toBe(true); // ainda sobra o dono

    // Agora o dono já saiu antes: o admin é o único que resta.
    const donoInativo = { ...dono, ativo: false };
    const ultimo = remover('u-admin', 'u-admin', [donoInativo, admin]);
    expect(ultimo.ok).toBe(false);
  });

  it('não conta administrador já desativado como reserva', () => {
    const outroAdmin = { ...admin, ativo: false };
    const r = remover('u-dono', 'u-dono', [dono, outroAdmin]);
    expect(r.ok).toBe(false);
  });

  it('remover duas vezes é recusado sem virar erro de sistema', () => {
    const jaSaiu = { ...recepcao, ativo: false };
    const r = remover('u-dono', 'u-rec', [dono, jaSaiu]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('já está sem acesso');
  });

  it('alvo de outra clínica não é encontrado', () => {
    // A equipe recebida já vem filtrada por tenant; um id de fora simplesmente
    // não está na lista, e a resposta é a mesma de um id inexistente.
    const r = remover('u-dono', 'u-de-outra-clinica', [dono, recepcao]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('não encontrada');
  });

  it('administrador não remove o proprietário', () => {
    // Era assim que um ADMIN tomava a clínica: tirava o dono e ficava sozinho.
    const r = remover('u-admin', 'u-dono', [dono, admin, recepcao]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('proprietário');
  });

  it('proprietário remove outro proprietário', () => {
    const socio: MembroDaEquipe = { id: 'u-socio', nome: 'Bia', role: 'OWNER', ativo: true };
    expect(remover('u-dono', 'u-socio', [dono, socio])).toEqual({ ok: true });
  });

  it('papel desconhecido não remove ninguém', () => {
    const r = podeRemover({
      atorId: 'u-x',
      atorRole: 'SUPERUSUARIO',
      alvoId: 'u-rec',
      equipe: [dono, recepcao],
    });
    expect(r.ok).toBe(false);
  });
});

describe('podeMexerNoPapel', () => {
  const mexer = (atorRole: string, papelAtual: string | null, papelNovo: string | null) =>
    podeMexerNoPapel({ atorRole, papelAtual, papelNovo }).ok;

  it('administrador não rebaixa o proprietário', () => {
    expect(mexer('ADMIN', 'OWNER', 'RECEPTIONIST')).toBe(false);
    expect(mexer('ADMIN', 'OWNER', 'ADMIN')).toBe(false);
  });

  it('administrador não promove nem convida proprietário', () => {
    expect(mexer('ADMIN', 'RECEPTIONIST', 'OWNER')).toBe(false);
    expect(mexer('ADMIN', null, 'OWNER')).toBe(false);
  });

  it('administrador segue cuidando do resto da equipe', () => {
    expect(mexer('ADMIN', 'RECEPTIONIST', 'PROFESSIONAL')).toBe(true);
    expect(mexer('ADMIN', 'ADMIN', 'RECEPTIONIST')).toBe(true);
    expect(mexer('ADMIN', null, 'ADMIN')).toBe(true);
  });

  it('proprietário mexe em qualquer um', () => {
    expect(mexer('OWNER', 'OWNER', 'ADMIN')).toBe(true);
    expect(mexer('OWNER', null, 'OWNER')).toBe(true);
    expect(mexer('OWNER', 'OWNER', null)).toBe(true);
  });
});

describe('consequenciasDaRemocao', () => {
  it('diz que o acesso morre agora e que o histórico fica', () => {
    const f = consequenciasDaRemocao({ nome: 'Ana', convitesPendentes: 0, ehAdministrador: false });
    expect(f.join(' ')).toContain('imediatamente');
    expect(f.join(' ')).toContain('continuam com o nome dela');
    expect(f.join(' ')).toContain('convidar o mesmo e-mail de novo');
  });

  it('avisa quando o convite pendente vai junto', () => {
    expect(
      consequenciasDaRemocao({ nome: 'Ana', convitesPendentes: 1, ehAdministrador: false }).join(' '),
    ).toContain('O convite pendente');
    expect(
      consequenciasDaRemocao({ nome: 'Ana', convitesPendentes: 3, ehAdministrador: false }).join(' '),
    ).toContain('Os 3 convites');
  });

  it('não inventa aviso de convite quando não há nenhum', () => {
    const f = consequenciasDaRemocao({ nome: 'Ana', convitesPendentes: 0, ehAdministrador: true });
    expect(f.some((t) => t.includes('convite pendente'))).toBe(false);
    expect(f.join(' ')).toContain('administradora');
  });
});
