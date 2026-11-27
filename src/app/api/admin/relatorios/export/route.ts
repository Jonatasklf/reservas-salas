import { parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { csvResponse, toCsv } from '@/lib/csv';
import { formatDateShort } from '@/lib/time';
import { siteConfig } from '@/config/site';
import { reportQuerySchema } from '@/lib/validation';
import { checkReportPeriod, getReport } from '@/server/services/reports';

export const dynamic = 'force-dynamic';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const num = (n: number) => String(n).replace('.', ',');

/** Exporta o relatório do período em CSV, em seções (abre no Excel). */
export const GET = adminRoute(async (req) => {
  const q = parseQuery(req, reportQuerySchema);
  checkReportPeriod(q.from, q.to);
  const r = await getReport(q);
  const labels = siteConfig.requestStatusLabels;
  const csv = toCsv([
    ['Relatório de uso das salas'],
    ['Período', `${formatDateShort(r.period.from)} a ${formatDateShort(r.period.to)}`],
    [],
    ['SOLICITAÇÕES'],
    ['Recebidas', r.requests.total],
    ...Object.entries(r.requests.byStatus).map(([k, v]) => [labels[k as keyof typeof labels], v]),
    ['Taxa de aprovação', pct(r.requests.approvalRate)],
    ['Tempo médio de resposta (horas)', r.requests.avgResponseHours === null ? '—' : num(r.requests.avgResponseHours)],
    [],
    ['USO DAS SALAS'],
    ['Reservas confirmadas', r.usage.reservations],
    ['  das quais vindas de solicitações', r.usage.reservationsFromRequests],
    ['Ocorrências de reuniões recorrentes', r.usage.recurringOccurrences],
    ['Horas ocupadas', num(r.usage.occupiedHours)],
    ['Horas disponíveis', num(r.usage.availableHours)],
    ['Taxa de ocupação', pct(r.usage.occupancyRate)],
    [],
    ['POR SALA'],
    ['Sala', 'Situação', 'Capacidade', 'Solicitações', 'Reservas', 'Recorrentes', 'Horas ocupadas', 'Horas disponíveis', 'Ocupação'],
    ...r.perRoom.map((p) => [p.name, p.active ? 'Ativa' : 'Inativa', p.capacity, p.requests, p.reservations, p.recurring, num(p.occupiedHours), num(p.availableHours), pct(p.occupancyRate)]),
    [],
    ['HORAS OCUPADAS POR DIA DA SEMANA'],
    ...r.byWeekday.map((h, d) => [siteConfig.weekdayLabels[d], num(h)]),
    [],
    ['MENSAGENS'],
    ['WhatsApp enviados', r.notifications.whatsappSent],
    ['WhatsApp com falha', r.notifications.whatsappFailed],
    ['E-mails enviados', r.notifications.emailSent],
    ['E-mails com falha', r.notifications.emailFailed],
    [],
    ['ACESSOS ADMINISTRATIVOS'],
    ['Logins', r.access.logins],
    ['Tentativas de login sem sucesso', r.access.failedLogins],
  ]);
  return csvResponse(csv, `relatorio-${r.period.from}-a-${r.period.to}.csv`);
});
