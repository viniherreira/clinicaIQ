import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Toda tabela criada pelos SQL de produção liga o RLS.
 *
 * No Supabase, tabela do schema `public` sem RLS fica aberta à API REST para
 * quem tiver a chave anon/publishable — sem passar pelo `getTenantClient`, que
 * é onde mora o isolamento entre clínicas. O padrão do projeto é RLS ligado e
 * nenhuma política: só o `postgres` (Prisma) e o `service_role` leem.
 *
 * O `tooth_findings` (odontograma, dado de saúde) nasceu sem isso. Este teste
 * olha os arquivos de `docs/producao/`, então pega o esquecimento antes de o
 * SQL chegar ao banco.
 */

const PASTA = resolve(__dirname, '..', '..', '..', 'docs', 'producao');

const sqls = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(resolve(PASTA, f), 'utf8'))
  // Comentários não contam: "-- CREATE TABLE" num texto explicativo não é tabela.
  .map((t) => t.replace(/--.*$/gm, ''))
  .join('\n');

const nomes = (re: RegExp) => new Set([...sqls.matchAll(re)].map((m) => m[1]));

describe('SQL de produção', () => {
  it('liga o RLS em toda tabela que cria', () => {
    const criadas = nomes(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi);
    const comRls = nomes(/ALTER\s+TABLE\s+"?(\w+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
    expect(criadas.size).toBeGreaterThan(0);
    expect([...criadas].filter((t) => !comRls.has(t))).toEqual([]);
  });
});
