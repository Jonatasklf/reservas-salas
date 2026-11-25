/**
 * TEXTOS DAS MENSAGENS DE WHATSAPP
 * -----------------------------------------------------------------------------
 * Para mudar o que o solicitante recebe no WhatsApp, altere apenas este
 * arquivo. Formatação do WhatsApp: *negrito*, _itálico_.
 */
import { formatDateShort, formatRange, utcToDateString } from '@/lib/time';
import { saudacao, siteConfig } from '@/config/site';

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface RequestInfo {
  protocol: string;
  requesterName: string;
  roomName: string;
  startAt: Date;
  endAt: Date;
  participants: number;
}

/** Remove marcações que poderiam bagunçar a formatação do WhatsApp. */
const limpo = (texto: string) => texto.replace(/[*_~`]/g, '').trim();
const quando = (r: RequestInfo) => `${formatDateShort(utcToDateString(r.startAt))}, ${formatRange(r.startAt, r.endAt)}`;
const link = (protocol: string) => `${appUrl()}/protocolo?protocolo=${encodeURIComponent(protocol)}`;

/** Fecho comum: aviso de mensagem automática + despedida (src/config/site.ts). */
const fecho = () => ['', siteConfig.mensagens.avisoAutomaticoWhatsApp, '', siteConfig.mensagens.despedida];

/** Confirmação logo após o pedido (com protocolo e código de acesso). */
export function requestReceivedWhatsApp(unitName: string, r: RequestInfo, accessCode: string): string {
  return [
    `${saudacao(limpo(r.requesterName))} Recebemos sua solicitação de reserva.`,
    '',
    `*Protocolo:* ${r.protocol}`,
    `*Código de acesso:* ${accessCode}`,
    `*Sala:* ${limpo(r.roomName)}`,
    `*Data e horário:* ${quando(r)}`,
    `*Participantes:* ${r.participants}`,
    '',
    'Situação: *aguardando aprovação*. O envio não significa que a reserva foi aprovada.',
    '',
    `Consulte a situação em: ${link(r.protocol)}`,
    ...fecho(),
  ].join('\n');
}

/** Atualização (aprovada, rejeitada, informações, sugestão, cancelada). */
export function requestUpdateWhatsApp(
  unitName: string,
  r: RequestInfo,
  headline: string,
  extra: { publicMessage?: string | null; suggestion?: string | null },
): string {
  return [
    saudacao(limpo(r.requesterName)),
    '',
    `*${headline}*`,
    '',
    `*Protocolo:* ${r.protocol}`,
    `*Sala:* ${limpo(r.roomName)}`,
    `*Data e horário:* ${quando(r)}`,
    ...(extra.publicMessage ? ['', `*Mensagem da administração:* ${limpo(extra.publicMessage)}`] : []),
    ...(extra.suggestion ? ['', `*Sugestão:* ${limpo(extra.suggestion)}`] : []),
    '',
    `Consulte em: ${link(r.protocol)}`,
    ...fecho(),
  ].join('\n');
}

export function testWhatsApp(unitName: string): string {
  return `Teste do sistema de reservas (${limpo(unitName)}): se você recebeu esta mensagem, o envio por WhatsApp está funcionando. ✅`;
}
