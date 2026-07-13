'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runAssistant, type ChatTurn } from '@/lib/assistant';
import { reportError } from '@/lib/observability';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');

  return { tenantId: tenant.id };
}

const chatSchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().trim().min(1).max(2000),
    }),
  )
  .min(1)
  .max(20);

export type AskResult =
  | { ok: true; reply: string; toolsUsed: string[] }
  | { ok: false; error: string };

export async function askAssistant(history: ChatTurn[]): Promise<AskResult> {
  const { tenantId } = await requireTenant();

  const parsed = chatSchema.safeParse(history);
  if (!parsed.success || parsed.data[parsed.data.length - 1].role !== 'user') {
    return { ok: false, error: 'Mensagem inválida.' };
  }

  try {
    const result = await runAssistant(tenantId, parsed.data);
    return { ok: true, reply: result.text, toolsUsed: result.toolsUsed };
  } catch (err) {
    reportError(err, { scope: 'assistant' });
    return { ok: false, error: 'O assistente está indisponível no momento. Tente de novo em instantes.' };
  }
}
