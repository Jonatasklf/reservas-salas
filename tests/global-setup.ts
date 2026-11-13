/**
 * Prepara o banco de testes uma vez: aplica as migrações (o Prisma cria o
 * banco "reservas_teste" se ele não existir).
 */
import { execSync } from 'node:child_process';
import { loadEnv } from './load-env';

export default function setup() {
  loadEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env para executar os testes.');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
