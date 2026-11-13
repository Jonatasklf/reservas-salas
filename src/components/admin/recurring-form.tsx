'use client';
/**
 * Formulário de reunião recorrente (cadastro e "editar ocorrências futuras"),
 * com verificação de conflitos ANTES de salvar.
 */
import { useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Dialog, Field, Input, Select, Textarea, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/client';
import { formatDateShort, formatRange, todayString, weekdayOf } from '@/lib/time';
import { siteConfig } from '@/config/site';
import { ApiErrorAlert, KindBadge, useEquipment, WeekdayPicker, type RoomDto } from './common';

export interface RecurringDto {
  id: string;
  name: string;
  description: string | null;
  publicTitle: string | null;
  showPublicTitle: boolean;
  roomId: string;
  frequency: keyof typeof siteConfig.frequencyLabels;
  interval: number;
  weekdays: number[];
  monthDay: number | null;
  nthWeek: number | null;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
  participants: number;
  equipment: { equipment: { id: string; name: string } }[];
}

interface Preview {
  description: string;
  occurrences: number;
  checkedFrom: string;
  checkedUntil: string;
  nextDates: string[];
  ruleProblems: string[];
  conflicts: { date: string; startTime: string; endTime: string; reasons: { kind: string; title: string; startAt: string; endAt: string }[] }[];
}

export function RecurringFormDialog({
  meeting, rooms, onClose, onSaved,
}: { meeting: RecurringDto | null; rooms: RoomDto[]; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const equipment = useEquipment();
  const today = todayString();
  const [form, setForm] = useState({
    name: meeting?.name ?? '',
    description: meeting?.description ?? '',
    publicTitle: meeting?.publicTitle ?? '',
    showPublicTitle: meeting?.showPublicTitle ?? true,
    roomId: meeting?.roomId ?? '',
    frequency: meeting?.frequency ?? 'WEEKLY',
    interval: String(meeting?.interval ?? 1),
    weekdays: meeting?.weekdays ?? [weekdayOf(today)],
    monthDay: String(meeting?.monthDay ?? Number(today.slice(8))),
    nthWeek: String(meeting?.nthWeek ?? 1),
    startTime: meeting?.startTime ?? '19:00',
    endTime: meeting?.endTime ?? '21:00',
    startDate: meeting?.startDate ?? today,
    endDate: meeting?.endDate ?? '',
    participants: String(meeting?.participants ?? ''),
    equipmentIds: meeting?.equipment.map((e) => e.equipment.id) ?? [],
  });
  const [effectiveFrom, setEffectiveFrom] = useState(today > (meeting?.startDate ?? today) ? today : meeting?.startDate ?? today);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipConflicts, setSkipConflicts] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPreview(null);
    setSkipConflicts(false);
  };

  const data = () => ({
    name: form.name,
    description: form.description || null,
    publicTitle: form.publicTitle || null,
    showPublicTitle: form.showPublicTitle,
    roomId: form.roomId,
    frequency: form.frequency,
    interval: Number(form.interval) || 1,
    weekdays: form.weekdays,
    monthDay: form.frequency === 'MONTHLY_DAY' ? Number(form.monthDay) : null,
    nthWeek: form.frequency === 'MONTHLY_NTH_WEEKDAY' ? Number(form.nthWeek) : null,
    startTime: form.startTime,
    endTime: form.endTime,
    startDate: meeting ? (effectiveFrom > form.startDate ? effectiveFrom : form.startDate) : form.startDate,
    endDate: form.endDate || null,
    participants: Number(form.participants) || 0,
    equipmentIds: form.equipmentIds,
  });

  async function runPreview() {
    setBusy('preview');
    setError(null);
    try {
      setPreview(await api<Preview>('/api/admin/recurring/preview', { body: { data: data(), excludeMeetingId: meeting?.id } }));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setError(null);
    const skipDates = skipConflicts && preview ? preview.conflicts.map((c) => c.date) : [];
    try {
      const result = meeting
        ? await api<{ id: string }>(`/api/admin/recurring/${meeting.id}`, { method: 'PUT', body: { effectiveFrom, data: data(), reason: reason || null, skipDates } })
        : await api<{ id: string }>('/api/admin/recurring', { body: { data: data(), skipDates } });
      toast('success', meeting ? 'Reunião recorrente atualizada.' : 'Reunião recorrente cadastrada. As ocorrências já ocupam a agenda.');
      onSaved(result.id);
    } catch (e) {
      const err = e as ApiError;
      const p = (err.details as { preview?: Preview })?.preview;
      if (p) setPreview(p);
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const fe = error?.fields ?? {};
  const f = (k: string) => fe[k] ?? fe[`data.${k}`];
  const weekly = ['WEEKLY', 'BIWEEKLY', 'CUSTOM'].includes(form.frequency);
  const canSave = preview && preview.ruleProblems.length === 0 && (preview.conflicts.length === 0 || skipConflicts);
  const room = rooms.find((r) => r.id === form.roomId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="xl"
      title={meeting ? `Editar ocorrências futuras — ${meeting.name}` : 'Nova reunião recorrente'}
      description={meeting ? 'As ocorrências anteriores à data escolhida permanecem como estão (histórico preservado).' : 'A sala ficará ocupada automaticamente em todas as ocorrências.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" loading={busy === 'preview'} onClick={runPreview}><CalendarSearch className="h-4 w-4" aria-hidden />Verificar conflitos</Button>
          <Button loading={busy === 'save'} disabled={!canSave} onClick={save} title={!preview ? 'Verifique os conflitos antes de salvar' : undefined}>Salvar</Button>
        </>
      }>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><ApiErrorAlert error={error && error.code !== 'VALIDATION' && error.code !== 'RECURRENCE_CONFLICTS' ? error : null} /></div>
        {error?.code === 'VALIDATION' && <div className="md:col-span-2"><Alert tone="danger">{Object.values(fe)[0] ?? error.message}</Alert></div>}
        {meeting && (
          <>
            <Field label="Aplicar a partir de" htmlFor="rc-efetivo" required hint="Ocorrências antes desta data não mudam.">
              <Input id="rc-efetivo" type="date" min={today} value={effectiveFrom} onChange={(e) => { setEffectiveFrom(e.target.value); setPreview(null); }} />
            </Field>
            <Field label="Motivo da alteração" htmlFor="rc-motivo"><Input id="rc-motivo" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </>
        )}
        <Field label="Nome da reunião" htmlFor="rc-nome" required error={f('name')}><Input id="rc-nome" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Sala" htmlFor="rc-sala" required error={f('roomId')}>
          <Select id="rc-sala" value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
            <option value="">Selecione</option>
            {rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.capacity} pessoas)</option>)}
          </Select>
        </Field>
        <Field label="Descrição" htmlFor="rc-desc" className="md:col-span-2"><Textarea id="rc-desc" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>

        <div className="md:col-span-2 grid gap-4 rounded-xl border border-mist p-4 md:grid-cols-3">
          <Field label="Frequência" htmlFor="rc-freq" required>
            <Select id="rc-freq" value={form.frequency} onChange={(e) => {
              const v = e.target.value as RecurringDto['frequency'];
              setForm((x) => ({ ...x, frequency: v, weekdays: v === 'MONTHLY_NTH_WEEKDAY' ? x.weekdays.slice(0, 1) : x.weekdays }));
              setPreview(null);
            }}>
              {Object.entries(siteConfig.frequencyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {(form.frequency === 'DAILY' || form.frequency === 'CUSTOM' || form.frequency === 'MONTHLY_DAY' || form.frequency === 'MONTHLY_NTH_WEEKDAY') && (
            <Field label={form.frequency === 'DAILY' ? 'A cada quantos dias' : form.frequency === 'CUSTOM' ? 'A cada quantas semanas' : 'A cada quantos meses'} htmlFor="rc-int">
              <Input id="rc-int" type="number" min={1} max={52} value={form.interval} onChange={(e) => set('interval', e.target.value)} />
            </Field>
          )}
          {form.frequency === 'MONTHLY_DAY' && (
            <Field label="Dia do mês" htmlFor="rc-dia" error={f('monthDay')} hint="Meses sem este dia são ignorados.">
              <Input id="rc-dia" type="number" min={1} max={31} value={form.monthDay} onChange={(e) => set('monthDay', e.target.value)} />
            </Field>
          )}
          {form.frequency === 'MONTHLY_NTH_WEEKDAY' && (
            <Field label="Semana do mês" htmlFor="rc-nth" error={f('nthWeek')}>
              <Select id="rc-nth" value={form.nthWeek} onChange={(e) => set('nthWeek', e.target.value)}>
                {[1, 2, 3, 4, -1].map((n) => <option key={n} value={n}>{siteConfig.nthWeekLabels[n]}</option>)}
              </Select>
            </Field>
          )}
          {(weekly || form.frequency === 'MONTHLY_NTH_WEEKDAY') && (
            <div className="md:col-span-3 space-y-1.5">
              <p className="text-sm font-medium">{form.frequency === 'MONTHLY_NTH_WEEKDAY' ? 'Dia da semana' : 'Dias da semana'}</p>
              <WeekdayPicker value={form.weekdays} single={form.frequency === 'MONTHLY_NTH_WEEKDAY'} onChange={(v) => set('weekdays', v)} />
              {f('weekdays') && <p className="text-xs text-danger">{f('weekdays')}</p>}
            </div>
          )}
          <Field label="Início" htmlFor="rc-ini" required><Input id="rc-ini" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
          <Field label="Término" htmlFor="rc-fim" required error={f('endTime')}><Input id="rc-fim" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
          <Field label="Participantes (estimativa)" htmlFor="rc-part" required error={f('participants')} hint={room ? `Capacidade da sala: ${room.capacity}` : undefined}>
            <Input id="rc-part" type="number" min={1} value={form.participants} onChange={(e) => set('participants', e.target.value)} />
          </Field>
          {!meeting && <Field label="Data inicial" htmlFor="rc-dini" required><Input id="rc-dini" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>}
          <Field label="Data final (opcional)" htmlFor="rc-dfim" error={f('endDate')} hint="Em branco = sem data para terminar."><Input id="rc-dfim" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        </div>

        <fieldset className="md:col-span-2 rounded-lg border border-mist p-3">
          <legend className="px-1 text-sm font-medium">Equipamentos necessários</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {equipment.data?.equipment.filter((e) => e.active).map((e) => (
              <Checkbox key={e.id} label={e.name} checked={form.equipmentIds.includes(e.id)}
                onChange={(ev) => set('equipmentIds', ev.target.checked ? [...form.equipmentIds, e.id] : form.equipmentIds.filter((x) => x !== e.id))} />
            ))}
          </div>
        </fieldset>
        <Field label="Título público" htmlFor="rc-pub" hint="Em branco usa o nome da reunião."><Input id="rc-pub" value={form.publicTitle} onChange={(e) => set('publicTitle', e.target.value)} /></Field>
        <div className="flex items-end pb-2"><Checkbox label="Exibir título na página pública" checked={form.showPublicTitle} onChange={(e) => set('showPublicTitle', e.target.checked)} /></div>

        {preview && (
          <div className="md:col-span-2 space-y-3 rounded-xl border border-mist bg-canvas p-4">
            <p className="text-sm"><strong>{preview.description}</strong> — {preview.occurrences} ocorrência(s) verificadas de {formatDateShort(preview.checkedFrom)} a {formatDateShort(preview.checkedUntil)}.</p>
            {preview.nextDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{preview.nextDates.map((d) => <Badge key={d}>{formatDateShort(d)}</Badge>)}{preview.occurrences > preview.nextDates.length && <Badge>…</Badge>}</div>
            )}
            {preview.ruleProblems.length > 0 && (
              <Alert tone="danger" title="Ajuste a regra antes de salvar"><ul className="list-disc pl-4">{preview.ruleProblems.map((p) => <li key={p}>{p}</li>)}</ul></Alert>
            )}
            {preview.conflicts.length === 0 && preview.ruleProblems.length === 0 && <Alert tone="success">Nenhum conflito encontrado. Pode salvar.</Alert>}
            {preview.conflicts.length > 0 && (
              <Alert tone="warning" title={`${preview.conflicts.length} data(s) com conflito`}>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                  {preview.conflicts.map((c) => (
                    <li key={c.date}>
                      <strong>{formatDateShort(c.date)}</strong>:{' '}
                      {c.reasons.map((r, i) => <span key={i} className="mr-2"><KindBadge kind={r.kind} /> {r.title} ({formatRange(r.startAt, r.endAt)})</span>)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Uma reunião recorrente nunca substitui reservas existentes. Ajuste a regra ou confirme que essas datas ficarão de fora.</p>
                <Checkbox className="mt-2" label="Salvar sem reservar as datas conflitantes" checked={skipConflicts} onChange={(e) => setSkipConflicts(e.target.checked)} />
              </Alert>
            )}
          </div>
        )}
        {!preview && <p className="md:col-span-2 text-xs text-ink-soft">Clique em “Verificar conflitos” para conferir as datas antes de salvar.</p>}
      </div>
    </Dialog>
  );
}
