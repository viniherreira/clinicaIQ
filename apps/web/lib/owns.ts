import 'server-only';
import { prisma } from '@clinicaiq/db';

/**
 * Confere que cada id vindo do formulário pertence à clínica de quem chamou.
 *
 * O que isso trava: `requireTenant()` prova *quem* está chamando, e o
 * `getTenantClient` filtra *o que* é lido — mas nenhum dos dois olha para os ids
 * que a própria requisição carrega. Um agendamento criado com
 * `tenantId` da clínica A e `patientId` de um paciente da clínica B é gravado
 * sem reclamação (a FK só exige que a linha exista, não que seja do mesmo
 * tenant), e a agenda da clínica A passa a renderizar `patient.name` da clínica
 * B — o join segue a chave estrangeira, e a extensão do Prisma só filtra o nível
 * de cima. Vira leitura de dado pessoal de outra clínica através de uma escrita.
 *
 * A verificação é uma consulta `count` por tipo de entidade, e só para os campos
 * realmente enviados. Ids apagados (soft delete) continuam válidos aqui: a
 * pergunta é de quem a linha é, não se ela ainda aparece na tela.
 */

export interface TenantRefs {
  patientId?: string | null;
  professionalId?: string | null;
  professionalIds?: readonly (string | null | undefined)[];
  procedureId?: string | null;
  procedureIds?: readonly (string | null | undefined)[];
  quoteId?: string | null;
  categoryId?: string | null;
}

/** Rótulo em português do campo, para a mensagem de erro na tela. */
type RefLabel = 'paciente' | 'profissional' | 'procedimento' | 'orçamento' | 'categoria';

function clean(...values: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  }
  return [...out];
}

async function allBelong(
  ids: string[],
  tenantId: string,
  count: (args: { where: { id: { in: string[] }; tenantId: string } }) => Promise<number>,
): Promise<boolean> {
  if (ids.length === 0) return true;
  return (await count({ where: { id: { in: ids }, tenantId } })) === ids.length;
}

/**
 * Devolve o rótulo do primeiro campo que aponta para fora da clínica, ou `null`
 * quando está tudo em ordem. Devolver em vez de lançar deixa cada action montar
 * a resposta no formato que o formulário dela espera.
 */
export async function refOutsideTenant(
  tenantId: string,
  refs: TenantRefs,
): Promise<RefLabel | null> {
  const patients = clean(refs.patientId);
  const professionals = clean(refs.professionalId, ...(refs.professionalIds ?? []));
  const procedures = clean(refs.procedureId, ...(refs.procedureIds ?? []));
  const quotes = clean(refs.quoteId);
  const categories = clean(refs.categoryId);

  const [okPatients, okProfessionals, okProcedures, okQuotes, okCategories] = await Promise.all([
    allBelong(patients, tenantId, (a) => prisma.patient.count(a)),
    allBelong(professionals, tenantId, (a) => prisma.professional.count(a)),
    allBelong(procedures, tenantId, (a) => prisma.procedure.count(a)),
    allBelong(quotes, tenantId, (a) => prisma.quote.count(a)),
    allBelong(categories, tenantId, (a) => prisma.procedureCategory.count(a)),
  ]);

  if (!okPatients) return 'paciente';
  if (!okProfessionals) return 'profissional';
  if (!okProcedures) return 'procedimento';
  if (!okQuotes) return 'orçamento';
  if (!okCategories) return 'categoria';
  return null;
}

/**
 * Mensagem para o usuário. Deliberadamente igual à de "não existe": quem tentar
 * adivinhar ids de outra clínica não deve conseguir distinguir "esse id não
 * existe" de "existe, mas é de outro".
 */
export function refErrorMessage(label: RefLabel): string {
  return `Não foi possível concluir: ${label} não encontrado.`;
}
