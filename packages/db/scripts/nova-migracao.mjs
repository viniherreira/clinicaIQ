#!/usr/bin/env node
/**
 * Registra no histórico (prisma/migrations) a mudança feita no schema.prisma.
 *
 *   pnpm --filter @clinicaiq/db historico:nova nome-curto
 *
 * Compara o schema.prisma da main (origin/main) com o atual e grava o SQL em
 * prisma/migrations/<data>_<nome>/migration.sql. Não abre conexão com banco
 * nenhum: é esse arquivo que o dono roda no SQL Editor do Supabase antes do
 * merge (docs/producao continua valendo para dados e para o que o Prisma não
 * escreve, como RLS e pg_cron).
 *
 * Tabela nova: acrescente à mão `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const nome = (process.argv[2] ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!nome) {
  console.error('Diga o nome: pnpm --filter @clinicaiq/db historico:nova nome-curto');
  process.exit(1);
}

const raiz = resolve(import.meta.dirname, '..');
const schema = join(raiz, 'prisma', 'schema.prisma');
const anterior = join(mkdtempSync(join(tmpdir(), 'schema-')), 'schema.prisma');
writeFileSync(anterior, execFileSync('git', ['show', 'origin/main:packages/db/prisma/schema.prisma'], { cwd: raiz }));

// O prisma do próprio pacote, chamado pelo node (sem shell).
const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
const sql = execFileSync(
  process.execPath,
  [prisma, 'migrate', 'diff', '--from-schema-datamodel', anterior, '--to-schema-datamodel', schema, '--script'],
  { cwd: raiz, encoding: 'utf8' },
);
if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log('Nada mudou no schema.prisma em relação à main.');
  process.exit(0);
}

const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const pasta = join(raiz, 'prisma', 'migrations', `${hoje}_${nome}`);
if (existsSync(pasta)) {
  console.error(`Já existe: ${pasta}`);
  process.exit(1);
}
mkdirSync(pasta, { recursive: true });
writeFileSync(join(pasta, 'migration.sql'), sql);
console.log(`Gravado: prisma/migrations/${hoje}_${nome}/migration.sql`);
if (/CREATE TABLE/.test(sql)) console.log('Tabela nova: acrescente ALTER TABLE ... ENABLE ROW LEVEL SECURITY;');
