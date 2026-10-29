import 'server-only';
import { prisma, decrypt, encrypt, currentKeyVersion } from '@clinicaiq/db';
import { cpfHashes } from './cpf-hash';
import { conversationHashes, phoneHashes } from '@/crm/phone';

/**
 * Recifrar com a chave nova durante uma troca da chave mestra (achado F-16;
 * passo a passo em docs/producao/rotacao-chave.md).
 *
 * Parada enquanto a chave atual é a 1: não lê nem grava nada. Com a 2 em
 * diante, cada rodada do relógio do CRM pega um lote de cada tabela com texto
 * de chave anterior, abre com a chave antiga, fecha com a atual e refaz o
 * índice cego da linha. Grava só se a linha não mudou no meio (compara o texto
 * antigo), sem mexer no `updatedAt`.
 */

type Opened = Record<string, string | null>;

interface Table {
  table: string;
  /** Colunas com texto cifrado (nomes no banco). */
  columns: string[];
  /**
   * O índice cego da linha. `candidates` dá, para cada forma possível do valor
   * original, os códigos em todas as chaves (o da atual primeiro). O código
   * gravado é trocado pelo da chave atual da forma que bater; se nenhuma bater,
   * fica como está.
   */
  hash?: { column: string; candidates: (opened: Opened, row: { id: string; tenantId: string }) => string[][] };
}

const TABLES: Table[] = [
  {
    table: 'patients',
    columns: ['cpf', 'phone', 'phone2'],
    hash: { column: 'cpfHash', candidates: (o, r) => (o.cpf ? [cpfHashes(o.cpf, r.tenantId)] : []) },
  },
  {
    table: 'leads',
    columns: ['phone'],
    // Lead anonimizado guarda o código de `apagado-<id>` (crm/anonymize.ts).
    hash: {
      column: 'phoneHash',
      candidates: (o, r) => [
        ...(o.phone ? [phoneHashes(o.phone, r.tenantId)] : []),
        phoneHashes(`apagado-${r.id}`, r.tenantId),
      ],
    },
  },
  {
    table: 'conversations',
    columns: ['phone', 'lastPreview'],
    hash: { column: 'phoneHash', candidates: (o, r) => (o.phone ? [conversationHashes(o.phone, r.tenantId)] : []) },
  },
  { table: 'chat_messages', columns: ['text'] },
  { table: 'whatsapp_cloud_accounts', columns: ['accessToken'] },
  { table: 'whatsapp_auth_keys', columns: ['value'] },
];

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const q = (name: string) => `"${name}"`;

export interface RotationResult {
  reencrypted: number;
  /** Linhas que não abriram com nenhuma chave configurada. Ficam como estão. */
  unreadable: number;
}

/**
 * Uma rodada. `tenantId` limita a uma clínica (os testes usam, para não mexer
 * no resto do banco de desenvolvimento).
 */
export async function reencryptWithCurrentKey(
  { limit = 300, tenantId }: { limit?: number; tenantId?: string } = {},
): Promise<RotationResult> {
  const version = currentKeyVersion();
  const result: RotationResult = { reencrypted: 0, unreadable: 0 };
  if (version === 1) return result;

  const current = `k${version}.%`;
  for (const spec of TABLES) {
    const stale = spec.columns.map((c) => `(${q(c)} IS NOT NULL AND ${q(c)} NOT LIKE $1)`).join(' OR ');
    const cols = [...spec.columns, ...(spec.hash ? [spec.hash.column] : [])].map(q).join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; tenantId: string } & Opened>>(
      `SELECT "id", "tenantId", ${cols} FROM ${q(spec.table)}
       WHERE (${stale})${tenantId ? ` AND "tenantId" = $3` : ''}
       ORDER BY "id" LIMIT $2`,
      current,
      limit,
      ...(tenantId ? [tenantId] : []),
    );

    for (const row of rows) {
      const opened: Opened = {};
      const sealed: Opened = {};
      try {
        for (const c of spec.columns) {
          const value = row[c];
          opened[c] = value == null ? null : decrypt(value, masterKey(), row.tenantId);
          sealed[c] = opened[c] == null ? null : encrypt(opened[c]!, masterKey(), row.tenantId);
        }
      } catch {
        result.unreadable++;
        continue;
      }

      const sets = spec.columns.map((c, i) => `${q(c)} = $${i + 1}`);
      const values: unknown[] = spec.columns.map((c) => sealed[c]);
      if (spec.hash) {
        const stored = row[spec.hash.column];
        const match = spec.hash.candidates(opened, row).find((hashes) => stored != null && hashes.includes(stored));
        if (match && match[0] !== stored) {
          values.push(match[0]);
          sets.push(`${q(spec.hash.column)} = $${values.length}`);
        }
      }
      // Só grava se ninguém mudou a linha desde a leitura.
      const guards = spec.columns.map((c) => {
        values.push(row[c]);
        return `${q(c)} IS NOT DISTINCT FROM $${values.length}`;
      });
      values.push(row.id);
      result.reencrypted += await prisma.$executeRawUnsafe(
        `UPDATE ${q(spec.table)} SET ${sets.join(', ')} WHERE "id" = $${values.length} AND ${guards.join(' AND ')}`,
        ...values,
      );
    }
  }
  return result;
}
