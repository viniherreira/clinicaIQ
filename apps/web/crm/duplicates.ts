import type { TenantPrismaClient } from '@clinicaiq/db';
import { OPEN_LEAD } from './leads';
import { canonicalPhone, decryptPhone, phoneHash } from './phone';

/**
 * Já conhecemos este telefone?
 *
 * Entre leads, só os abertos contam: a mesma pessoa pode voltar ano que vem
 * com outro interesse, e aí é um negócio novo — como no Kommo.
 */
export async function findOpenLeadByPhone(db: TenantPrismaClient, tenantId: string, phone: string) {
  return db.lead.findFirst({
    where: { phoneHash: phoneHash(phone, tenantId), ...OPEN_LEAD },
    select: { id: true, name: true, stageId: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Paciente com este telefone (principal ou secundário).
 *
 * Pacientes não têm índice cego: decifra os telefones da clínica e compara,
 * como a busca de pacientes já faz (`pacientes/actions.ts`). Linear no número
 * de pacientes — imperceptível em alguns milhares.
 */
export async function findPatientByPhone(db: TenantPrismaClient, tenantId: string, phone: string) {
  const alvo = canonicalPhone(phone);
  if (!alvo) return null;

  const pacientes = await db.patient.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, controlNumber: true, phoneEncrypted: true, phone2Encrypted: true },
  });

  const achado = pacientes.find((p) =>
    [p.phoneEncrypted, p.phone2Encrypted].some((cipher) => cipher && canonicalPhone(decryptPhone(cipher, tenantId)) === alvo),
  );
  return achado ? { id: achado.id, name: achado.name, controlNumber: achado.controlNumber } : null;
}
