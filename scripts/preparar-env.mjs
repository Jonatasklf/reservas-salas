#!/usr/bin/env node
/**
 * Prepara o arquivo .env:
 *  - se não existir, cria a partir do .env.example com segredos aleatórios;
 *  - se já existir, só ACRESCENTA variáveis novas que faltarem (versões
 *    novas do sistema), sem alterar nada do que você configurou.
 *
 * Usado pelo instalar.bat / instalar.sh. Funciona em qualquer sistema:
 *   node scripts/preparar-env.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const segredo = (bytes) => crypto.randomBytes(bytes).toString('base64url');

/** Variáveis que geram valor aleatório próprio (nunca o valor de exemplo). */
const gerados = {
  AUTH_SECRET: () => segredo(48),
  WHATSAPP_TOKEN: () => segredo(32),
};

const exemplo = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

if (!fs.existsSync(envPath)) {
  let content = exemplo;
  for (const [nome, gerar] of Object.entries(gerados)) {
    content = content.replace(new RegExp(`^${nome}=".*"`, 'm'), `${nome}="${gerar()}"`);
  }
  fs.writeFileSync(envPath, content);
  console.log('[OK] Arquivo .env criado com segredos aleatórios.');
  process.exit(0);
}

// .env já existe: acrescenta apenas as variáveis que ainda não estão nele.
const atual = fs.readFileSync(envPath, 'utf8');
const existentes = new Set([...atual.matchAll(/^\s*([A-Z0-9_]+)\s*=/gm)].map((m) => m[1]));
const novas = [];
for (const linha of exemplo.split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || existentes.has(m[1])) continue;
  novas.push(gerados[m[1]] ? `${m[1]}="${gerados[m[1]]()}"` : linha);
}
if (novas.length) {
  const sep = atual.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(envPath, `${atual}${sep}\n# --- Acrescentado pela atualização do sistema ---\n${novas.join('\n')}\n`);
  console.log(`[OK] .env mantido; variáveis novas acrescentadas: ${novas.map((l) => l.split('=')[0]).join(', ')}.`);
} else {
  console.log('[OK] Arquivo .env já existe e está completo (mantido sem alterações).');
}
