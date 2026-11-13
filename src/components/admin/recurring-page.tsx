'use client';
/**
 * Lista e detalhe de reuniões recorrentes, com exceções por ocorrência,
 * suspensão temporária e encerramento.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarX, Pause, Pencil, Play, Plus, Repeat, Square, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { api, ApiError, useFetch } from '@/lib/client';
import { formatDateLong, formatDateShort, formatTime, todayString } from '@/lib/time';
import { ApiErrorAlert, HistoryList, useRooms, type HistoryEntry } from './common';
import { RecurringFormDialog, type RecurringDto } from './recurring-form';

type ListItem = RecurringDto & {
  status: 'ACTIVE' | 'SUSPENDED' | 'ENDED';
  ruleText: string;
  room: { id: string; name: string; active: boolean };
  suspendedFrom: string | null;
  suspendedUntil: string | null;
  exceptionsCount: number;
  nextOccurrences: { date: string; startTime: string; endTime: string }[];
};

const statusBadge = (m: { status: string; endDate: string | null }) => {
  if (m.status === 'SUSPENDED') return <Badge tone="warning">Suspensa</Badge>;
  if (m.status === 'ENDED' || (m.endDate && m.endDate < todayString())) return <Badge>Encerrada</Badge>;
  return <Badge tone="success">Ativa</Badge>;
};

export function RecurringListPage() {
  const router = useRouter();
  const list = useFetch<{ meetings: ListItem[] }>('/api/admin/recurring');
  const rooms = useRooms();
  const [creating, setCreating] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const meetings = (list.data?.meetings ?? []).filter((m) => showEnded || m.status !== 'ENDED');

  return (
    <>
      <PageHeader
        title="Reuniões recorrentes"
        description="Reuniões fixas ocupam a sala automaticamente em todas as ocorrências, sem cadastro semana a semana."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />Nova reunião recorrente</Button>}
      />
      <Checkbox className="mb-4" label="Mostrar séries encerradas" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
      {list.loading && !list.data ? (
        <Spinner />
      ) : meetings.length === 0 ? (
        <EmptyState icon={Repeat} title="Nenhuma reunião recorrente" description="Cadastre reuniões fixas, como “Administração — toda terça-feira, 19h às 21h”." action={<Button onClick={() => setCreating(true)}>Cadastrar</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {meetings.map((m) => (
            <Link key={m.id} href={`/admin/recorrentes/${m.id}`}>
              <Card className="h-full p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{m.name}</h3>
                  {statusBadge(m)}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{m.ruleText}</p>
                <p className="mt-1 text-sm text-ink-soft">{m.room.name} · {m.participants} pessoas{m.exceptionsCount ? ` · ${m.exceptionsCount} exceção(ões)` : ''}</p>
                {m.nextOccurrences.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-xs text-ink-soft">Próximas:</span>
                    {m.nextOccurrences.map((o) => <Badge key={o.date} tone="recurring">{formatDateShort(o.date)}</Badge>)}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
      {creating && (
        <RecurringFormDialog meeting={null} rooms={rooms.data?.rooms ?? []} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/admin/recorrentes/${id}`)} />
      )}
    </>
  );
}

interface Occurrence {
  meetingId: string;
  originalDate: string;
  date: string;
  roomId: string;
  startTime: string;
  endTime: string;
  state: 'SCHEDULED' | 'CANCELLED' | 'SUSPENDED';
  modified: boolean;
  exceptionId?: string;
  exceptionReason?: string | null;
}

interface Detail extends ListItem {
  occurrences: Occurrence[];
  exceptions: { id: string; originalDate: string; type: 'CANCELLED' | 'MODIFIED'; reason: string | null; newRoom: { name: string } | null; newStartTime: string | null; newEndTime: string | null }[];
  history: HistoryEntry[];
  previousSeries: { id: string; name: string } | null;
  nextSeries: { id: string; name: string }[];
}

export function RecurringDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const detail = useFetch<Detail>(`/api/admin/recurring/${id}`);
  const rooms = useRooms();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<null | 'suspend' | 'end' | 'resume'>(null);
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [showPast, setShowPast] = useState(false);
  const today = todayString();

  if (detail.loading && !detail.data) return <Spinner />;
  const m = detail.data;
  if (!m) return <EmptyState title="Reunião não encontrada" description={detail.error?.message} />;
  const roomName = (rid: string) => rooms.data?.rooms.find((r) => r.id === rid)?.name ?? '';
  const occurrences = m.occurrences.filter((o) => showPast || o.date >= today);
  const ended = m.status === 'ENDED' || Boolean(m.endDate && m.endDate < today);

  async function undo(exceptionId: string) {
    try {
      await api(`/api/admin/recurring/${id}/exceptions/${exceptionId}`, { method: 'DELETE' });
      toast('success', 'Ocorrência restaurada.');
      detail.reload();
    } catch (e) {
      toast('danger', (e as ApiError).message);
    }
  }

  return (
    <>
      <Link href="/admin/recorrentes" className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Reuniões recorrentes</Link>
      <PageHeader
        title={m.name}
        description={`${m.ruleText} · ${m.room.name}${m.description ? " — " + m.description : ""}`}
        actions={!ended ? (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden />Editar ocorrências futuras</Button>
            {m.status === 'SUSPENDED' ? (
              <Button variant="outline" onClick={() => setDialog('resume')}><Play className="h-4 w-4" aria-hidden />Retomar</Button>
            ) : (
              <Button variant="outline" onClick={() => setDialog('suspend')}><Pause className="h-4 w-4" aria-hidden />Suspender</Button>
            )}
            <Button variant="danger" onClick={() => setDialog('end')}><Square className="h-4 w-4" aria-hidden />Encerrar</Button>
          </>
        ) : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Ocorrências</h2>
            <Checkbox label="Mostrar passadas" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          </div>
          {occurrences.length === 0 ? (
            <p className="text-sm text-ink-soft">Nenhuma ocorrência no período exibido (próximos 180 dias).</p>
          ) : (
            <ul className="divide-y divide-mist/60">
              {occurrences.map((o) => {
                const past = o.date < today;
                return (
                  <li key={o.originalDate} className={`flex flex-wrap items-center gap-3 py-2 text-sm ${past ? 'opacity-60' : ''}`}>
                    <span className="w-60">{formatDateLong(o.date)}</span>
                    <span className={`tabular-nums ${o.state !== 'SCHEDULED' ? 'line-through text-ink-soft' : ''}`}>{formatTime(o.startTime)}–{formatTime(o.endTime)}</span>
                    {o.roomId !== m.roomId && <span className="text-ink-soft">em {roomName(o.roomId)}</span>}
                    {o.state === 'CANCELLED' && <Badge tone="danger" title={o.exceptionReason ?? ''}>Cancelada</Badge>}
                    {o.state === 'SUSPENDED' && <Badge tone="warning">Suspensa</Badge>}
                    {o.modified && <Badge tone="primary" title={o.exceptionReason ?? ''}>Alterada</Badge>}
                    {!past && (
                      <span className="ml-auto flex gap-1">
                        {o.exceptionId ? (
                          <Button size="sm" variant="ghost" onClick={() => undo(o.exceptionId!)}><Undo2 className="h-4 w-4" aria-hidden />Desfazer</Button>
                        ) : o.state === 'SCHEDULED' ? (
                          <Button size="sm" variant="ghost" onClick={() => setOccurrence(o)}>Cancelar/alterar</Button>
                        ) : null}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="text-base font-semibold">Dados da série</h2>
            <p>Situação: {statusBadge(m)}</p>
            <p>Início: {formatDateShort(m.startDate)}{m.endDate ? ` · Fim: ${formatDateShort(m.endDate)}` : ' · Sem data final'}</p>
            {m.suspendedFrom && <p>Suspensa de {formatDateShort(m.suspendedFrom)}{m.suspendedUntil ? ` até ${formatDateShort(m.suspendedUntil)}` : ' (sem data de retorno)'}</p>}
            <p>Participantes: {m.participants}</p>
            {m.equipment.length > 0 && <p>Equipamentos: {m.equipment.map((e) => e.equipment.name).join(', ')}</p>}
            <p>Título público: {m.showPublicTitle ? m.publicTitle || m.name : 'oculto (“Reunião recorrente”)'}</p>
            {m.previousSeries && <p>Continuação de: <Link className="text-primary hover:underline" href={`/admin/recorrentes/${m.previousSeries.id}`}>série anterior</Link></p>}
            {m.nextSeries.map((n) => <p key={n.id}>Continua em: <Link className="text-primary hover:underline" href={`/admin/recorrentes/${n.id}`}>nova série</Link></p>)}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Histórico</h2>
            <HistoryList entries={m.history} />
          </Card>
        </div>
      </div>

      {editing && (
        <RecurringFormDialog meeting={m} rooms={rooms.data?.rooms ?? []} onClose={() => setEditing(false)}
          onSaved={(newId) => { setEditing(false); if (newId !== id) router.push(`/admin/recorrentes/${newId}`); else detail.reload(); }} />
      )}
      {dialog && <SeriesActionDialog kind={dialog} meeting={m} onClose={() => setDialog(null)} onDone={() => { setDialog(null); detail.reload(); }} />}
      {occurrence && (
        <OccurrenceDialog meetingId={id} occurrence={occurrence} rooms={rooms.data?.rooms ?? []} onClose={() => setOccurrence(null)} onDone={() => { setOccurrence(null); detail.reload(); }} />
      )}
    </>
  );
}

function SeriesActionDialog({ kind, meeting, onClose, onDone }: { kind: 'suspend' | 'end' | 'resume'; meeting: Detail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = todayString();
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [skip, setSkip] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const conflicts = ((error?.details as { preview?: { conflicts: { date: string }[] } })?.preview?.conflicts) ?? [];

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (kind === 'suspend') await api(`/api/admin/recurring/${meeting.id}/suspend`, { body: { from, until: until || null, reason: reason || null } });
      if (kind === 'end') await api(`/api/admin/recurring/${meeting.id}/end`, { body: { endDate: from, reason: reason || null } });
      if (kind === 'resume') await api(`/api/admin/recurring/${meeting.id}/resume`, { body: { skipDates: skip ? conflicts.map((c) => c.date) : [] } });
      toast('success', { suspend: 'Série suspensa.', end: 'Série encerrada.', resume: 'Série retomada.' }[kind]);
      onDone();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const titles = { suspend: 'Suspender temporariamente', end: 'Encerrar recorrência', resume: 'Retomar série' };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={titles[kind]} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant={kind === 'end' ? 'danger' : 'primary'} loading={saving} disabled={kind === 'resume' && conflicts.length > 0 && !skip} onClick={submit}>Confirmar</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={error && error.code !== 'RECURRENCE_CONFLICTS' ? error : null} />
        {kind === 'suspend' && (
          <>
            <p className="text-sm text-ink-soft">As ocorrências no período não acontecerão e a sala ficará livre.</p>
            <Field label="Suspender a partir de" htmlFor="ss-de" required><Input id="ss-de" type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Até (opcional)" htmlFor="ss-ate" hint="Em branco = até ser retomada."><Input id="ss-ate" type="date" min={from} value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          </>
        )}
        {kind === 'end' && (
          <>
            <p className="text-sm text-ink-soft">Ocorrências após esta data deixam de existir. As anteriores permanecem no histórico.</p>
            <Field label="Última data da série" htmlFor="se-data" required><Input id="se-data" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          </>
        )}
        {kind === 'resume' && (
          <>
            <p className="text-sm text-ink-soft">As ocorrências voltam a ocupar a sala. Se algum horário tiver sido reservado durante a suspensão, ele será listado.</p>
            {conflicts.length > 0 && (
              <Alert tone="warning" title={error?.message}>
                <p>Datas ocupadas: {conflicts.map((c) => formatDateShort(c.date)).join(', ')}</p>
                <Checkbox className="mt-2" label="Retomar sem essas datas" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
              </Alert>
            )}
          </>
        )}
        {kind !== 'resume' && <Field label="Motivo (opcional)" htmlFor="sx-motivo"><Textarea id="sx-motivo" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      </div>
    </Dialog>
  );
}

function OccurrenceDialog({ meetingId, occurrence, rooms, onClose, onDone }: { meetingId: string; occurrence: Occurrence; rooms: { id: string; name: string; active: boolean; capacity: number }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<'CANCELLED' | 'MODIFIED'>('CANCELLED');
  const [roomId, setRoomId] = useState(occurrence.roomId);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/admin/recurring/${meetingId}/exceptions`, {
        body: {
          originalDate: occurrence.originalDate, type, reason: reason || null,
          newRoomId: type === 'MODIFIED' ? roomId : null,
          newStartTime: type === 'MODIFIED' ? startTime : null,
          newEndTime: type === 'MODIFIED' ? endTime : null,
        },
      });
      toast('success', type === 'CANCELLED' ? 'Ocorrência cancelada. O horário foi liberado.' : 'Ocorrência alterada.');
      onDone();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Ocorrência de ${formatDateShort(occurrence.date)}`} description="Afeta somente esta data; as demais continuam iguais." size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant={type === 'CANCELLED' ? 'danger' : 'primary'} loading={saving} onClick={submit}>Confirmar</Button></>}>
      <div className="space-y-4">
        <ApiErrorAlert error={error} />
        <div className="flex gap-4 text-sm" role="radiogroup">
          <label className="inline-flex items-center gap-1.5"><input type="radio" className="accent-[var(--color-primary)]" checked={type === 'CANCELLED'} onChange={() => setType('CANCELLED')} /><CalendarX className="h-4 w-4" aria-hidden />Cancelar esta ocorrência</label>
          <label className="inline-flex items-center gap-1.5"><input type="radio" className="accent-[var(--color-primary)]" checked={type === 'MODIFIED'} onChange={() => setType('MODIFIED')} /><Pencil className="h-4 w-4" aria-hidden />Alterar sala/horário</label>
        </div>
        {type === 'MODIFIED' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sala" htmlFor="oc-sala" className="sm:col-span-3">
              <Select id="oc-sala" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.capacity} pessoas)</option>)}
              </Select>
            </Field>
            <Field label="Início" htmlFor="oc-ini"><Input id="oc-ini" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
            <Field label="Término" htmlFor="oc-fim"><Input id="oc-fim" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Motivo" htmlFor="oc-motivo"><Input id="oc-motivo" placeholder="Ex.: feriado" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
