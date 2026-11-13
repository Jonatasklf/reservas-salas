/**
 * Envio de e-mails.
 *
 * - Com SMTP configurado no .env (SMTP_HOST etc.): envia de verdade.
 * - Sem SMTP, em desenvolvimento: salva cada mensagem como arquivo .eml na
 *   pasta ".emails-enviados/" (abre no Outlook/Thunderbird ou no navegador),
 *   para testar o conteúdo sem precisar de um servidor de e-mail.
 * - Sem SMTP, em produção: apenas registra no log. O sistema continua
 *   funcionando normalmente.
 *
 * Falhas de envio NUNCA interrompem a operação principal.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailResult = 'sent' | 'saved' | 'skipped' | 'failed';

let transporter: Transporter | null | undefined;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

async function getTransporter(): Promise<Transporter | null> {
  if (transporter !== undefined) return transporter;
  if (!isEmailConfigured()) return (transporter = null);
  const nodemailer = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

const fromAddress = () => process.env.SMTP_FROM || 'Reservas de Salas <nao-responda@exemplo.local>';

/** Salva a mensagem como .eml (somente em desenvolvimento, sem SMTP). */
async function saveToFile(msg: EmailMessage): Promise<string> {
  const nodemailer = await import('nodemailer');
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  const info = await t.sendMail({ from: fromAddress(), ...msg });
  const dir = path.join(process.cwd(), '.emails-enviados');
  fs.mkdirSync(dir, { recursive: true });
  const safe = msg.subject.replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 60);
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safe}.eml`);
  fs.writeFileSync(file, info.message as Buffer);
  return file;
}

/**
 * Envia (ou salva) o e-mail. Nunca lança erro: devolve o resultado para
 * quem chamou decidir o que informar ao usuário.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  try {
    const t = await getTransporter();
    if (t) {
      await t.sendMail({ from: fromAddress(), ...msg });
      return 'sent';
    }
    if (process.env.NODE_ENV === 'test') return 'skipped';
    if (process.env.NODE_ENV !== 'production') {
      const file = await saveToFile(msg);
      console.info(`[e-mail] SMTP não configurado. Mensagem salva em: ${file}`);
      return 'saved';
    }
    console.info(`[e-mail] SMTP não configurado; mensagem não enviada (assunto: ${msg.subject}).`);
    return 'skipped';
  } catch (err) {
    console.error('[e-mail] Falha ao enviar:', (err as Error).message);
    return 'failed';
  }
}

/** Para o botão "Enviar e-mail de teste": devolve a mensagem de erro real. */
export async function sendTestEmail(msg: EmailMessage): Promise<{ result: EmailResult; error?: string }> {
  try {
    const t = await getTransporter();
    if (!t) {
      if (process.env.NODE_ENV !== 'production') return { result: 'saved', error: await saveToFile(msg) };
      return { result: 'skipped' };
    }
    await t.verify();
    await t.sendMail({ from: fromAddress(), ...msg });
    return { result: 'sent' };
  } catch (err) {
    return { result: 'failed', error: (err as Error).message };
  }
}
