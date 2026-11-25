/**
 * Envio de mensagens por WhatsApp.
 *
 * O site NÃO fala com o WhatsApp diretamente: ele pede ao "serviço de
 * WhatsApp" (pasta servico-whatsapp/, que usa whatsapp-web.js) pelo endereço
 * WHATSAPP_URL, autenticando com WHATSAPP_TOKEN.
 *
 * - WHATSAPP_URL vazio, em desenvolvimento: a mensagem é salva como .txt na
 *   pasta ".whatsapp-enviados/" para conferência.
 * - Serviço fora do ar ou número sem WhatsApp: devolve 'failed' e o sistema
 *   tenta o e-mail (veja src/server/notifications.ts).
 *
 * Nunca lança erro: quem chama decide o que fazer com o resultado.
 */
import fs from 'node:fs';
import path from 'node:path';

export type WhatsAppResult = 'sent' | 'saved' | 'skipped' | 'failed' | 'no_whatsapp' | 'invalid_number';

export interface WhatsAppStatus {
  configured: boolean;
  reachable: boolean;
  estado: 'iniciando' | 'qr' | 'autenticando' | 'conectado' | 'desconectado' | 'falha_autenticacao' | 'erro' | 'indisponivel' | 'nao_configurado';
  qr: string | null;
  numero: string | null;
  nome: string | null;
  erro: string | null;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_URL && process.env.WHATSAPP_TOKEN);
}

/**
 * Normaliza telefone brasileiro para o formato internacional só com dígitos
 * (ex.: "(11) 91234-5678" → "5511912345678"). Devolve null se inválido.
 */
export function normalizePhoneBR(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`; // DDD + número
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

/** "5511912345678" → "(11) 91234-5678" (para exibir). */
export function formatPhoneBR(digits: string): string {
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const num = local.slice(2);
  return num.length === 9 ? `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}` : `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}

async function callService(pathname: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const base = process.env.WHATSAPP_URL!.replace(/\/$/, '');
  return fetch(`${base}${pathname}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    cache: 'no-store',
  });
}

function saveToFile(phone: string, text: string): string {
  const dir = path.join(process.cwd(), '.whatsapp-enviados');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${phone}.txt`);
  fs.writeFileSync(file, `Para: +${phone}\n\n${text}\n`, 'utf8');
  return file;
}

/** Envia (ou salva, em desenvolvimento) uma mensagem de texto. */
export async function sendWhatsApp(phone: string | null | undefined, text: string): Promise<WhatsAppResult> {
  const to = normalizePhoneBR(phone);
  if (!to) return 'invalid_number';
  if (!isWhatsAppConfigured()) {
    if (process.env.NODE_ENV === 'test') return 'skipped';
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[whatsapp] Serviço não configurado. Mensagem salva em: ${saveToFile(to, text)}`);
      return 'saved';
    }
    return 'skipped';
  }
  try {
    const res = await callService('/enviar', { method: 'POST', body: { para: to, mensagem: text }, timeoutMs: 30_000 });
    if (res.ok) return 'sent';
    const body = (await res.json().catch(() => ({}))) as { codigo?: string; erro?: string };
    if (body.codigo === 'SEM_WHATSAPP') return 'no_whatsapp';
    console.error(`[whatsapp] Falha ao enviar (${res.status}): ${body.erro ?? 'erro desconhecido'}`);
    return 'failed';
  } catch (err) {
    console.error('[whatsapp] Serviço de WhatsApp indisponível:', (err as Error).message);
    return 'failed';
  }
}

/** Situação da conexão (para a tela de Configurações, inclui o QR Code). */
export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const empty = { qr: null, numero: null, nome: null, erro: null };
  if (!isWhatsAppConfigured()) return { configured: false, reachable: false, estado: 'nao_configurado', ...empty };
  try {
    const res = await callService('/status', { timeoutMs: 5000 });
    if (!res.ok) return { configured: true, reachable: false, estado: 'indisponivel', ...empty, erro: `Resposta ${res.status} do serviço (confira o WHATSAPP_TOKEN).` };
    const s = (await res.json()) as Omit<WhatsAppStatus, 'configured' | 'reachable'>;
    return { configured: true, reachable: true, ...empty, ...s };
  } catch {
    return {
      configured: true, reachable: false, estado: 'indisponivel', ...empty,
      erro: 'O serviço de WhatsApp não está rodando. Inicie-o (npm run whatsapp ou iniciar.bat).',
    };
  }
}

/** Desconecta o número atual (o serviço gera um QR Code novo). */
export async function logoutWhatsApp(): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  try {
    return (await callService('/sair', { method: 'POST', timeoutMs: 15_000 })).ok;
  } catch {
    return false;
  }
}
