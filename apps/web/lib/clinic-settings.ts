import 'server-only';

import { prisma } from '@clinicaiq/db';
import { currentAccess } from './guard';
import { DEFAULT_RECEIPT_METHODS, readReceiptMethods } from './payment-methods';

/** As formas de recebimento da clínica de quem está logado (Configurações → Financeiro). */
export async function getReceiptMethods(): Promise<string[]> {
  const acesso = await currentAccess();
  if (!acesso) return DEFAULT_RECEIPT_METHODS;
  const t = await prisma.tenant.findUnique({ where: { id: acesso.tenantId }, select: { settings: true } });
  return readReceiptMethods(t?.settings);
}
