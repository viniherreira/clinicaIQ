import { PrismaClient } from '@prisma/client';
import { addHours, addMinutes, setHours, setMinutes, startOfDay } from 'date-fns';

const prisma = new PrismaClient();

const PROFESSIONAL_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4'];

async function main() {
  // Find first tenant
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log('No tenant found. Run onboarding first.');
    return;
  }

  console.log(`Seeding for tenant: ${tenant.name}`);

  // Upsert professionals
  const professionals = await Promise.all([
    prisma.professional.upsert({
      where: { id: `seed-pro-1-${tenant.id}` },
      update: {},
      create: {
        id: `seed-pro-1-${tenant.id}`,
        tenantId: tenant.id,
        name: 'Dra. Ana Costa',
        specialty: 'Clínico Geral',
        active: true,
      },
    }),
    prisma.professional.upsert({
      where: { id: `seed-pro-2-${tenant.id}` },
      update: {},
      create: {
        id: `seed-pro-2-${tenant.id}`,
        tenantId: tenant.id,
        name: 'Dr. Pedro Lima',
        specialty: 'Ortodontia',
        active: true,
      },
    }),
    prisma.professional.upsert({
      where: { id: `seed-pro-3-${tenant.id}` },
      update: {},
      create: {
        id: `seed-pro-3-${tenant.id}`,
        tenantId: tenant.id,
        name: 'Dra. Julia Ramos',
        specialty: 'Endodontia',
        active: true,
      },
    }),
  ]);

  // Upsert procedures
  const procedures = await Promise.all([
    prisma.procedure.upsert({
      where: { id: `seed-proc-1-${tenant.id}` },
      update: {},
      create: { id: `seed-proc-1-${tenant.id}`, tenantId: tenant.id, name: 'Avaliação', durationMinutes: 30, basePrice: 100, active: true },
    }),
    prisma.procedure.upsert({
      where: { id: `seed-proc-2-${tenant.id}` },
      update: {},
      create: { id: `seed-proc-2-${tenant.id}`, tenantId: tenant.id, name: 'Limpeza', durationMinutes: 30, basePrice: 150, active: true },
    }),
    prisma.procedure.upsert({
      where: { id: `seed-proc-3-${tenant.id}` },
      update: {},
      create: { id: `seed-proc-3-${tenant.id}`, tenantId: tenant.id, name: 'Restauração', durationMinutes: 60, basePrice: 280, active: true },
    }),
    prisma.procedure.upsert({
      where: { id: `seed-proc-4-${tenant.id}` },
      update: {},
      create: { id: `seed-proc-4-${tenant.id}`, tenantId: tenant.id, name: 'Canal', durationMinutes: 90, basePrice: 800, active: true },
    }),
    prisma.procedure.upsert({
      where: { id: `seed-proc-5-${tenant.id}` },
      update: {},
      create: { id: `seed-proc-5-${tenant.id}`, tenantId: tenant.id, name: 'Clareamento', durationMinutes: 60, basePrice: 350, active: true },
    }),
    prisma.procedure.upsert({
      where: { id: `seed-proc-6-${tenant.id}` },
      update: {},
      create: { id: `seed-proc-6-${tenant.id}`, tenantId: tenant.id, name: 'Extração', durationMinutes: 45, basePrice: 200, active: true },
    }),
  ]);

  // Find or create a test patient
  let patient = await prisma.patient.findFirst({ where: { tenantId: tenant.id } });
  if (!patient) {
    const last = await prisma.patient.findFirst({ where: { tenantId: tenant.id }, orderBy: { controlNumber: 'desc' } });
    patient = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        controlNumber: (last?.controlNumber ?? 0) + 1,
        name: 'Paciente Exemplo',
        phoneEncrypted: 'mock-encrypted',
        lgpdConsentAt: new Date(),
      },
    });
  }

  // Create sample appointments for today
  const today = startOfDay(new Date());
  const slots = [
    { hour: 8, minute: 0, proIdx: 0, procIdx: 0, status: 'CONFIRMED' },
    { hour: 9, minute: 0, proIdx: 0, procIdx: 1, status: 'SCHEDULED' },
    { hour: 8, minute: 30, proIdx: 1, procIdx: 2, status: 'ATTENDED' },
    { hour: 10, minute: 0, proIdx: 1, procIdx: 4, status: 'SCHEDULED' },
    { hour: 9, minute: 0, proIdx: 2, procIdx: 3, status: 'CONFIRMED' },
  ];

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const start = setMinutes(setHours(today, s.hour), s.minute);
    const proc = procedures[s.procIdx];
    const end = addMinutes(start, proc.durationMinutes);
    await prisma.appointment.upsert({
      where: { id: `seed-apt-${i}-${tenant.id}` },
      update: { startTime: start, endTime: end },
      create: {
        id: `seed-apt-${i}-${tenant.id}`,
        tenantId: tenant.id,
        patientId: patient.id,
        professionalId: professionals[s.proIdx].id,
        procedureId: proc.id,
        startTime: start,
        endTime: end,
        status: s.status as any,
      },
    });
  }

  console.log(`✓ Seeded: ${professionals.length} professionals, ${procedures.length} procedures, ${slots.length} appointments`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
