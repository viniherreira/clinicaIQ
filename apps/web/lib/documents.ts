import 'server-only';
import { cache } from 'react';
import { decrypt, prisma } from '@clinicaiq/db';
import type { ClinicInfo } from '@clinicaiq/pdf';
import { composeAddress } from './address';
import { formatDocument, isValidDocument } from './document';
import { formatPhoneBR } from './document-content';
import { downloadObject, storageEnabled } from './storage';

/**
 * Dados da clínica do jeito que os PDFs consomem, com o logotipo já embutido.
 *
 * Em cache por requisição: o contrato e o orçamento da mesma tela não baixam o
 * logotipo duas vezes.
 */
export const loadClinicInfo = cache(async (tenantId: string): Promise<ClinicInfo> => {
  const t = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      name: true,
      document: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      logoUrl: true,
      technicalResponsible: true,
      technicalRegistration: true,
    },
  });

  return {
    name: t.name,
    document: t.document ? (isValidDocument(t.document) ? formatDocument(t.document) : t.document) : undefined,
    address: t.address ?? undefined,
    city: t.city ?? undefined,
    cityState: t.city ? [t.city, t.state].filter(Boolean).join('/') : undefined,
    phone: formatPhoneBR(t.phone),
    email: t.email ?? undefined,
    logo: t.logoUrl ? await logoDataUri(t.logoUrl) : undefined,
    technicalResponsible: t.technicalResponsible ?? undefined,
    technicalRegistration: t.technicalRegistration ?? undefined,
  };
});

/**
 * O logotipo vira data URI aqui, no servidor. Falha ao baixar não pode derrubar
 * o documento: sai sem logotipo, e o resto do papel continua valendo.
 */
async function logoDataUri(path: string): Promise<string | undefined> {
  if (!storageEnabled()) return undefined;
  try {
    const obj = await downloadObject(path);
    if (!obj) return undefined;
    // O react-pdf só desenha PNG e JPEG. O upload já restringe, mas um arquivo
    // trocado por fora não pode quebrar a geração.
    const type = obj.contentType.includes('png') ? 'image/png' : obj.contentType.includes('jpeg') || obj.contentType.includes('jpg') ? 'image/jpeg' : null;
    if (!type) return undefined;
    return `data:${type};base64,${Buffer.from(obj.bytes).toString('base64')}`;
  } catch {
    return undefined;
  }
}

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

/**
 * Descriptografa um campo de paciente para impressão. Nunca registra o valor; um
 * campo ilegível sai como ausente e o PDF imprime linha em branco no lugar.
 */
export function readEncrypted(value: string | null | undefined, tenantId: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value, masterKey(), tenantId) || undefined;
  } catch {
    return undefined;
  }
}

export interface PatientDocData {
  name: string;
  cpf?: string;
  phone?: string;
  email?: string;
  address?: string;
  birthDate: Date | null;
  maritalStatus?: string | null;
  profession?: string | null;
  controlNumber: number;
}

/** Paciente pronto para documento: CPF e telefone em claro, endereço numa linha. */
export async function loadPatientDocData(patientId: string, tenantId: string): Promise<PatientDocData | null> {
  const p = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: {
      name: true,
      cpfEncrypted: true,
      phoneEncrypted: true,
      email: true,
      birthDate: true,
      maritalStatus: true,
      profession: true,
      controlNumber: true,
      zipCode: true,
      street: true,
      addressNumber: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
    },
  });
  if (!p) return null;

  const cpf = readEncrypted(p.cpfEncrypted, tenantId);
  return {
    name: p.name,
    cpf: cpf ? formatDocument(cpf) : undefined,
    phone: formatPhoneBR(readEncrypted(p.phoneEncrypted, tenantId)),
    email: p.email ?? undefined,
    // Sem rua não é endereço: "São Paulo/SP" sozinho num contrato é pior do que
    // a linha em branco para completar.
    address: p.street ? (composeAddress(p) ?? undefined) : undefined,
    birthDate: p.birthDate,
    maritalStatus: p.maritalStatus,
    profession: p.profession,
    controlNumber: p.controlNumber,
  };
}
