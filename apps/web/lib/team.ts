import { can, type Role } from './permissions';

/**
 * Quem pode tirar quem da equipe.
 *
 * Módulo puro de propósito, como `permissions.ts`: sem Prisma, sem Clerk. As
 * três travas daqui são as que impedem uma clínica de se trancar para fora, e
 * uma regra dessas não pode depender de banco para ser testada.
 */

export interface MembroDaEquipe {
  id: string;
  nome: string;
  role: Role | string;
  ativo: boolean;
}

export type Veredito = { ok: true } | { ok: false; motivo: string };

/** Quem ainda administraria a clínica se este membro saísse. */
function administradoresRestantes(equipe: MembroDaEquipe[], semEste: string): MembroDaEquipe[] {
  return equipe.filter((m) => m.ativo && m.id !== semEste && can(m.role, 'equipe'));
}

/**
 * Pode remover?
 *
 * As três recusas, em ordem de quem esbarra nelas primeiro:
 *
 * 1. Perfil sem acesso à equipe. A tela já esconde o botão, mas Server Action é
 *    endereço HTTP público — esconder não é controle.
 * 2. A si mesmo. Quem se remove por engano perde o acesso na hora e não tem como
 *    desfazer, porque desfazer exige o acesso que acabou de perder.
 * 3. O último administrador. Sem ele ninguém convida, ninguém troca perfil,
 *    ninguém mexe na cobrança — e não existe tela de suporte para resgatar.
 */
export function podeRemover(input: {
  atorId: string;
  atorRole: Role | string;
  alvoId: string;
  equipe: MembroDaEquipe[];
}): Veredito {
  const { atorId, atorRole, alvoId, equipe } = input;

  if (!can(atorRole, 'equipe')) {
    return { ok: false, motivo: 'Seu perfil não pode remover pessoas da equipe.' };
  }

  if (atorId === alvoId) {
    return {
      ok: false,
      motivo: 'Você não pode remover o seu próprio acesso. Peça a outro administrador.',
    };
  }

  const alvo = equipe.find((m) => m.id === alvoId);
  if (!alvo) return { ok: false, motivo: 'Pessoa não encontrada nesta clínica.' };
  if (!alvo.ativo) return { ok: false, motivo: 'Esta pessoa já está sem acesso.' };

  if (can(alvo.role, 'equipe') && administradoresRestantes(equipe, alvoId).length === 0) {
    return {
      ok: false,
      motivo:
        'A clínica ficaria sem nenhum administrador. Promova outra pessoa antes de remover esta.',
    };
  }

  return { ok: true };
}

/**
 * O que a clínica perde ao remover — em frases, para o diálogo de confirmação.
 *
 * Existe porque "Tem certeza?" não informa nada: quem clica precisa saber que o
 * acesso morre agora, que o histórico fica, e que dá para chamar de volta.
 */
export function consequenciasDaRemocao(input: {
  nome: string;
  convitesPendentes: number;
  ehAdministrador: boolean;
}): string[] {
  const { nome, convitesPendentes, ehAdministrador } = input;
  const frases = [
    `${nome} perde o acesso imediatamente, em qualquer aparelho onde estiver logado.`,
  ];

  if (ehAdministrador) {
    frases.push('Esta pessoa é administradora — deixa de poder convidar, cobrar e configurar.');
  }

  if (convitesPendentes > 0) {
    frases.push(
      convitesPendentes === 1
        ? 'O convite pendente para este e-mail será cancelado.'
        : `Os ${convitesPendentes} convites pendentes para este e-mail serão cancelados.`,
    );
  }

  frases.push(
    'Nada do que ela fez é apagado: agendamentos, evoluções e orçamentos continuam com o nome dela.',
  );
  frases.push('Se precisar, dá para convidar o mesmo e-mail de novo depois.');

  return frases;
}
