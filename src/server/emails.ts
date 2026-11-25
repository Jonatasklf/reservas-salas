/**
 * MODELOS DE E-MAIL
 * -----------------------------------------------------------------------------
 * Todos os textos enviados por e-mail ficam aqui. Para mudar uma mensagem,
 * altere apenas este arquivo. Todo conteúdo digitado por usuários passa por
 * escapeHtml() antes de entrar no HTML.
 */
import type { EmailMessage } from '@/lib/email';
import { formatDateShort, formatRange, utcToDateString } from '@/lib/time';
import { saudacao, siteConfig } from '@/config/site';

/** Despedida no fim do e-mail (texto em src/config/site.ts). */
const despedidaHtml = () => `<p style="margin:20px 0 0">${escapeHtml(siteConfig.mensagens.despedida)}</p>`;

/** Fecho da versão em texto simples: aviso de mensagem automática + despedida. */
const fechoTexto = () => `${siteConfig.mensagens.avisoAutomaticoEmail}\n\n${siteConfig.mensagens.despedida}`;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Moldura visual comum (cores da identidade do sistema). */
function layout(unitName: string, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f6f8fa;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#201e1e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #cdd4dc;border-radius:14px;overflow:hidden">
<tr><td style="background:#033d60;color:#ffffff;padding:18px 24px;font-size:15px;font-weight:600">${escapeHtml(unitName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;color:#033d60">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:14px 24px;background:#eef1f4;font-size:12px;color:#55595f">
${escapeHtml(siteConfig.mensagens.avisoAutomaticoEmail)}
</td></tr>
</table></td></tr></table></body></html>`;
}

function detailsTable(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #cdd4dc;border-radius:10px;font-size:14px;margin:16px 0">
${rows.map(([k, v]) => `<tr><td style="padding:8px 12px;color:#55595f;width:42%;border-bottom:1px solid #eef1f4">${escapeHtml(k)}</td><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #eef1f4">${v}</td></tr>`).join('')}
</table>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#033d60;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

interface RequestInfo {
  protocol: string;
  requesterName: string;
  roomName: string;
  startAt: Date;
  endAt: Date;
  participants: number;
}

function when(r: RequestInfo) {
  return `${formatDateShort(utcToDateString(r.startAt))}, ${formatRange(r.startAt, r.endAt)}`;
}

/** Confirmação enviada ao solicitante logo após o pedido (com protocolo e código). */
export function requestReceivedEmail(unitName: string, to: string, r: RequestInfo, accessCode: string): EmailMessage {
  const link = `${appUrl()}/protocolo?protocolo=${encodeURIComponent(r.protocol)}`;
  const subject = `Solicitação recebida — protocolo ${r.protocol}`;
  const html = layout(
    unitName,
    'Recebemos sua solicitação de reserva',
    `<p style="margin:0 0 8px">${escapeHtml(saudacao(r.requesterName))}</p>
<p style="margin:0">Seu pedido foi registrado e está <strong>aguardando aprovação</strong> da administração.
<strong>O envio não significa que a reserva foi aprovada.</strong></p>
${detailsTable([
  ['Protocolo', `<span style="font-size:18px;color:#033d60">${escapeHtml(r.protocol)}</span>`],
  ['Código de acesso', `<span style="font-family:Consolas,monospace;font-size:18px;letter-spacing:2px;color:#033d60">${escapeHtml(accessCode)}</span>`],
  ['Sala', escapeHtml(r.roomName)],
  ['Data e horário', escapeHtml(when(r))],
  ['Participantes', String(r.participants)],
])}
<p style="margin:0">Guarde o protocolo e o código de acesso: eles são necessários para consultar a situação do pedido.</p>
${button(link, 'Consultar situação')}
${despedidaHtml()}`,
  );
  const text =
    `${saudacao(r.requesterName)} Recebemos sua solicitação de reserva. Ela está AGUARDANDO APROVAÇÃO ` +
    `(o envio não significa que a reserva foi aprovada).\n\n` +
    `Protocolo: ${r.protocol}\nCódigo de acesso: ${accessCode}\nSala: ${r.roomName}\nData e horário: ${when(r)}\n` +
    `Participantes: ${r.participants}\n\nConsulte a situação em: ${link}\n\n${fechoTexto()}`;
  return { to, subject, text, html };
}

/** Atualização de situação (aprovada, rejeitada, informações, sugestão, cancelada). */
export function requestUpdateEmail(
  unitName: string,
  to: string,
  r: RequestInfo,
  headline: string,
  extra: { publicMessage?: string | null; suggestion?: string | null },
): EmailMessage {
  const link = `${appUrl()}/protocolo?protocolo=${encodeURIComponent(r.protocol)}`;
  const subject = `Solicitação ${r.protocol} — ${headline}`;
  const notes = [
    extra.publicMessage ? `<p style="margin:8px 0"><strong>Mensagem da administração:</strong><br>${escapeHtml(extra.publicMessage)}</p>` : '',
    extra.suggestion ? `<p style="margin:8px 0"><strong>Sugestão:</strong><br>${escapeHtml(extra.suggestion)}</p>` : '',
  ].join('');
  const html = layout(
    unitName,
    headline,
    `<p style="margin:0 0 8px">${escapeHtml(saudacao(r.requesterName))}</p>
<p style="margin:0">Há uma atualização na sua solicitação.</p>
${detailsTable([
  ['Protocolo', escapeHtml(r.protocol)],
  ['Sala', escapeHtml(r.roomName)],
  ['Data e horário', escapeHtml(when(r))],
])}
${notes}
${button(link, 'Consultar situação')}
${despedidaHtml()}`,
  );
  const text =
    `${saudacao(r.requesterName)}\n\n${headline}\n\nProtocolo: ${r.protocol}\nSala: ${r.roomName}\nData e horário: ${when(r)}\n` +
    (extra.publicMessage ? `\nMensagem da administração: ${extra.publicMessage}\n` : '') +
    (extra.suggestion ? `\nSugestão: ${extra.suggestion}\n` : '') +
    `\nConsulte em: ${link}\n\n${fechoTexto()}`;
  return { to, subject, text, html };
}

/** Aviso à administração sobre nova solicitação (sem dados de contato). */
export function adminNewRequestEmail(unitName: string, to: string, r: RequestInfo): EmailMessage {
  const link = `${appUrl()}/admin/solicitacoes`;
  const subject = `Nova solicitação de reserva ${r.protocol}`;
  const html = layout(
    unitName,
    'Nova solicitação de reserva',
    `${detailsTable([
      ['Protocolo', escapeHtml(r.protocol)],
      ['Sala', escapeHtml(r.roomName)],
      ['Data e horário', escapeHtml(when(r))],
      ['Participantes', String(r.participants)],
    ])}${button(link, 'Abrir fila de solicitações')}`,
  );
  const text = `Nova solicitação recebida.\n\nProtocolo: ${r.protocol}\nSala: ${r.roomName}\nData: ${when(r)}\n\nAcesse: ${link}`;
  return { to, subject, text, html };
}

export function testEmail(unitName: string, to: string): EmailMessage {
  return {
    to,
    subject: 'Teste de e-mail — Reservas de Salas',
    text: 'Se você recebeu esta mensagem, o envio de e-mails está configurado corretamente.',
    html: layout(unitName, 'Teste de e-mail', '<p style="margin:0">Se você recebeu esta mensagem, o envio de e-mails está configurado corretamente.</p>'),
  };
}
