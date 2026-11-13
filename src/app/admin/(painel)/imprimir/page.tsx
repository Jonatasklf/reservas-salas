/**
 * Agenda para impressão ou "Salvar como PDF" (pelo próprio navegador).
 */
import { getEvents } from '@/server/services/calendar';
import { getSettings } from '@/server/services/settings';
import { addDays, formatDateLong, formatDateShort, formatRange, isValidDateString, todayString } from '@/lib/time';
import { PrintButton } from '@/components/admin/print-button';

export const metadata = { title: 'Agenda para impressão' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { RESERVATION: 'Reserva', RECURRING: 'Recorrente', BLOCK: 'Bloqueio', REQUEST: 'Pendente', CANCELLED_OCCURRENCE: 'Cancelada' };

export default async function PrintPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const from = sp.from && isValidDateString(sp.from) ? sp.from : todayString();
  let to = sp.to && isValidDateString(sp.to) && sp.to >= from ? sp.to : addDays(from, 30);
  if (to > addDays(from, 62)) to = addDays(from, 62);
  const [events, settings] = await Promise.all([getEvents(from, to, { admin: true }), getSettings()]);
  const visible = events.filter((e) => e.kind !== 'CANCELLED_OCCURRENCE' && e.kind !== 'REQUEST');
  const byDay = visible.reduce<Record<string, typeof visible>>((acc, e) => ((acc[e.date] ||= []).push(e), acc), {});

  return (
    <div className="mx-auto max-w-3xl bg-surface p-6 print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">{settings.unitName}</p>
          <h1 className="text-xl font-semibold">Agenda das salas — {formatDateShort(from)} a {formatDateShort(to)}</h1>
        </div>
        <PrintButton />
      </div>
      {Object.keys(byDay).length === 0 && <p className="text-sm">Nenhuma ocupação no período.</p>}
      {Object.entries(byDay).map(([date, evs]) => (
        <section key={date} className="mb-5 break-inside-avoid">
          <h2 className="mb-1 border-b border-mist pb-1 text-sm font-semibold">{formatDateLong(date)}</h2>
          <table className="w-full text-sm">
            <tbody>
              {evs.map((e) => (
                <tr key={e.id} className="border-b border-mist/50">
                  <td className="w-32 py-1 tabular-nums">{e.kind === 'BLOCK' ? 'Dia/período' : formatRange(e.startAt, e.endAt)}</td>
                  <td className="w-40 py-1">{e.roomName}</td>
                  <td className="py-1">{e.title}</td>
                  <td className="w-24 py-1 text-right text-ink-soft">{KIND[e.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
