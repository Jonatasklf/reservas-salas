'use client';
/**
 * Página inicial pública:
 *   calendário (mensal/semanal) → dia selecionado → cartões das salas → solicitar reserva.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import { CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Filter, SearchX } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Spinner } from '@/components/ui';
import { useFetch } from '@/lib/client';
import { addDays, formatDateLong, formatTime, utcToTimeString, weekdayOf } from '@/lib/time';
import { siteConfig } from '@/config/site';
import type { PublicSettings } from '@/server/services/settings';
import { RoomCard, type DayRoom } from './room-card';
import { RequestDialog, type RequestPrefill } from './request-dialog';
import { timeOptions } from './time-options';

interface Props {
  today: string;
  settings: PublicSettings;
  equipment: { id: string; key: string; name: string }[];
}

type EventDto = { id: string; kind: string; roomName: string; date: string; startAt: string; endAt: string; title: string };
type CalendarDto = { days: Record<string, { occupied: number; blocked: boolean; pending: number }>; events: EventDto[] };

const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function PublicHome({ today, settings, equipment }: Props) {
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => toDate(today.slice(0, 8) + '01'));
  const [view, setView] = useState<'month' | 'week'>('month');
  const [filters, setFilters] = useState({ startTime: '', endTime: '', participants: '', projector: false, equipment: [] as string[] });
  const [debounced, setDebounced] = useState(filters);
  const [requestFor, setRequestFor] = useState<RequestPrefill | null>(null);
  // Filtros recolhidos no celular (sempre visíveis no computador).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const roomsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  // Período consultado no calendário (mês visível com folga ou semana do dia selecionado).
  const weekStart = addDays(selected, -weekdayOf(selected));
  const range = useMemo(() => {
    if (view === 'week') return { from: weekStart, to: addDays(weekStart, 6) };
    const first = toStr(month);
    const last = toStr(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    return { from: addDays(first, -7), to: addDays(last, 7) };
  }, [view, month, weekStart]);
  const calendar = useFetch<CalendarDto>(`/api/public/calendar?from=${range.from}&to=${range.to}`);

  const projectorId = equipment.find((e) => e.key === 'projetor')?.id;
  const equipmentFilter = [...new Set([...debounced.equipment, ...(debounced.projector && projectorId ? [projectorId] : [])])];
  const hasInterval = debounced.startTime && debounced.endTime && debounced.endTime > debounced.startTime;
  const dayUrl =
    `/api/public/day?date=${selected}` +
    (hasInterval ? `&startTime=${debounced.startTime}&endTime=${debounced.endTime}` : '') +
    (Number(debounced.participants) > 0 ? `&participants=${Number(debounced.participants)}` : '') +
    (equipmentFilter.length ? `&equipment=${equipmentFilter.join(',')}` : '');
  const day = useFetch<{ rooms: DayRoom[] }>(dayUrl);

  const modifiers = useMemo(() => {
    const days = calendar.data?.days ?? {};
    const pick = (fn: (d: CalendarDto['days'][string]) => boolean) => Object.entries(days).filter(([, v]) => fn(v)).map(([k]) => toDate(k));
    return { ocupado: pick((d) => d.occupied > 0), bloqueado: pick((d) => d.blocked) };
  }, [calendar.data]);

  const rooms = day.data?.rooms ?? [];
  const participants = Number(debounced.participants) || 0;
  const visibleRooms = rooms.filter((r) => (!participants || r.capacity >= participants) && r.missingEquipment.length === 0);
  const hiddenCount = rooms.length - visibleRooms.length;
  const invalidInterval = filters.startTime && filters.endTime && filters.endTime <= filters.startTime;

  function selectDate(d: string) {
    setSelected(d);
    const m = toDate(d.slice(0, 8) + '01');
    if (m.getTime() !== month.getTime()) setMonth(m);
  }

  /** No celular, ao tocar em um dia do calendário, rola até as salas daquele dia. */
  function pickDateFromCalendar(d: string) {
    selectDate(d);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => roomsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 50);
    }
  }

  const activeFilters =
    (filters.startTime && filters.endTime ? 1 : 0) + (filters.participants ? 1 : 0) + (filters.projector ? 1 : 0) + filters.equipment.length;

  function openRequest(room: DayRoom) {
    setRequestFor({
      room: { id: room.id, name: room.name, capacity: room.capacity, equipment: room.equipment },
      date: selected,
      startTime: filters.startTime,
      endTime: filters.endTime,
      participants: filters.participants,
      needsProjector: filters.projector,
      equipmentIds: filters.equipment,
    });
  }

  const times = timeOptions('06:00', '23:30');
  const otherEquipment = equipment.filter((e) => e.key !== 'projetor');

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* ------------------------------------------------ Calendário */}
      <section aria-label="Calendário" className="space-y-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Calendário</h2>
            <div className="flex rounded-lg bg-mist-soft p-0.5 text-sm" role="tablist" aria-label="Visualização">
              {(['month', 'week'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === v ? 'bg-surface font-medium text-primary shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                >
                  {v === 'month' ? <CalendarDays className="h-4 w-4" aria-hidden /> : <CalendarRange className="h-4 w-4" aria-hidden />}
                  {v === 'month' ? 'Mês' : 'Semana'}
                </button>
              ))}
            </div>
          </div>

          {view === 'month' ? (
            <div className="flex justify-center">
              <DayPicker
                mode="single"
                required
                locale={ptBR}
                selected={toDate(selected)}
                onSelect={(d) => d && pickDateFromCalendar(toStr(d))}
                month={month}
                onMonthChange={setMonth}
                captionLayout="dropdown"
                startMonth={new Date(toDate(today).getFullYear() - 1, 0)}
                endMonth={new Date(toDate(today).getFullYear() + 2, 11)}
                showOutsideDays
                today={toDate(today)}
                modifiers={modifiers}
                modifiersClassNames={{ ocupado: 'dia-ocupado', bloqueado: 'dia-bloqueado' }}
              />
            </div>
          ) : (
            <WeekView weekStart={weekStart} selected={selected} today={today} events={calendar.data?.events ?? []} loading={calendar.loading} onSelect={pickDateFromCalendar} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mist/70 pt-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Com reservas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-danger" />Bloqueio/feriado</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-mist" />Hoje</span>
            <button className="ml-auto font-medium text-primary hover:underline" onClick={() => selectDate(today)}>Ir para hoje</button>
          </div>
        </Card>

        <Card className="p-4">
          {/* No celular é um botão que abre/fecha; no computador fica sempre aberto. */}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="painel-filtros"
            className="flex w-full items-center gap-2 text-left text-base font-semibold lg:pointer-events-none"
          >
            <Filter className="h-4 w-4 text-primary-muted" aria-hidden />
            Filtrar disponibilidade
            {activeFilters > 0 && <Badge tone="primary">{activeFilters} ativo(s)</Badge>}
            <ChevronDown className={`ml-auto h-5 w-5 text-ink-soft transition-transform lg:hidden ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <div id="painel-filtros" className={`mt-3 grid-cols-2 gap-3 ${filtersOpen ? 'grid' : 'hidden'} lg:grid`}>
            <Field label="Data" htmlFor="f-data" className="col-span-2">
              <Input id="f-data" type="date" value={selected} onChange={(e) => e.target.value && selectDate(e.target.value)} />
            </Field>
            <Field label="Início" htmlFor="f-inicio">
              <Select id="f-inicio" value={filters.startTime} onChange={(e) => setFilters({ ...filters, startTime: e.target.value })}>
                <option value="">—</option>
                {times.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </Select>
            </Field>
            <Field label="Término" htmlFor="f-fim" error={invalidInterval ? 'Deve ser após o início.' : undefined}>
              <Select id="f-fim" value={filters.endTime} aria-invalid={Boolean(invalidInterval)} onChange={(e) => setFilters({ ...filters, endTime: e.target.value })}>
                <option value="">—</option>
                {times.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </Select>
            </Field>
            <Field label="Participantes" htmlFor="f-part" className="col-span-2">
              <Input id="f-part" type="number" min={1} inputMode="numeric" placeholder="Quantidade de pessoas" value={filters.participants} onChange={(e) => setFilters({ ...filters, participants: e.target.value })} />
            </Field>
            <div className="col-span-2 space-y-2">
              <p className="text-sm font-medium">Equipamentos</p>
              {projectorId && <Checkbox label="Precisa de projetor" checked={filters.projector} onChange={(e) => setFilters({ ...filters, projector: e.target.checked })} />}
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {otherEquipment.map((e) => (
                  <Checkbox
                    key={e.id}
                    label={e.name}
                    checked={filters.equipment.includes(e.id)}
                    onChange={(ev) =>
                      setFilters({ ...filters, equipment: ev.target.checked ? [...filters.equipment, e.id] : filters.equipment.filter((x) => x !== e.id) })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          {(filters.startTime || filters.endTime || filters.participants || filters.projector || filters.equipment.length > 0) && (
            <Button variant="ghost" size="sm" className={`mt-3 ${filtersOpen ? '' : 'hidden'} lg:inline-flex`} onClick={() => setFilters({ startTime: '', endTime: '', participants: '', projector: false, equipment: [] })}>
              Limpar filtros
            </Button>
          )}
        </Card>
      </section>

      {/* ------------------------------------------------ Salas do dia */}
      <section ref={roomsRef} aria-live="polite" aria-label="Salas do dia selecionado" className="scroll-mt-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Salas em</p>
            <h2 className="text-xl font-semibold text-ink">{formatDateLong(selected)}</h2>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => selectDate(addDays(selected, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" aria-label="Próximo dia" onClick={() => selectDate(addDays(selected, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {hasInterval && (
          <p className="mb-3 text-sm text-ink-soft">
            Mostrando a situação das salas das <strong className="text-ink">{formatTime(debounced.startTime)}</strong> às{' '}
            <strong className="text-ink">{formatTime(debounced.endTime)}</strong>
            {participants > 0 && <> para <strong className="text-ink">{participants} pessoa(s)</strong></>}.
          </p>
        )}

        {day.loading && !day.data ? (
          <Spinner label="Consultando as salas..." />
        ) : day.error ? (
          <EmptyState icon={SearchX} title="Não foi possível carregar as salas" description={day.error.message} action={<Button onClick={day.reload}>Tentar novamente</Button>} />
        ) : rooms.length === 0 ? (
          <EmptyState icon={SearchX} title="Nenhuma sala cadastrada" description="A administração ainda não cadastrou salas." />
        ) : (
          <div className={`space-y-4 transition-opacity ${day.loading ? 'opacity-60' : ''}`}>
            {visibleRooms.length === 0 && (
              <EmptyState icon={SearchX} title="Nenhuma sala atende aos filtros" description="Tente reduzir o número de participantes ou remover algum equipamento." />
            )}
            {visibleRooms.map((room) => (
              <RoomCard key={room.id} room={room} onRequest={() => openRequest(room)} highlight={Boolean(hasInterval)} />
            ))}
            {hiddenCount > 0 && visibleRooms.length > 0 && (
              <p className="text-center text-xs text-ink-soft">{hiddenCount} sala(s) ocultada(s) por não atender à capacidade ou aos equipamentos escolhidos.</p>
            )}
          </div>
        )}
      </section>

      {requestFor && (
        <RequestDialog
          prefill={requestFor}
          settings={settings}
          equipment={equipment}
          onClose={() => setRequestFor(null)}
          onSwitchRoom={(roomId) => {
            const r = rooms.find((x) => x.id === roomId);
            if (r) setRequestFor({ ...requestFor, room: { id: r.id, name: r.name, capacity: r.capacity, equipment: r.equipment } });
          }}
          onSubmitted={() => {
            day.reload();
            calendar.reload();
          }}
        />
      )}
    </div>
  );
}

function WeekView({
  weekStart, selected, today, events, loading, onSelect,
}: { weekStart: string; selected: string; today: string; events: EventDto[]; loading: boolean; onSelect: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" onClick={() => onSelect(addDays(selected, -7))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-medium">
          {days[0].split('-').reverse().slice(0, 2).join('/')} a {days[6].split('-').reverse().slice(0, 2).join('/')}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onSelect(addDays(selected, 7))} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></Button>
      </div>
      {loading && <Spinner className="py-4" />}
      <ul className="space-y-1.5">
        {days.map((d) => {
          const dayEvents = events.filter((e) => e.date === d);
          const isSel = d === selected;
          return (
            <li key={d}>
              <button
                onClick={() => onSelect(d)}
                className={`w-full rounded-lg border p-2.5 text-left transition-colors ${isSel ? 'border-primary bg-primary-soft' : 'border-mist/70 hover:bg-mist-soft'}`}
                aria-pressed={isSel}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-medium ${d === today ? 'text-primary' : ''}`}>
                    {siteConfig.weekdayShort[weekdayOf(d)]}, {d.split('-').reverse().slice(0, 2).join('/')}
                    {d === today && <span className="ml-1.5 text-xs">(hoje)</span>}
                  </span>
                  <span className="text-xs text-ink-soft">{dayEvents.length ? `${dayEvents.length} ocupação(ões)` : 'Livre'}</span>
                </div>
                {dayEvents.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {dayEvents.slice(0, 4).map((e) => (
                      <li key={e.id} className="flex gap-2 truncate text-xs text-ink-soft">
                        <span className="tabular-nums text-ink">{utcToTimeString(new Date(e.startAt))}</span>
                        <span className="truncate">{e.roomName} · {e.title}</span>
                        {e.kind === 'BLOCK' && <Badge tone="danger" className="ml-auto py-0">bloqueio</Badge>}
                      </li>
                    ))}
                    {dayEvents.length > 4 && <li className="text-xs text-ink-soft">+ {dayEvents.length - 4}</li>}
                  </ul>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
