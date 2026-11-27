/**
 * AVISOS AO SOLICITANTE (WhatsApp e/ou e-mail)
 * =============================================================================
 * O canal é escolhido em Configurações (Settings.requesterChannel):
 *   - WHATSAPP: tenta o WhatsApp; se não houver telefone ou o envio falhar,
 *     usa o e-mail (se a pessoa informou um).
 *   - EMAIL:    tenta o e-mail; se não houver e-mail ou falhar, usa o WhatsApp.
 *   - BOTH:     envia pelos dois (quando houver os contatos).
 * =============================================================================
 */
import type { NotificationChannel, Settings } from '@prisma/client';
import { sendEmail, type EmailMessage } from '@/lib/email';
import { formatPhoneBR, normalizePhoneBR, sendWhatsApp } from '@/lib/whatsapp';

export type DeliveryStatus = 'sent' | 'failed' | 'not_attempted';

export interface DeliveryReport {
  whatsapp: DeliveryStatus;
  email: DeliveryStatus;
  /** Telefone formatado para exibir (quando o WhatsApp foi usado). */
  phone: string | null;
  email_address: string | null;
}

interface Contact {
  phone: string | null;
  email: string | null;
}

interface Builders {
  whatsapp: () => string;
  email: (to: string) => EmailMessage;
}

/** Ordem de tentativa conforme o canal configurado. */
export function channelPlan(channel: NotificationChannel): { order: ('whatsapp' | 'email')[]; both: boolean } {
  if (channel === 'BOTH') return { order: ['whatsapp', 'email'], both: true };
  if (channel === 'EMAIL') return { order: ['email', 'whatsapp'], both: false };
  return { order: ['whatsapp', 'email'], both: false };
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Entrega a mensagem ao solicitante seguindo o canal configurado e a regra
 * de reserva. Nunca lança erro.
 */
export async function deliverToRequester(
  settings: Pick<Settings, 'requesterChannel'>,
  contact: Contact,
  build: Builders,
  opts: { timeoutMs?: number } = {},
): Promise<DeliveryReport> {
  const report: DeliveryReport = { whatsapp: 'not_attempted', email: 'not_attempted', phone: null, email_address: null };
  const phone = normalizePhoneBR(contact.phone);
  const { order, both } = channelPlan(settings.requesterChannel);
  const timeout = opts.timeoutMs ?? 35_000;

  for (const channel of order) {
    if (channel === 'whatsapp' && phone) {
      const r = await withTimeout(sendWhatsApp(phone, build.whatsapp()), timeout, 'failed' as const);
      // 'skipped' = canal não configurado: não conta como tentativa nem como falha.
      report.whatsapp = r === 'sent' || r === 'saved' ? 'sent' : r === 'skipped' ? 'not_attempted' : 'failed';
      if (report.whatsapp === 'sent') report.phone = formatPhoneBR(phone);
    }
    if (channel === 'email' && contact.email) {
      const r = await withTimeout(sendEmail(build.email(contact.email)), timeout, 'failed' as const);
      report.email = r === 'sent' || r === 'saved' ? 'sent' : r === 'skipped' ? 'not_attempted' : 'failed';
      if (report.email === 'sent') report.email_address = contact.email;
    }
    // Sem "ambos": parar no primeiro canal que funcionou.
    if (!both && (report.whatsapp === 'sent' || report.email === 'sent')) break;
  }
  return report;
}

/**
 * Registra no histórico (AuditLog) o resultado de cada canal tentado. Aparece
 * no histórico da solicitação, no Registro de atividades e nos Relatórios.
 */
export async function logDelivery(
  requestId: string,
  kind: 'confirmacao' | 'atualizacao',
  report: DeliveryReport,
): Promise<void> {
  const { prisma } = await import('@/lib/db');
  const { audit } = await import('./services/audit');
  const what = kind === 'confirmacao' ? 'Protocolo' : 'Atualização';
  const entries: { action: string; summary: string; status: DeliveryStatus }[] = [];
  if (report.whatsapp !== 'not_attempted') {
    entries.push({
      action: 'NOTIFICATION_WHATSAPP',
      status: report.whatsapp,
      summary: report.whatsapp === 'sent' ? `${what} enviado(a) por WhatsApp para ${report.phone}.` : `Falha ao enviar ${what.toLowerCase()} por WhatsApp.`,
    });
  }
  if (report.email !== 'not_attempted') {
    entries.push({
      action: 'NOTIFICATION_EMAIL',
      status: report.email,
      summary: report.email === 'sent' ? `${what} enviado(a) por e-mail para ${report.email_address}.` : `Falha ao enviar ${what.toLowerCase()} por e-mail.`,
    });
  }
  for (const e of entries) {
    await audit(prisma, {
      action: e.action,
      entityType: 'ReservationRequest',
      entityId: requestId,
      summary: e.summary,
      details: { status: e.status, kind },
    }).catch((err) => console.error('[avisos] Falha ao registrar envio:', err));
  }
}
