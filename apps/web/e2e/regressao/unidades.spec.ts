import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { createPatient, tomorrowISO, uniqueName } from '../support/helpers';
import { E2E_TENANT_SLUG } from '../support/seed';

/**
 * Unidades (várias clínicas na mesma conta): cadastrar nas Configurações,
 * trocar no topo e cada unidade com a sua agenda. Os pacientes são os mesmos.
 *
 * A unidade e a profissional criadas aqui saem no fim: com duas unidades
 * ativas, o seletor aparece para os outros testes que rodam junto.
 */
test('unidades: cadastrar, trocar no topo e a agenda de cada uma', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const nome = uniqueName('Unidade E2E');
  const doutora = uniqueName('Dra Sul E2E');
  const paciente = uniqueName('Paciente Unidade E2E');
  let unitId = '';
  let profId = '';
  try {
    await page.goto('/configuracoes#clinica');
    await page.getByRole('button', { name: 'Nova unidade' }).click();
    const form = page.getByRole('form', { name: 'Nova unidade' });
    await form.getByLabel(/^Nome da unidade/).fill(nome);
    await form.getByLabel('Cidade').fill('Santo André');
    await form.getByLabel('UF').fill('sp');
    await form.getByRole('checkbox', { name: 'Esta unidade tem horário próprio' }).check();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
    await form.getByRole('button', { name: 'Criar unidade' }).click();
    await expect(page.getByRole('region', { name: 'Unidades' }).getByRole('button', { name: `Editar ${nome}` })).toBeVisible();

    const unit = await prisma.clinicUnit.findFirstOrThrow({ where: { tenantId: tenant.id, name: nome } });
    unitId = unit.id;
    expect(unit.address).toBe('Santo André/SP');
    expect(unit.businessHours).not.toBeNull();

    // Uma profissional que só atende na nova unidade.
    const prof = await prisma.professional.create({ data: { tenantId: tenant.id, name: doutora, color: '#0EA5E9', active: true } });
    profId = prof.id;
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      await prisma.professionalSchedule.create({
        data: { professionalId: prof.id, dayOfWeek, startTime: '07:00', endTime: '21:00', unitId: unit.id },
      });
    }

    await createPatient(page, paciente);
    const date = tomorrowISO();
    await page.goto(`/agenda?date=${date}`);
    const seletor = page.getByLabel('Unidade', { exact: true });
    await seletor.selectOption({ label: nome });
    await expect(seletor).toHaveValue(unit.id);

    await page.getByRole('button', { name: 'Novo agendamento (N)' }).click();
    const modal = page.getByRole('dialog', { name: 'Novo agendamento' });
    await modal.getByLabel(/^Data/).fill(date);
    await modal.getByLabel(/^Início/).fill('11:00');
    await modal.getByLabel(/^Fim/).fill('11:30');
    await modal.getByRole('combobox', { name: /Profissional/ }).click();
    await page.getByRole('option', { name: doutora }).click();
    await modal.getByRole('combobox', { name: /Buscar paciente/ }).fill(paciente);
    await page.getByRole('option', { name: new RegExp(paciente) }).click();
    await modal.getByRole('checkbox', { name: 'Enviar confirmação por WhatsApp' }).uncheck();
    await modal.getByRole('button', { name: 'Agendar' }).click();
    await expect(modal).toBeHidden();
    const bloco = page.getByRole('button', { name: new RegExp(`${paciente}.*Agendado`) });
    await expect(bloco).toBeVisible();
    expect((await prisma.appointment.findFirstOrThrow({ where: { tenantId: tenant.id, professionalId: prof.id } })).unitId).toBe(unit.id);

    // Na principal, o horário da outra unidade não aparece.
    const principal = await prisma.clinicUnit.findFirstOrThrow({ where: { tenantId: tenant.id }, orderBy: { order: 'asc' } });
    await seletor.selectOption(principal.id);
    await expect(seletor).toHaveValue(principal.id);
    await expect(bloco).toHaveCount(0);
  } finally {
    if (profId) {
      await prisma.appointment.deleteMany({ where: { tenantId: tenant.id, professionalId: profId } });
      await prisma.professionalSchedule.deleteMany({ where: { professionalId: profId } });
      await prisma.professional.deleteMany({ where: { id: profId } });
    }
    if (unitId) await prisma.clinicUnit.deleteMany({ where: { id: unitId } });
  }
});

test('agendamento online: com duas unidades, o paciente escolhe onde e só vê quem atende lá', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const antes = tenant.settings;
  const nome = uniqueName('Unidade Online E2E');
  const doutora = uniqueName('Dra Online E2E');
  const paciente = uniqueName('Paciente Online E2E');
  let unitId = '';
  let profId = '';
  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { settings: { ...((antes ?? {}) as object), onlineBooking: { enabled: true, minAdvanceHours: 0, maxDaysAhead: 30, stepMinutes: 60 } } },
    });
    const unit = await prisma.clinicUnit.create({ data: { tenantId: tenant.id, name: nome, address: 'Rua E2E, 1', order: 900 } });
    unitId = unit.id;
    const prof = await prisma.professional.create({ data: { tenantId: tenant.id, name: doutora, color: '#22C55E', active: true } });
    profId = prof.id;
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      await prisma.professionalSchedule.create({
        data: { professionalId: prof.id, dayOfWeek, startTime: '08:00', endTime: '18:00', unitId: unit.id },
      });
    }

    await page.goto(`/agendar/${E2E_TENANT_SLUG}`);
    await page.getByRole('radio', { name: new RegExp(nome) }).click();
    // Só quem atende nesta unidade (a profissional dos outros testes atende na principal).
    await expect(page.getByRole('radio', { name: new RegExp(doutora) })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Dra\. Teste E2E/ })).toHaveCount(0);

    await page.getByRole('radiogroup', { name: /Qual dia/ }).getByRole('radio').nth(1).click();
    await page.getByRole('radio', { name: '10:00' }).click();
    await page.getByLabel('Nome completo').fill(paciente);
    await page.getByLabel('WhatsApp com DDD').fill('11987650000');
    await page.getByRole('checkbox', { name: /Concordo/ }).check();
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await expect(page.getByRole('heading', { name: 'Horário marcado!' })).toBeVisible();

    const appt = await prisma.appointment.findFirstOrThrow({ where: { tenantId: tenant.id, professionalId: prof.id } });
    expect(appt.unitId).toBe(unit.id);
  } finally {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: (antes ?? {}) as object } });
    if (profId) {
      await prisma.whatsAppMessage.deleteMany({ where: { tenantId: tenant.id, appointment: { professionalId: profId } } });
      await prisma.appointment.deleteMany({ where: { tenantId: tenant.id, professionalId: profId } });
      await prisma.professionalSchedule.deleteMany({ where: { professionalId: profId } });
      await prisma.professional.deleteMany({ where: { id: profId } });
    }
    if (unitId) await prisma.clinicUnit.deleteMany({ where: { id: unitId } });
  }
});
