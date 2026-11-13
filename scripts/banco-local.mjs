#!/usr/bin/env node
/**
 * Banco de dados PostgreSQL local SEM Docker.
 *
 * Usa os binários oficiais do PostgreSQL distribuídos pelo pacote npm
 * "embedded-postgres" (instalado com `npm install`). Os dados ficam na pasta
 * ".banco-local/" do projeto e continuam salvos depois de desligar o computador.
 *
 * Uso:
 *   node scripts/banco-local.mjs start   -> inicia (e cria, na 1ª vez) o banco em segundo plano
 *   node scripts/banco-local.mjs stop    -> encerra o banco
 *   node scripts/banco-local.mjs status  -> informa se está em execução
 *
 * Porta, usuário e senha vêm da variável DATABASE_URL do arquivo .env (os
 * mesmos do Docker Compose). Os bancos "reservas" e "reservas_teste" são
 * criados automaticamente pelo Prisma ao executar as migrações.
 *
 * Variável opcional PG_BIN_DIR: pasta alternativa com initdb/pg_ctl
 * (útil se você já tiver o PostgreSQL instalado no Windows).
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.banco-local', 'dados');
const logFile = path.join(root, '.banco-local', 'postgres.log');

function loadEnv() {
  const env = {};
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) {
    console.error('[banco] Arquivo .env não encontrado. Copie .env.example para .env (ou execute instalar.bat).');
    process.exit(1);
  }
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { ...env, ...process.env };
}

function parseUrl(url) {
  const u = new URL(url);
  return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), port: Number(u.port || 5432) };
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function binDir(env) {
  if (env.PG_BIN_DIR) return env.PG_BIN_DIR;
  const map = { win32: 'windows', darwin: 'darwin', linux: 'linux' };
  const pkg = `@embedded-postgres/${map[os.platform()]}-${os.arch()}`;
  try {
    const mod = await import(pkg);
    return path.dirname(mod.pg_ctl);
  } catch {
    console.error(`[banco] Binários do PostgreSQL não encontrados (${pkg}). Execute "npm install" novamente.`);
    process.exit(1);
  }
}

const exe = (dir, name) => path.join(dir, os.platform() === 'win32' ? `${name}.exe` : name);

async function start() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL não definida no .env');
  const cfg = parseUrl(env.DATABASE_URL);

  if (await isPortOpen(cfg.port)) {
    console.log(`[banco] O banco já está em execução na porta ${cfg.port}.`);
    return;
  }

  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    throw new Error('O PostgreSQL não pode ser executado como root. Rode os scripts com o seu usuário normal (sem sudo), ou use o Docker.');
  }

  const bin = await binDir(env);
  if (os.platform() === 'win32' && bin.length > 180) {
    console.warn(`[banco] ATENÇÃO: o caminho da pasta do projeto é muito longo (${bin.length} caracteres).`);
    console.warn('[banco] O Windows limita caminhos a 260 caracteres e o PostgreSQL pode falhar.');
    console.warn('[banco] Mova o projeto para uma pasta curta, por exemplo C:\\Projetos\\reservas-salas.');
  }

  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('[banco] Criando o banco de dados local pela primeira vez (.banco-local/)...');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    const pwFile = path.join(os.tmpdir(), `reservas-pw-${process.pid}.txt`);
    fs.writeFileSync(pwFile, cfg.password);
    try {
      execFileSync(
        exe(bin, 'initdb'),
        ['-D', dataDir, '-U', cfg.user, `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C'],
        { stdio: ['ignore', 'ignore', 'inherit'] },
      );
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
  }

  // stdio 'ignore': o PostgreSQL continua rodando em segundo plano e não pode
  // herdar a saída deste processo (senão quem chamou ficaria esperando).
  // As mensagens do servidor vão para .banco-local/postgres.log.
  try {
    execFileSync(
      exe(bin, 'pg_ctl'),
      ['start', '-D', dataDir, '-l', logFile, '-w', '-t', '60', '-o', `-p ${cfg.port} -c listen_addresses=localhost -c timezone=UTC`],
      { stdio: 'ignore', windowsHide: true },
    );
  } catch {
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-15).join('\n') : '';
    throw new Error(`O PostgreSQL não iniciou. Últimas linhas do log (.banco-local/postgres.log):\n${tail}`);
  }
  console.log(`[banco] PostgreSQL local em execução na porta ${cfg.port} (log: .banco-local/postgres.log).`);
}

async function stop() {
  const env = loadEnv();
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('[banco] Nenhum banco local criado ainda.');
    return;
  }
  try {
    execFileSync(exe(await binDir(env), 'pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w'], { stdio: 'ignore' });
    console.log('[banco] Banco local encerrado.');
  } catch {
    console.log('[banco] O banco local não estava em execução.');
  }
}

async function status() {
  const cfg = parseUrl(loadEnv().DATABASE_URL);
  const open = await isPortOpen(cfg.port);
  console.log(open ? `[banco] Em execução na porta ${cfg.port}.` : `[banco] Parado (porta ${cfg.port}).`);
  process.exitCode = open ? 0 : 1;
}

const actions = { start, stop, status };
const cmd = process.argv[2];
if (!actions[cmd]) {
  console.log('Uso: node scripts/banco-local.mjs <start|stop|status>');
  process.exit(1);
}
actions[cmd]().catch((err) => {
  console.error('[banco] Erro:', err?.message ?? err);
  process.exit(1);
});
