export const QUOTE_STATUS: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  DRAFT: { label: 'Rascunho', bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
  SENT: { label: 'Enviado', bg: 'bg-sky-50 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  VIEWED: { label: 'Visualizado', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  ACCEPTED: { label: 'Aceito', bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  REJECTED: { label: 'Recusado', bg: 'bg-red-50 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  EXPIRED: { label: 'Expirado', bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
};

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Formats a BRL-masked string from raw digits (cents-based). */
export function maskBRLInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = Number(digits) / 100;
  return cents.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function brlToNumber(masked: string): number {
  const digits = masked.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
}

export function quoteCode(n: number): string {
  return `ORC-${String(n).padStart(4, '0')}`;
}
