/**
 * Envio de e-mails OPCIONAL.
 * Sem SMTP configurado no .env, as mensagens são apenas registradas no
 * console e o sistema continua funcionando normalmente.
 */
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null | undefined;

async function getTransporter(): Promise<Transporter | null> {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return (transporter = null);
  const nodemailer = await import('nodemailer');
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  try {
    const t = await getTransporter();
    if (!t) {
      if (process.env.NODE_ENV !== 'test') console.info(`[e-mail não configurado] Para: ${to} | Assunto: ${subject}`);
      return;
    }
    await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  } catch (err) {
    // Falha de e-mail nunca impede a operação principal.
    console.error('[e-mail] Falha ao enviar:', err);
  }
}
