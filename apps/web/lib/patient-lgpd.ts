import 'server-only';

import { decrypt, encrypt, getTenantClient, prisma } from '@clinicaiq/db';
import { eraseLeadPersonalData, ERASED_NAME } from '@/crm/anonymize';

/**
 * Direitos do titular (LGPD art. 18) para o paciente: entregar a ele tudo o
 * que a clínica tem (exportar) e tirar do cadastro o que o identifica
 * (anonimizar).
 *
 * Anonimizar não apaga o prontuário. Anamnese, evoluções, odontograma,
 * imagens, orçamentos e pagamentos ficam, ligados a um cadastro sem nome nem
 * contato: o prontuário tem prazo de guarda (Lei 13.787/2018, 20 anos), e a
 * LGPD permite manter o que a lei obriga (art. 16, I). Saem os dados de
 * identificação, as notas da equipe (administrativas, costumam ter dado
 * pessoal solto) e o que o CRM tem da pessoa (negócios e conversas).
 */

export const ANONYMIZED_PREFIX = 'Paciente anonimizado nº';

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const abrir = (cifra: string | null, tenantId: string): string | null => {
  if (!cifra) return null;
  try {
    return decrypt(cifra, masterKey(), tenantId);
  } catch {
    return null;
  }
};

const dia = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Tudo o que a clínica tem do paciente, legível, ou null se não for desta clínica. */
export async function exportPatientData(tenantId: string, patientId: string) {
  const p = await prisma.patient.findFirst({ where: { id: patientId, tenantId } });
  if (!p) return null;
  const w = { tenantId, patientId };

  const [clinica, notas, consultas, orcamentos, pagamentos, anamnese, evolucoes, achados, arquivos, avisos, negocios, conversas] =
    await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.patientNote.findMany({ where: w, orderBy: { createdAt: 'asc' }, select: { content: true, createdAt: true, user: { select: { name: true } } } }),
      prisma.appointment.findMany({
        where: w,
        orderBy: { startTime: 'asc' },
        select: { startTime: true, endTime: true, status: true, notes: true, professional: { select: { name: true } }, procedure: { select: { name: true } } },
      }),
      prisma.quote.findMany({
        where: w,
        orderBy: { number: 'asc' },
        select: { number: true, status: true, total: true, createdAt: true, items: { select: { name: true, quantity: true, total: true } } },
      }),
      prisma.payment.findMany({ where: w, orderBy: { paidAt: 'asc' }, select: { amount: true, method: true, paidAt: true, notes: true } }),
      prisma.anamnesis.findFirst({ where: w, select: { answers: true } }),
      prisma.evolution.findMany({
        where: w,
        orderBy: { createdAt: 'asc' },
        select: { description: true, teeth: true, createdAt: true, professional: { select: { name: true } } },
      }),
      prisma.toothFinding.findMany({
        where: w,
        orderBy: [{ toothNumber: 'asc' }, { createdAt: 'asc' }],
        select: { toothNumber: true, surfaces: true, kind: true, status: true, note: true, doneAt: true },
      }),
      prisma.patientFile.findMany({ where: w, orderBy: { createdAt: 'asc' }, select: { filename: true, mimeType: true, sizeBytes: true, description: true, createdAt: true } }),
      prisma.whatsAppMessage.findMany({ where: w, orderBy: { createdAt: 'asc' }, select: { content: true, templateName: true, status: true, createdAt: true } }),
      prisma.lead.findMany({ where: w, select: { id: true, name: true, title: true, source: true, createdAt: true } }),
      prisma.conversation.findMany({ where: w, select: { id: true } }),
    ]);

  const conversaIds = [...new Set([...conversas.map((c) => c.id)])];
  const mensagens = conversaIds.length
    ? await prisma.chatMessage.findMany({
        where: { tenantId, conversationId: { in: conversaIds } },
        orderBy: { at: 'asc' },
        select: { conversationId: true, at: true, direction: true, textEncrypted: true },
      })
    : [];

  return {
    geradoEm: new Date().toISOString(),
    clinica: clinica?.name ?? null,
    paciente: {
      numero: p.controlNumber,
      nome: p.name,
      apelido: p.nickname,
      cpf: abrir(p.cpfEncrypted, tenantId),
      telefone: abrir(p.phoneEncrypted, tenantId),
      telefone2: abrir(p.phone2Encrypted, tenantId),
      email: p.email,
      nascimento: dia(p.birthDate),
      genero: p.gender,
      estadoCivil: p.maritalStatus,
      profissao: p.profession,
      indicadoPor: p.referredBy,
      observacoes: p.notes,
      endereco: {
        cep: p.zipCode,
        rua: p.street,
        numero: p.addressNumber,
        complemento: p.complement,
        bairro: p.neighborhood,
        cidade: p.city,
        estado: p.state,
      },
      aceiteTratamentoEm: dia(p.lgpdConsentAt),
      aceiteCampanhaEm: dia(p.marketingConsentAt),
      cadastradoEm: dia(p.createdAt),
    },
    notas: notas.map((n) => ({ em: dia(n.createdAt), autor: n.user?.name ?? null, texto: n.content })),
    agendamentos: consultas.map((a) => ({
      inicio: dia(a.startTime),
      fim: dia(a.endTime),
      situacao: a.status,
      profissional: a.professional?.name ?? null,
      procedimento: a.procedure?.name ?? null,
      observacoes: a.notes,
    })),
    orcamentos: orcamentos.map((q) => ({
      numero: q.number,
      situacao: q.status,
      total: Number(q.total),
      criadoEm: dia(q.createdAt),
      itens: q.items.map((i) => ({ nome: i.name, quantidade: i.quantity, total: Number(i.total) })),
    })),
    pagamentos: pagamentos.map((x) => ({ valor: Number(x.amount), forma: x.method, pagoEm: dia(x.paidAt), observacoes: x.notes })),
    anamnese: anamnese?.answers ?? null,
    evolucoes: evolucoes.map((e) => ({ em: dia(e.createdAt), profissional: e.professional?.name ?? null, dentes: e.teeth, texto: e.description })),
    odontograma: achados.map((f) => ({
      dente: f.toothNumber,
      faces: f.surfaces,
      tipo: f.kind,
      situacao: f.status,
      observacao: f.note,
      feitoEm: dia(f.doneAt),
    })),
    arquivos: arquivos.map((f) => ({ nome: f.filename, tipo: f.mimeType, bytes: f.sizeBytes, descricao: f.description, enviadoEm: dia(f.createdAt) })),
    avisosWhatsapp: avisos.map((m) => ({ em: dia(m.createdAt), modelo: m.templateName, situacao: m.status, texto: m.content })),
    crm: {
      negocios: negocios.map((l) => ({ nome: l.name, titulo: l.title, origem: l.source, criadoEm: dia(l.createdAt) })),
      conversas: conversaIds.map((id) => ({
        mensagens: mensagens
          .filter((m) => m.conversationId === id)
          .map((m) => ({ em: dia(m.at), direcao: m.direction === 'INBOUND' ? 'paciente' : 'clinica', texto: abrir(m.textEncrypted, tenantId) })),
      })),
    },
  };
}

export type AnonymizeResult = { ok: true; mediaRefs: string[] } | { ok: false; message: string };

/** Tira do cadastro o que identifica o paciente. O prontuário fica. */
export async function anonymizePatient(tenantId: string, userId: string, patientId: string): Promise<AnonymizeResult> {
  const p = await prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true, name: true, controlNumber: true } });
  if (!p) return { ok: false, message: 'Paciente não encontrado.' };
  if (p.name.startsWith(ANONYMIZED_PREFIX)) return { ok: false, message: 'Este paciente já foi anonimizado.' };

  // CRM primeiro: negócios e conversas da pessoa, pelo mesmo caminho do
  // "Apagar dados" do lead (pega também o que veio pelo telefone).
  const db = getTenantClient(tenantId);
  const mediaRefs: string[] = [];
  const negocios = await prisma.lead.findMany({ where: { tenantId, patientId, NOT: { name: ERASED_NAME } }, select: { id: true } });
  for (const l of negocios) {
    const r = await eraseLeadPersonalData(db, { tenantId, userId }, l.id);
    if (r.ok) mediaRefs.push(...r.mediaRefs);
  }
  // Conversa ligada ao paciente sem negócio.
  const soltas = await prisma.conversation.findMany({ where: { tenantId, patientId }, select: { id: true } });
  const ids = soltas.map((c) => c.id);
  if (ids.length) {
    const comArquivo = await prisma.chatMessage.findMany({
      where: { tenantId, conversationId: { in: ids }, mediaRef: { not: null } },
      select: { mediaRef: true },
    });
    mediaRefs.push(...comArquivo.map((m) => m.mediaRef!).filter((r) => r.startsWith('store:') || r.startsWith('local:')));
  }

  await prisma.$transaction([
    prisma.broadcastRecipient.deleteMany({ where: { tenantId, conversationId: { in: ids } } }),
    prisma.chatMessage.deleteMany({ where: { tenantId, conversationId: { in: ids } } }),
    prisma.conversation.deleteMany({ where: { tenantId, id: { in: ids } } }),
    prisma.patientNote.deleteMany({ where: { tenantId, patientId } }),
    // Os avisos de consulta levam o nome do paciente no texto.
    prisma.whatsAppMessage.updateMany({ where: { tenantId, patientId }, data: { content: '' } }),
    prisma.patient.update({
      where: { id: p.id, tenantId },
      data: {
        name: `${ANONYMIZED_PREFIX} ${p.controlNumber}`,
        nickname: null,
        cpfEncrypted: null,
        cpfHash: null,
        phoneEncrypted: encrypt('', masterKey(), tenantId),
        phone2Encrypted: null,
        email: null,
        birthDate: null,
        gender: null,
        maritalStatus: null,
        profession: null,
        referredBy: null,
        notes: null,
        zipCode: null,
        street: null,
        addressNumber: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        marketingConsentAt: null,
        active: false,
        updatedById: userId,
      },
    }),
    prisma.auditLog.create({
      data: { tenantId, userId, action: 'PATIENT_ANONYMIZED', entity: 'Patient', entityId: p.id, metadata: { numero: p.controlNumber } },
    }),
  ]);

  return { ok: true, mediaRefs };
}
