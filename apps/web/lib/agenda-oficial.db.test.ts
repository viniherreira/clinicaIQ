import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';
process.env.META_APP_SECRET = 'segredo-de-teste';

/**
 * Os avisos da agenda pela API oficial, numa clínica SEM o CRM: os modelos vão
 * para a Meta ao conectar, o lembrete sai pelo modelo aprovado com os botões, e
 * o toque em Confirmar confirma a consulta.
 */

type Chamada = { url: string; body: Record<string, unknown> | null };

/** Uma Meta de mentira: guarda o que recebeu e responde o básico. */
function metaFalsa() {
  const chamadas: Chamada[] = [];
  let n = 0;
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    chamadas.push({ url, body });
    if (url.includes('/message_templates') && init?.method !== 'GET' && body) {
      return new Response(JSON.stringify({ id: `T${++n}`, status: 'PENDING', category: 'UTILITY' }));
    }
    if (url.includes('/messages')) return new Response(JSON.stringify({ messages: [{ id: `wamid.${++n}` }] }));
    return new Response(JSON.stringify({ display_phone_number: '+55 11 3000-0000', verified_name: 'Clínica Oficial', success: true }));
  });
  return { chamadas, fetchFalso };
}

describe.skipIf(!process.env.DATABASE_URL)('avisos da agenda pela API oficial (banco)', async () => {
  const { prisma, encrypt } = await import('@clinicaiq/db');
  const { connectManual } = await import('./cloud-account-admin');
  const { submitAgendaTemplate, approvedAgendaTemplate } = await import('./agenda-templates-sync');
  const { dispatchAppointmentMessage } = await import('./whatsapp');
  const { POST } = await import('@/app/api/webhooks/meta/route');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `agof_${suffix}`, name: 'Clínica Oficial', slug: `agof-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const profissional = await prisma.professional.create({ data: { tenantId: tenant.id, name: 'Dra. Paula' } });
  const telefone = `1198${String(Date.now()).slice(-7)}`;
  const paciente = await prisma.patient.create({
    data: {
      tenantId: tenant.id,
      controlNumber: 1,
      name: 'Maria Aparecida',
      phoneEncrypted: encrypt(telefone, process.env.ENCRYPTION_MASTER_KEY!, tenant.id),
      lgpdConsentAt: new Date(),
    },
  });
  const amanha = new Date(Date.now() + 26 * 3_600_000);
  const consulta = await prisma.appointment.create({
    data: { tenantId: tenant.id, patientId: paciente.id, professionalId: profissional.id, startTime: amanha, endTime: new Date(amanha.getTime() + 30 * 60_000) },
  });
  const pn = String(Date.now()).slice(-12);
  const waba = `9${String(Date.now()).slice(-10)}`;

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.whatsAppMessage.deleteMany({ where: t });
    await prisma.appointment.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.professional.deleteMany({ where: t });
    await prisma.messageTemplate.deleteMany({ where: t });
    await prisma.auditLog.deleteMany({ where: t });
    await prisma.whatsAppSession.deleteMany({ where: t });
    await prisma.whatsAppCloudAccount.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  const webhook = async (corpo: unknown) => {
    const raw = JSON.stringify(corpo);
    const sig = 'sha256=' + createHmac('sha256', 'segredo-de-teste').update(raw).digest('hex');
    return POST(new Request('http://localhost/api/webhooks/meta', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig } }));
  };

  it('ao conectar, os dois avisos vão para a Meta com os botões Confirmar e Reagendar', async () => {
    const meta = metaFalsa();
    vi.stubGlobal('fetch', meta.fetchFalso);
    expect(await connectManual(tenant.id, user.id, { token: 'TOKEN', phoneNumberId: pn, wabaId: waba })).toEqual({ ok: true });

    const criados = meta.chamadas.filter((c) => c.url.includes('/message_templates') && c.body);
    expect(criados.map((c) => c.body?.name)).toEqual(['dc_agendamento_1', 'dc_lembrete_1']);
    expect(criados[1].body).toMatchObject({ category: 'UTILITY', language: 'pt_BR' });
    const componentes = criados[1].body?.components as { type: string; text?: string; buttons?: unknown }[];
    expect(componentes[0].text).toMatch(/^Olá, \{\{1\}\}!/);
    expect(componentes[1]).toEqual({ type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmar' }, { type: 'QUICK_REPLY', text: 'Reagendar' }] });

    const salvos = await prisma.messageTemplate.findMany({ where: { tenantId: tenant.id }, orderBy: { name: 'asc' } });
    expect(salvos.map((s) => [s.name, s.purpose, s.status])).toEqual([
      ['dc_agendamento_1', 'APPOINTMENT_CREATED', 'PENDING'],
      ['dc_lembrete_1', 'APPOINTMENT_REMINDER', 'PENDING'],
    ]);
  });

  it('sem modelo aprovado, o lembrete não sai e o histórico diz por quê', async () => {
    const meta = metaFalsa();
    vi.stubGlobal('fetch', meta.fetchFalso);
    const r = await dispatchAppointmentMessage(consulta.id, 'reminder');
    expect(r).toMatchObject({ success: false, error: 'template-pending' });
    expect(meta.chamadas.filter((c) => c.url.includes('/messages'))).toHaveLength(0);
    const linha = await prisma.whatsAppMessage.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } });
    expect(linha).toMatchObject({ status: 'FAILED', templateName: 'appointment_confirmation' });
    expect(linha?.errorMessage).toContain('Aguardando a Meta');
    await prisma.whatsAppMessage.deleteMany({ where: { tenantId: tenant.id } });
  });

  it('a Meta aprova pelo webhook (vem pela conta, sem número)', async () => {
    const t = await prisma.messageTemplate.findFirstOrThrow({ where: { tenantId: tenant.id, purpose: 'APPOINTMENT_REMINDER' } });
    const res = await webhook({
      object: 'whatsapp_business_account',
      entry: [{ id: waba, changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: t.externalId, message_template_name: t.name, reason: 'NONE' } }] }],
    });
    expect(res.status).toBe(200);
    expect(await approvedAgendaTemplate(tenant.id, 'APPOINTMENT_REMINDER')).toMatchObject({ name: 'dc_lembrete_1' });
  });

  it('o lembrete sai pelo modelo aprovado, com as variáveis na ordem e o payload dos botões', async () => {
    const meta = metaFalsa();
    vi.stubGlobal('fetch', meta.fetchFalso);
    const r = await dispatchAppointmentMessage(consulta.id, 'reminder');
    expect(r.success).toBe(true);

    const envio = meta.chamadas.find((c) => c.url.includes(`${pn}/messages`));
    const template = envio?.body?.template as { name: string; components: { type: string; parameters: { text?: string; payload?: string }[] }[] };
    expect(envio?.body?.to).toBe(`55${telefone}`);
    expect(template.name).toBe('dc_lembrete_1');
    expect(template.components[0].parameters[0].text).toBe('Maria');
    expect(template.components.slice(1).map((c) => c.parameters[0].payload)).toEqual(['confirm', 'reschedule']);

    const linha = await prisma.whatsAppMessage.findFirst({ where: { tenantId: tenant.id, direction: 'OUTBOUND' }, orderBy: { createdAt: 'desc' } });
    expect(linha?.status).toBe('SENT');
    expect(linha?.content).toContain('Olá, Maria!');
    expect(linha?.content).toContain('Dra. Paula (consulta)');
  });

  it('o paciente toca em Confirmar: a consulta é confirmada, mesmo sem o CRM, e só uma vez', async () => {
    const corpo = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: waba,
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: pn },
                messages: [{ from: `55${telefone}`, id: `wamid.resp.${suffix}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'button', button: { text: 'Confirmar', payload: 'confirm' } }],
              },
            },
          ],
        },
      ],
    };
    expect((await webhook(corpo)).status).toBe(200);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: consulta.id } })).status).toBe('CONFIRMED');
    // A Meta reenviou o mesmo evento: não registra a resposta de novo.
    await webhook(corpo);
    expect(await prisma.whatsAppMessage.count({ where: { tenantId: tenant.id, direction: 'INBOUND' } })).toBe(1);
  });

  it('status de entrega da Meta chega no histórico da agenda', async () => {
    const linha = await prisma.whatsAppMessage.findFirstOrThrow({ where: { tenantId: tenant.id, direction: 'OUTBOUND', status: 'SENT' } });
    await webhook({
      object: 'whatsapp_business_account',
      entry: [{ id: waba, changes: [{ field: 'messages', value: { metadata: { phone_number_id: pn }, statuses: [{ id: linha.externalId, status: 'read', recipient_id: `55${telefone}` }] } }] }],
    });
    expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: linha.id } })).status).toBe('READ');
  });

  it('texto novo vira versão nova; o mesmo texto não vai de novo; texto fora das regras nem sai', async () => {
    const meta = metaFalsa();
    vi.stubGlobal('fetch', meta.fetchFalso);
    const texto = 'Oi {nome}! Lembrete: {data} às {hora} na {clinica}. Responda pelos botões.';
    expect(await submitAgendaTemplate(tenant.id, 'APPOINTMENT_REMINDER', texto)).toEqual({ ok: true, submitted: true });
    expect(await submitAgendaTemplate(tenant.id, 'APPOINTMENT_REMINDER', texto)).toEqual({ ok: true, submitted: false });
    expect(meta.chamadas.filter((c) => c.body?.name === 'dc_lembrete_2')).toHaveLength(1);
    // Enquanto a versão 2 está em análise, continua saindo a 1.
    expect(await approvedAgendaTemplate(tenant.id, 'APPOINTMENT_REMINDER')).toMatchObject({ name: 'dc_lembrete_1' });
    expect(await submitAgendaTemplate(tenant.id, 'APPOINTMENT_REMINDER', '{nome}, até amanhã')).toMatchObject({ ok: false });
  });
});
