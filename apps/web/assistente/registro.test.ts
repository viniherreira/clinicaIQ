import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { can, type Role } from '@/lib/permissions';
import { TODAS, executarFerramenta, ferramentasPara, paraApi } from './registro';

describe('registro de ferramentas', () => {
  it('tem as 9 ferramentas da spec, com nomes únicos', () => {
    expect(TODAS.map((f) => f.nome).sort()).toEqual(
      ['agenda_do_dia', 'buscar_pacientes', 'cancelamentos', 'faturamento', 'horarios_livres', 'listar_profissionais', 'saldo_devedor', 'sem_retorno', 'ultimos_atendidos'],
    );
  });

  it.each<Role>(['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])('%s recebe só o que o papel alcança', (role) => {
    for (const f of ferramentasPara(role)) expect(can(role, f.capability)).toBe(true);
    for (const f of TODAS.filter((t) => !ferramentasPara(role).includes(t))) expect(can(role, f.capability)).toBe(false);
  });

  it('formato da API: schema de objeto, sem $schema, ordem fixa', () => {
    const api = paraApi(TODAS);
    expect(api.map((t) => t.name)).toEqual(TODAS.map((f) => f.nome));
    for (const t of api) {
      expect(t.input_schema.type).toBe('object');
      expect(t.input_schema).not.toHaveProperty('$schema');
    }
  });

  it('entrada inválida volta como erro para o modelo, sem executar', async () => {
    const r = await executarFerramenta(TODAS, 'ultimos_atendidos', { quantidade: 500 }, {} as never);
    expect(r.erro).toBe(true);
    expect(r.conteudo).toMatch(/entrada inválida/);
  });

  it('ferramenta fora da lista é recusada', async () => {
    const r = await executarFerramenta([], 'faturamento', {}, {} as never);
    expect(r).toEqual({ conteudo: 'ferramenta não disponível para este usuário', erro: true });
  });
});
