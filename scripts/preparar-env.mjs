#!/usr/bin/env node
/**
 * Cria o arquivo .env a partir do .env.example (se ainda não existir),
 * gerando um AUTH_SECRET aleatório. Usado pelo instalar.bat, mas funciona
 * em qualquer sistema:  node scripts/preparar-env.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = path.join(root, '.env');
if (fs.existsSync(env)) {
  console.log('[OK] Arquivo .env já existe (mantido sem alterações).');
  process.exit(0);
}
const secret = crypto.randomBytes(48).toString('base64url');
const content = fs
  .readFileSync(path.join(root, '.env.example'), 'utf8')
  .replace(/AUTH_SECRET=".*"/, `AUTH_SECRET="${secret}"`);
fs.writeFileSync(env, content);
console.log('[OK] Arquivo .env criado com um segredo de sessão aleatório.');
