import 'server-only';
import { prisma, decrypt, hashForTenant } from '@clinicaiq/db';

/**
 * CPF repetido na clínica (achado F-15 da auditoria).
 *
 * O CPF é cifrado com IV aleatório, então o mesmo número nunca gera o mesmo
 * texto cifrado e não há o que comparar no SQL. O `cpfHash` é o índice cego
 * do CPF: um código fixo por clínica, que acha o repetido sem guardar o número.
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const digitsOf = (value: string) => value.replace(/\D/g, '');

/** O código do CPF nesta clínica. `cpf:` separa do código de telefone. */
export function cpfHash(cpf: string, tenantId: string): string {
  return hashForTenant(`cpf:${digitsOf(cpf)}`, masterKey(), tenantId);
}

/**
 * Outro paciente ativo da clínica já tem este CPF?
 *
 * Procura pelo `cpfHash`. Os pacientes gravados antes da coluna existir ficam
 * sem código até o relógio do CRM preenchê-los (`fillMissingCpfHashes`); esses
 * poucos são abertos e comparados aqui, para o repetido não passar nessa janela.
 */
export async function cpfTaken(tenantId: string, cpf: string, exceptPatientId?: string): Promise<boolean> {
  const notSelf = exceptPatientId ? { NOT: { id: exceptPatientId } } : {};

  const found = await prisma.patient.findFirst({
    where: { tenantId, deletedAt: null, cpfHash: cpfHash(cpf, tenantId), ...notSelf },
    select: { id: true },
  });
  if (found) return true;

  const pendentes = await prisma.patient.findMany({
    where: { tenantId, deletedAt: null, cpfHash: null, cpfEncrypted: { not: null }, ...notSelf },
    select: { cpfEncrypted: true },
  });
  const digits = digitsOf(cpf);
  return pendentes.some((p) => {
    try {
      return digitsOf(decrypt(p.cpfEncrypted!, masterKey(), tenantId)) === digits;
    } catch {
      return false;
    }
  });
}

/**
 * Dá `cpfHash` aos pacientes antigos, em lotes. Roda no relógio do CRM: só o
 * app tem a chave para abrir o CPF. Grava só a coluna nova, sem mexer no
 * `updatedAt` nem em nada que já existia. Devolve quantos preencheu.
 */
export async function fillMissingCpfHashes(limit = 200): Promise<number> {
  const rows = await prisma.patient.findMany({
    where: { cpfHash: null, cpfEncrypted: { not: null } },
    select: { id: true, tenantId: true, cpfEncrypted: true },
    take: limit,
  });

  let filled = 0;
  for (const row of rows) {
    let cpf: string;
    try {
      cpf = digitsOf(decrypt(row.cpfEncrypted!, masterKey(), row.tenantId));
    } catch {
      continue; // Ilegível: fica sem código, e a conferência de repetido o ignora.
    }
    if (!cpf) continue;
    filled += await prisma.$executeRaw`
      UPDATE "patients" SET "cpfHash" = ${cpfHash(cpf, row.tenantId)}
      WHERE "id" = ${row.id} AND "cpfHash" IS NULL`;
  }
  return filled;
}
