import { parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { badRequest } from '@/lib/errors';
import { formatDateShort, utcToTimeString } from '@/lib/time';
import { rangeQuerySchema } from '@/lib/validation';
import { getEvents } from '@/server/services/calendar';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = {
  RESERVATION: 'Reserva', RECURRING: 'Reunião recorrente', BLOCK: 'Bloqueio',
  REQUEST: 'Solicitação pendente', CANCELLED_OCCURRENCE: 'Ocorrência cancelada/suspensa',
};

function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas maliciosas no Excel
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Exporta a agenda do período em CSV (abre no Excel). Para PDF, use a tela "Imprimir agenda". */
export const GET = adminRoute(async (req) => {
  const { from, to } = parseQuery(req, rangeQuerySchema);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw badRequest('Período inválido (máximo de 400 dias).');
  const events = await getEvents(from, to, { admin: true });
  const rows = [
    ['Data', 'Início', 'Término', 'Sala', 'Tipo', 'Título', 'Participantes'],
    ...events.map((e) => [
      formatDateShort(e.date), utcToTimeString(e.startAt), utcToTimeString(e.endAt), e.roomName, KIND[e.kind] ?? e.kind, e.title, e.participants ?? '',
    ]),
  ];
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="agenda-${from}-a-${to}.csv"`,
    },
  });
});
