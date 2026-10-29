import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { currentAccess } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { exportPatientData } from '@/lib/patient-lgpd';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Baixa, em JSON, tudo o que a clínica tem de um paciente (LGPD art. 18:
 * acesso e portabilidade). Só quem cuida da privacidade (dono e administrador),
 * e cada exportação fica no registro de atividades.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await currentAccess();
  if (!acesso) return new NextResponse('Entre de novo.', { status: 401 });
  if (!can(acesso.role, 'privacidade')) return new NextResponse('Seu perfil não exporta dados de paciente.', { status: 403 });

  const { id } = await params;
  const dados = await exportPatientData(acesso.tenantId, id);
  if (!dados) return new NextResponse('Paciente não encontrado.', { status: 404 });

  await prisma.auditLog.create({
    data: { tenantId: acesso.tenantId, userId: acesso.userId, action: 'PATIENT_EXPORTED', entity: 'Patient', entityId: id },
  });

  return new NextResponse(JSON.stringify(dados, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="paciente-${dados.paciente.numero}-dados.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
