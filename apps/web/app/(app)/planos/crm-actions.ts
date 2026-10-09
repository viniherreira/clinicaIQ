'use server';

import { revalidatePath } from 'next/cache';
import { currentAccess } from '@/lib/guard';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { setCrmSeat, syncBillingValue, turnOffCrm, turnOnCrm } from '@/crm/addon';

/**
 * Contratar e desligar o CRM (perfil `planos`) e dar acesso por pessoa
 * (perfil `equipe`). Cada mudança recalcula a mensalidade no Asaas; se o
 * Asaas falhar, a mudança vale e a rotina diária acerta o valor depois.
 */

type Result = { ok: true; message?: string } | { ok: false; message: string };

async function sincronizar(tenantId: string) {
  try {
    await syncBillingValue(tenantId);
  } catch (error) {
    console.error('[crm] valor da assinatura não sincronizado', tenantId, error instanceof Error ? error.message : error);
  }
}

function refresh() {
  revalidatePath('/configuracoes');
  revalidatePath('/crm-indisponivel');
  revalidatePath('/crm');
  revalidatePath('/dashboard');
}

export async function turnOnCrmAction(): Promise<Result> {
  const acesso = await currentAccess();
  if (!acesso) return { ok: false, message: 'Sua sessão expirou. Entre de novo.' };
  const semPerfil = await capabilityBlocked(acesso.tenantId, 'planos');
  if (semPerfil) return { ok: false, message: semPerfil };
  const bloqueio = await writeBlocked(acesso.tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const r = await turnOnCrm(acesso.tenantId, acesso.userId);
  if (!r.ok) return r;
  await sincronizar(acesso.tenantId);
  refresh();
  return {
    ok: true,
    message:
      r.mode === 'trial'
        ? 'CRM ligado: 14 dias grátis. Você já tem acesso.'
        : r.mode === 'complimentary'
          ? 'CRM ligado, incluído na cortesia.'
          : 'CRM ligado. A cobrança por usuário entra na mensalidade.',
  };
}

export async function turnOffCrmAction(): Promise<Result> {
  const acesso = await currentAccess();
  if (!acesso) return { ok: false, message: 'Sua sessão expirou. Entre de novo.' };
  const semPerfil = await capabilityBlocked(acesso.tenantId, 'planos');
  if (semPerfil) return { ok: false, message: semPerfil };

  const r = await turnOffCrm(acesso.tenantId, acesso.userId);
  if (!r.ok) return r;
  await sincronizar(acesso.tenantId);
  refresh();
  return { ok: true, message: 'CRM desligado. Os leads ficam guardados se você religar.' };
}

export async function setCrmSeatAction(userId: string, on: boolean): Promise<Result> {
  const acesso = await currentAccess();
  if (!acesso) return { ok: false, message: 'Sua sessão expirou. Entre de novo.' };
  const semPerfil = await capabilityBlocked(acesso.tenantId, 'equipe');
  if (semPerfil) return { ok: false, message: semPerfil };
  const bloqueio = await writeBlocked(acesso.tenantId);
  if (bloqueio && on) return { ok: false, message: bloqueio };

  const r = await setCrmSeat(acesso.tenantId, acesso.userId, userId, on);
  if (!r.ok) return r;
  await sincronizar(acesso.tenantId);
  refresh();
  return { ok: true };
}
