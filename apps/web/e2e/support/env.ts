import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * O app lê `.env.local` sozinho (é o Next). O processo do Playwright não lê
 * nada — e é ele que semeia o banco e fala com o Clerk. Carrega os mesmos
 * arquivos, mais o `.env.test`, que guarda só o que é do teste.
 *
 * `loadEnvFile` não sobrescreve o que já está no ambiente, então uma variável
 * exportada no terminal (ou no CI) vence o arquivo.
 */
export function loadTestEnv() {
  const root = resolve(__dirname, '..', '..');
  for (const file of ['.env.test', '.env.local']) {
    const path = resolve(root, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta a variável ${name}. Veja apps/web/.env.test.example e o passo a passo em e2e/README.md.`,
    );
  }
  return value;
}
