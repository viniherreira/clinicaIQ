/**
 * Asaas — cobrança das clínicas pelo ClinicaIQ.
 *
 * Server-only. The API key grants full access to the account's money, so it
 * must never reach a Client Component or a bundle.
 */
import 'server-only';

const SANDBOX = 'https://api-sandbox.asaas.com/v3';
const PRODUCTION = 'https://api.asaas.com/v3';

/** Production only when explicitly asked. A missing var must never spend real money. */
const baseUrl = () => (process.env.ASAAS_ENV === 'production' ? PRODUCTION : SANDBOX);

export const isSandbox = () => process.env.ASAAS_ENV !== 'production';
export const isConfigured = () => Boolean(process.env.ASAAS_API_KEY);

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AsaasError';
  }
}

/**
 * Asaas answers 200 with an `errors` array as often as it uses a status code,
 * so both shapes have to be treated as failures — otherwise a rejected charge
 * reads as a created one and the clinic is billed for nothing.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new AsaasError('ASAAS_API_KEY não configurada.', 500);

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      access_token: key,
      'content-type': 'application/json',
      // Asaas asks integrations to identify themselves; without it some
      // accounts get throttled harder.
      'User-Agent': 'ClinicaIQ',
      ...init?.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new AsaasError(`Resposta inválida do Asaas: ${text.slice(0, 120)}`, res.status);
  }

  const errors = (body as { errors?: { code?: string; description?: string }[] } | null)?.errors;
  if (errors?.length) {
    const first = errors[0];
    throw new AsaasError(first?.description ?? 'Erro no Asaas.', res.status, first?.code);
  }
  if (!res.ok) throw new AsaasError(`Asaas respondeu ${res.status}.`, res.status);

  return body as T;
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string;
}

/**
 * Finds the clinic's customer by our own tenant id (stored as externalReference)
 * before creating one. Asaas happily creates duplicates with the same document,
 * and a duplicate means two subscriptions and two invoices for one clinic.
 *
 * Reusing is not enough on its own: Asaas accepts a customer with no document
 * but refuses to bill one, so a first attempt made before the clinic filled in
 * its CNPJ leaves an undocumented customer behind. Every later attempt found
 * that record, reused it as-is, and failed the same way — the clinic fills in
 * the CNPJ, sees no change, and has no way to tell why. So bring the stored
 * record up to date whenever we now know something it lacks.
 */
export async function ensureCustomer(input: {
  tenantId: string;
  name: string;
  cpfCnpj?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<string> {
  const document = input.cpfCnpj?.replace(/\D/g, '') || undefined;

  const found = await request<{ data: AsaasCustomer[] }>(
    `/customers?externalReference=${encodeURIComponent(input.tenantId)}&limit=1`,
  );
  const existing = found.data?.[0];

  if (existing?.id) {
    const stored = existing.cpfCnpj?.replace(/\D/g, '') || undefined;
    if (document && stored !== document) {
      await request<AsaasCustomer>(`/customers/${existing.id}`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          cpfCnpj: document,
          email: input.email || undefined,
          mobilePhone: input.phone?.replace(/\D/g, '') || undefined,
        }),
      });
    }
    return existing.id;
  }

  const created = await request<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: document,
      email: input.email || undefined,
      mobilePhone: input.phone?.replace(/\D/g, '') || undefined,
      externalReference: input.tenantId,
      notificationDisabled: false,
    }),
  });
  return created.id;
}

// ─── Assinaturas ─────────────────────────────────────────────────────────────

export interface AsaasSubscription {
  id: string;
  status: string;
  nextDueDate: string;
  value: number;
}

/**
 * `UNDEFINED` lets the clinic pick PIX, boleto or card on the Asaas invoice
 * page. Pinning a single method would be guessing wrong for most of them —
 * clinics overwhelmingly reach for PIX or boleto, but not the same one.
 */
export async function createSubscription(input: {
  customerId: string;
  tenantId: string;
  priceCents: number;
  planName: string;
  /** First due date. Defaults to today so a trial ending today bills today. */
  firstDueDate?: Date;
}): Promise<AsaasSubscription> {
  const due = input.firstDueDate ?? new Date();
  return request<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: 'UNDEFINED',
      value: input.priceCents / 100,
      nextDueDate: due.toISOString().slice(0, 10),
      cycle: 'MONTHLY',
      description: `ClinicaIQ — plano ${input.planName}`,
      externalReference: input.tenantId,
    }),
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await request(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
}

export async function updateSubscriptionValue(
  subscriptionId: string,
  priceCents: number,
  planName: string,
): Promise<void> {
  await request(`/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      value: priceCents / 100,
      description: `ClinicaIQ — plano ${planName}`,
      // Keeps the already-issued invoice in step with the new plan instead of
      // leaving the clinic with a charge for what it no longer has.
      updatePendingPayments: true,
    }),
  });
}

// ─── Cobranças ───────────────────────────────────────────────────────────────

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  paymentDate?: string;
}

export async function listPayments(subscriptionId: string): Promise<AsaasPayment[]> {
  const res = await request<{ data: AsaasPayment[] }>(
    `/subscriptions/${subscriptionId}/payments?limit=24`,
  );
  return res.data ?? [];
}

export async function getPayment(paymentId: string): Promise<AsaasPayment> {
  return request<AsaasPayment>(`/payments/${paymentId}`);
}

/** The copy-and-paste PIX code, so the clinic pays without leaving the system. */
export async function getPixCode(paymentId: string): Promise<string | null> {
  try {
    const res = await request<{ payload?: string }>(`/payments/${paymentId}/pixQrCode`);
    return res.payload ?? null;
  } catch {
    // Not every charge has a PIX code (card, or still being issued). Absence is
    // normal here and must not break the billing screen.
    return null;
  }
}

/** Maps Asaas payment status onto our ChargeStatus. */
export function toChargeStatus(status: string): 'PENDING' | 'PAID' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED' {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'PAID';
    case 'OVERDUE':
      return 'OVERDUE';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
      return 'REFUNDED';
    case 'DELETED':
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}
