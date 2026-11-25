#!/usr/bin/env node
/**
 * SERVIÇO DE WHATSAPP (whatsapp-web.js)
 * =============================================================================
 * Programa separado do site. Mantém uma sessão do WhatsApp Web aberta (num
 * Chrome invisível) e envia as mensagens que o sistema de reservas pedir.
 *
 * - Na primeira vez, mostra um QR Code (no terminal e em Configurações do
 *   sistema). Escaneie com o celular do número que vai enviar as mensagens:
 *   WhatsApp → Aparelhos conectados → Conectar um aparelho.
 * - A sessão fica salva na pasta ".sessao" e sobrevive a reinicializações.
 * - Só aceita pedidos com o token WHATSAPP_TOKEN (o mesmo do .env do site).
 * - Envia uma mensagem por vez, com intervalo, para reduzir o risco de bloqueio.
 *
 * ATENÇÃO: whatsapp-web.js NÃO é uma API oficial do WhatsApp. Use um número
 * dedicado ao sistema. Veja HOSPEDAGEM.md, seção 10.
 *
 * Endpoints (todos exigem "Authorization: Bearer <WHATSAPP_TOKEN>"):
 *   GET  /status   → { estado, qr, numero, nome, erro }
 *   POST /enviar   → { para, mensagem }  →  { ok, id }
 *   POST /sair     → desconecta o número (gera um QR novo)
 * =============================================================================
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import wweb from 'whatsapp-web.js';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

const { Client, LocalAuth } = wweb;
const dir = path.dirname(fileURLToPath(import.meta.url));

// Lê o .env do projeto (execução local). No Docker as variáveis vêm do ambiente.
const envFile = path.resolve(dir, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TOKEN = process.env.WHATSAPP_TOKEN ?? '';
const PORTA = Number(process.env.WHATSAPP_PORTA ?? new URL(process.env.WHATSAPP_URL || 'http://127.0.0.1:3200').port ?? 3200);
const HOST = process.env.WHATSAPP_HOST ?? '127.0.0.1';
const INTERVALO_MIN = Number(process.env.WHATSAPP_INTERVALO_MS ?? 2000);

if (TOKEN.length < 24 || /gere-um-token|troque/.test(TOKEN)) {
  console.error('[whatsapp] WHATSAPP_TOKEN ausente, curto ou ainda com o valor de exemplo.');
  console.error('[whatsapp] Execute o instalador (ele gera o token no .env) ou: node scripts/preparar-env.mjs');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Estado da conexão
// ---------------------------------------------------------------------------
const estado = { estado: 'iniciando', qr: null, numero: null, nome: null, erro: null };
/** Tempo máximo para o WhatsApp Web carregar (a 1ª carga é pesada). */
const TEMPO_LIMITE = Number(process.env.WHATSAPP_TEMPO_LIMITE_MS ?? 120_000);

const SESSAO_DIR = process.env.WHATSAPP_SESSAO_DIR || path.join(dir, '.sessao');

// O Chrome grava a sessão do WhatsApp Web em pastas bem profundas. No Windows,
// caminhos acima de 260 caracteres falham e o WhatsApp Web trava antes do QR Code.
if (process.platform === 'win32' && SESSAO_DIR.length > 100) {
  console.warn(`[whatsapp] ATENÇÃO: a pasta da sessão tem um caminho muito longo (${SESSAO_DIR.length} caracteres).`);
  console.warn('[whatsapp] O Windows limita caminhos a 260 caracteres e o WhatsApp Web pode não carregar.');
  console.warn('[whatsapp] Mova o projeto para uma pasta curta (ex.: C:\\Projetos\\reservas-salas) ou defina no .env:');
  console.warn('[whatsapp]   WHATSAPP_SESSAO_DIR="C:\\whatsapp-reservas"');
}

let client = null;
let iniciando = false;

/** Cria um cliente novo (cada tentativa usa um Chrome novo). */
function criarCliente() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSAO_DIR }),
    authTimeoutMs: TEMPO_LIMITE,
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      protocolTimeout: TEMPO_LIMITE,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  });
  registrarEventos(c);
  return c;
}

function registrarEventos(client) {
client.on('qr', async (qr) => {
  estado.estado = 'qr';
  estado.qr = await QRCode.toDataURL(qr, { margin: 1, width: 300 });
  console.log('\n[whatsapp] Escaneie o QR Code abaixo com o celular do número que vai enviar as mensagens');
  console.log('[whatsapp] (WhatsApp → Aparelhos conectados → Conectar um aparelho). Ele também aparece em Configurações no sistema.\n');
  qrcodeTerminal.generate(qr, { small: true });
});
client.on('authenticated', () => {
  estado.estado = 'autenticando';
  estado.qr = null;
  console.log('[whatsapp] Autenticado. Carregando conversas...');
});
client.on('ready', () => {
  estado.estado = 'conectado';
  estado.qr = null;
  estado.erro = null;
  estado.numero = client.info?.wid?.user ?? null;
  estado.nome = client.info?.pushname ?? null;
  console.log(`[whatsapp] Conectado como +${estado.numero} (${estado.nome ?? 'sem nome'}). Pronto para enviar.`);
});
client.on('auth_failure', (msg) => {
  estado.estado = 'falha_autenticacao';
  estado.erro = String(msg);
  console.error('[whatsapp] Falha de autenticação:', msg, '— apague a pasta .sessao e conecte de novo.');
});
client.on('disconnected', (reason) => {
  estado.estado = 'desconectado';
  estado.numero = null;
  estado.erro = String(reason);
  console.warn('[whatsapp] Desconectado:', reason, '— tentando reconectar em 10 s...');
  setTimeout(() => iniciar(), 10_000);
});
}

/** Fecha o Chrome atual (se houver) e conecta de novo com um cliente novo. */
async function iniciar() {
  if (iniciando) return;
  iniciando = true;
  try {
    if (client) await client.destroy().catch(() => {});
    client = criarCliente();
    estado.estado = 'iniciando';
    estado.erro = null;
    await client.initialize();
  } catch (err) {
    estado.estado = 'erro';
    estado.erro = err?.message ?? String(err);
    console.error('[whatsapp] Não foi possível iniciar:', estado.erro, '— nova tentativa em 30 s.');
    setTimeout(() => iniciar(), 30_000);
  } finally {
    iniciando = false;
  }
}

// ---------------------------------------------------------------------------
// Fila de envio (uma mensagem por vez, com intervalo)
// ---------------------------------------------------------------------------
let fila = Promise.resolve();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function enfileirar(tarefa) {
  const resultado = fila.then(tarefa);
  fila = resultado.catch(() => {}).then(() => espera(INTERVALO_MIN + Math.floor(Math.random() * 1500)));
  return resultado;
}

class ErroEnvio extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

async function enviar(para, mensagem) {
  if (estado.estado !== 'conectado') {
    throw new ErroEnvio(503, 'NAO_CONECTADO', 'O WhatsApp do sistema não está conectado. Conecte-o em Configurações.');
  }
  const digitos = String(para).replace(/\D/g, '');
  if (digitos.length < 12 || digitos.length > 13) throw new ErroEnvio(400, 'NUMERO_INVALIDO', 'Número inválido.');
  // getNumberId resolve o número real no WhatsApp (inclusive a questão do 9º dígito).
  const id = await client.getNumberId(digitos);
  if (!id) throw new ErroEnvio(404, 'SEM_WHATSAPP', 'Este número não tem WhatsApp.');
  const msg = await client.sendMessage(id._serialized, mensagem);
  return { ok: true, id: msg?.id?._serialized ?? null };
}

// ---------------------------------------------------------------------------
// Servidor HTTP interno
// ---------------------------------------------------------------------------
function autorizado(req) {
  const recebido = Buffer.from(String(req.headers.authorization ?? ''));
  const esperado = Buffer.from(`Bearer ${TOKEN}`);
  return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

function responder(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (parte) => {
      dados += parte;
      if (dados.length > 16 * 1024) {
        reject(new ErroEnvio(413, 'GRANDE_DEMAIS', 'Mensagem grande demais.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(dados ? JSON.parse(dados) : {});
      } catch {
        reject(new ErroEnvio(400, 'JSON_INVALIDO', 'Corpo inválido.'));
      }
    });
    req.on('error', reject);
  });
}

const servidor = http.createServer(async (req, res) => {
  if (!autorizado(req)) return responder(res, 401, { erro: 'Não autorizado.' });
  try {
    if (req.method === 'GET' && req.url === '/status') return responder(res, 200, estado);
    if (req.method === 'POST' && req.url === '/enviar') {
      const { para, mensagem } = await lerCorpo(req);
      if (!para || !mensagem || typeof mensagem !== 'string') throw new ErroEnvio(400, 'DADOS_INVALIDOS', 'Informe "para" e "mensagem".');
      return responder(res, 200, await enfileirar(() => enviar(para, mensagem)));
    }
    if (req.method === 'POST' && req.url === '/sair') {
      await client?.logout().catch(() => {});
      estado.estado = 'desconectado';
      estado.numero = null;
      setTimeout(() => iniciar(), 2000);
      return responder(res, 200, { ok: true });
    }
    return responder(res, 404, { erro: 'Rota não encontrada.' });
  } catch (err) {
    const status = err instanceof ErroEnvio ? err.status : 500;
    if (status === 500) console.error('[whatsapp] Erro ao enviar:', err?.message ?? err);
    return responder(res, status, { erro: err?.message ?? 'Erro inesperado.', codigo: err?.codigo ?? 'ERRO' });
  }
});

servidor.listen(PORTA, HOST, () => {
  console.log(`[whatsapp] Serviço em http://${HOST}:${PORTA} — iniciando o WhatsApp Web (pode levar alguns segundos)...`);
  void iniciar();
});

async function encerrar() {
  console.log('\n[whatsapp] Encerrando...');
  servidor.close();
  await client?.destroy().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
