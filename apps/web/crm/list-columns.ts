/**
 * As colunas da lista de leads, como no Kommo: cada pessoa escolhe quais ver
 * (cookie `crm-colunas`). "Negócio" está sempre lá. Campos personalizados
 * entram como `campo:<id>`. Puro, testado em `list-columns.test.ts`.
 */

export const COLUMNS_COOKIE = 'crm-colunas';

export const BASE_COLUMNS = [
  { key: 'etapa', label: 'Etapa' },
  { key: 'funil', label: 'Funil' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'valor', label: 'Valor' },
  { key: 'proxima', label: 'Próxima ação' },
  { key: 'origem', label: 'Origem' },
  { key: 'tags', label: 'Tags' },
  { key: 'criado', label: 'Criado em' },
] as const;

export type BaseColumn = (typeof BASE_COLUMNS)[number]['key'];

export const DEFAULT_COLUMNS: string[] = ['etapa', 'responsavel', 'valor', 'proxima', 'origem', 'tags', 'criado'];

export const fieldColumn = (fieldId: string) => `campo:${fieldId}`;

/** O cookie, aceitando só colunas que existem; vazio ou estragado = o padrão. */
export function parseColumns(raw: string | undefined | null, fieldIds: readonly string[]): string[] {
  if (!raw) return DEFAULT_COLUMNS;
  const validas = new Set<string>([...BASE_COLUMNS.map((c) => c.key), ...fieldIds.map(fieldColumn)]);
  let texto = raw;
  try {
    texto = decodeURIComponent(raw);
  } catch {
    return DEFAULT_COLUMNS;
  }
  const lista = texto
    .split(',')
    .map((c) => c.trim())
    .filter((c, i, a) => validas.has(c) && a.indexOf(c) === i);
  return lista.length ? lista.slice(0, 30) : DEFAULT_COLUMNS;
}

export const serializeColumns = (cols: readonly string[]) => encodeURIComponent(cols.join(','));
