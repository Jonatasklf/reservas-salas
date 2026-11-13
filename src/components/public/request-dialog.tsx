'use client';
/**
 * Formulário público de solicitação de reserva (janela modal).
 *
 * Validação em duas camadas: aqui no navegador (resposta imediata) e
 * novamente no servidor (regra oficial). Para adicionar um campo, veja a
 * seção "Como alterar o formulário de solicitação" no README.
 */
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/client';
import { capacityMessage } from '@/server/availability';
import { formatDateShort, formatDateTime, formatTime, todayString } from '@/lib/time';
import { publicRequestSchema } from '@/lib/validation';
import { siteConfig } from '@/config/site';
import type { PublicSettings } from '@/server/services/settings';
import { timeOptions } from './time-options';

export interface RequestPrefill {
  room: { id: string; name: string; capacity: number; equipment: { id: string; key: string; name: string }[] };
  date: string;
  startTime: string;
  endTime: string;
  participants: string;
  needsProjector: boolean;
  equipmentIds: string[];
}

interface Success {
  protocol: string;
  accessCode: string;
  receivedAt: string;
  warnings: string[];
  hasCompetition: boolean;
  emailStatus: 'sent' | 'failed' | 'not_configured' | 'not_requested';
  email: string | null;
}

type Alternative = { id: string; name: string; capacity: number; location: string | null };

export function RequestDialog({
  prefill,
  settings,
  equipment,
  onClose,
  onSubmitted,
  onSwitchRoom,
}: {
  prefill: RequestPrefill;
  settings: PublicSettings;
  equipment: { id: string; key: string; name: string }[];
  onClose: () => void;
  onSubmitted: () => void;
  onSwitchRoom: (roomId: string) => void;
}) {
  const { room } = prefill;
  const [form, setForm] = useState({
    requesterName: '',
    purpose: '',
    date: prefill.date,
    startTime: prefill.startTime,
    endTime: prefill.endTime,
    participants: prefill.participants,
    needsProjector: prefill.needsProjector,
    equipmentIds: prefill.equipmentIds,
    otherEquipmentNotes: '',
    contactPhone: '',
    contactEmail: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<{ message: string; alternatives: Alternative[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Success | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const participants = Number(form.participants);
  const overCapacity = participants > room.capacity;
  const roomHasProjector = room.equipment.some((e) => e.key === 'projetor');
  const otherEquipment = equipment.filter((e) => e.key !== 'projetor');
  const missing = form.equipmentIds.filter((id) => !room.equipment.some((e) => e.id === id));
  const times = timeOptions(settings.defaultOpenTime, settings.defaultCloseTime);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload = {
      ...form,
      roomId: room.id,
      participants: form.participants === '' ? undefined : participants,
      contactPhone: form.contactPhone || null,
      contactEmail: form.contactEmail || null,
      otherEquipmentNotes: form.otherEquipmentNotes || null,
    };
    const parsed = publicRequestSchema.safeParse(payload);
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) fieldErrors[i.path.join('.')] ||= i.message;
    if (overCapacity) fieldErrors.participants = capacityMessage(room.capacity);
    if (form.date && form.date < todayString()) fieldErrors.date = 'Não é possível reservar datas que já passaram.';
    if (Object.keys(fieldErrors).length || !parsed.success) {
      setErrors(fieldErrors);
      document.getElementById(`r-${Object.keys(fieldErrors)[0]}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<Success>('/api/public/requests', { body: parsed.data });
      setSuccess(result);
      onSubmitted();
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'VALIDATION') setErrors(e.fields);
      setServerError({
        message: e.message,
        alternatives: ((e.details as { alternatives?: Alternative[] })?.alternatives) ?? [],
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    const text = `Protocolo: ${success.protocol}\nCódigo de acesso: ${success.accessCode}`;
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title="Solicitação enviada" size="md"
        footer={<><Link href="/protocolo" className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-primary hover:bg-primary-soft">Consultar situação</Link><Button onClick={onClose}>Concluir</Button></>}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-success-soft p-4 text-success">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Pedido recebido e encaminhado para análise.</p>
              <p className="mt-1 text-sm text-ink/80">
                Importante: o envio <strong>não significa que a reserva foi aprovada</strong>. Acompanhe a situação pelo protocolo.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-mist p-4 text-sm">
            <div><dt className="text-ink-soft">Protocolo</dt><dd className="text-lg font-semibold tabular-nums text-primary">{success.protocol}</dd></div>
            <div><dt className="text-ink-soft">Código de acesso</dt><dd className="font-mono text-lg font-semibold tracking-wider text-primary">{success.accessCode}</dd></div>
            <div><dt className="text-ink-soft">Recebido em</dt><dd>{formatDateTime(success.receivedAt)}</dd></div>
            <div><dt className="text-ink-soft">Situação</dt><dd><Badge tone="warning">{siteConfig.requestStatusLabels.PENDING}</Badge></dd></div>
          </dl>
          <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); }}>
            <Copy className="h-4 w-4" aria-hidden />{copied ? 'Copiado!' : 'Copiar protocolo e código'}
          </Button>
          <Alert tone="info">Anote o protocolo e o código de acesso. Eles são necessários para consultar a situação do pedido.</Alert>
          {success.hasCompetition && (
            <Alert tone="warning">Já existe outro pedido em análise para este mesmo horário. A administração analisa os pedidos por ordem de chegada.</Alert>
          )}
          {success.emailStatus === 'sent' && (
            <Alert tone="success">Enviamos o protocolo e o código de acesso para <strong>{success.email}</strong>. Verifique também a caixa de spam.</Alert>
          )}
          {(success.emailStatus === 'failed' || success.emailStatus === 'not_configured') && (
            <Alert tone="warning">Não foi possível enviar o e-mail de confirmação agora. Anote ou copie o protocolo e o código acima.</Alert>
          )}
          {success.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Solicitar reserva — ${room.name}`}
      description={`Capacidade máxima: ${room.capacity} pessoas. Campos com * são obrigatórios.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-solicitacao" loading={submitting} disabled={overCapacity}>Enviar solicitação</Button>
        </>
      }
    >
      <form id="form-solicitacao" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {serverError && (
          <div className="sm:col-span-2 space-y-2">
            <Alert tone="danger" title="Não foi possível enviar">{serverError.message}</Alert>
            {serverError.alternatives.length > 0 && (
              <div className="rounded-lg border border-mist p-3">
                <p className="mb-2 text-sm font-medium">Salas disponíveis neste horário:</p>
                <div className="flex flex-wrap gap-2">
                  {serverError.alternatives.map((a) => (
                    <Button key={a.id} variant="secondary" size="sm" onClick={() => { setServerError(null); onSwitchRoom(a.id); }}>
                      {a.name} ({a.capacity} pessoas)
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Field label="Nome completo" htmlFor="r-requesterName" required error={errors.requesterName} className="sm:col-span-2">
          <Input id="r-requesterName" autoComplete="name" value={form.requesterName} aria-invalid={Boolean(errors.requesterName)} onChange={(e) => set('requesterName', e.target.value)} />
        </Field>
        <Field label="Motivo ou finalidade da reunião" htmlFor="r-purpose" required error={errors.purpose} className="sm:col-span-2">
          <Textarea id="r-purpose" maxLength={siteConfig.requestForm.purposeMaxLength} value={form.purpose} aria-invalid={Boolean(errors.purpose)} onChange={(e) => set('purpose', e.target.value)} />
        </Field>
        <Field label="Data" htmlFor="r-date" required error={errors.date}>
          <Input id="r-date" type="date" min={todayString()} value={form.date} aria-invalid={Boolean(errors.date)} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field
          label="Quantidade de participantes"
          htmlFor="r-participants"
          required
          error={errors.participants || (overCapacity ? capacityMessage(room.capacity) : undefined)}
        >
          <Input id="r-participants" type="number" min={1} max={room.capacity} inputMode="numeric" value={form.participants} aria-invalid={Boolean(errors.participants || overCapacity)} onChange={(e) => set('participants', e.target.value)} />
        </Field>
        <Field label="Horário de início" htmlFor="r-startTime" required error={errors.startTime}>
          <Select id="r-startTime" value={form.startTime} aria-invalid={Boolean(errors.startTime)} onChange={(e) => set('startTime', e.target.value)}>
            <option value="">Selecione</option>
            {times.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </Select>
        </Field>
        <Field label="Horário de término" htmlFor="r-endTime" required error={errors.endTime}>
          <Select id="r-endTime" value={form.endTime} aria-invalid={Boolean(errors.endTime)} onChange={(e) => set('endTime', e.target.value)}>
            <option value="">Selecione</option>
            {times.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </Select>
        </Field>

        <fieldset className="sm:col-span-2 space-y-2 rounded-lg border border-mist p-3">
          <legend className="px-1 text-sm font-medium">Equipamentos</legend>
          <div className="flex flex-wrap items-center gap-4" role="radiogroup" aria-label="Necessidade de projetor">
            <span className="text-sm">Precisa de projetor? <span className="text-danger">*</span></span>
            <label className="inline-flex items-center gap-1.5 text-sm"><input type="radio" name="projetor" className="accent-[var(--color-primary)]" checked={form.needsProjector} onChange={() => set('needsProjector', true)} />Sim</label>
            <label className="inline-flex items-center gap-1.5 text-sm"><input type="radio" name="projetor" className="accent-[var(--color-primary)]" checked={!form.needsProjector} onChange={() => set('needsProjector', false)} />Não</label>
          </div>
          {form.needsProjector && !roomHasProjector && (
            <p className="text-xs text-warning">Esta sala não possui projetor cadastrado. O pedido será analisado pela administração.</p>
          )}
          {otherEquipment.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              {otherEquipment.map((e) => (
                <Checkbox
                  key={e.id}
                  label={<>{e.name}{!room.equipment.some((x) => x.id === e.id) && <span className="text-xs text-ink-soft"> (não disponível nesta sala)</span>}</>}
                  checked={form.equipmentIds.includes(e.id)}
                  onChange={(ev) => set('equipmentIds', ev.target.checked ? [...form.equipmentIds, e.id] : form.equipmentIds.filter((x) => x !== e.id))}
                />
              ))}
            </div>
          )}
          {missing.length > 0 && <p className="text-xs text-warning">Equipamentos não disponíveis nesta sala exigirão análise administrativa.</p>}
          <Field label="Outras necessidades (opcional)" htmlFor="r-otherEquipmentNotes" error={errors.otherEquipmentNotes}>
            <Input id="r-otherEquipmentNotes" placeholder="Descreva, se necessário" value={form.otherEquipmentNotes} onChange={(e) => set('otherEquipmentNotes', e.target.value)} />
          </Field>
        </fieldset>

        <p className="sm:col-span-2 -mb-2 text-sm font-medium">Contato para retorno <span className="font-normal text-ink-soft">(informe pelo menos um)</span></p>
        <Field label="Telefone" htmlFor="r-contactPhone" error={errors.contactPhone}>
          <Input id="r-contactPhone" type="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={form.contactPhone} aria-invalid={Boolean(errors.contactPhone)} onChange={(e) => set('contactPhone', e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="r-contactEmail" error={errors.contactEmail} hint="Recomendado: você receberá o protocolo por e-mail.">
          <Input id="r-contactEmail" type="email" autoComplete="email" placeholder="nome@exemplo.com" value={form.contactEmail} aria-invalid={Boolean(errors.contactEmail)} onChange={(e) => set('contactEmail', e.target.value)} />
        </Field>

        <p className="sm:col-span-2 text-xs text-ink-soft">
          Seus dados de contato são usados apenas para retorno sobre este pedido e ficam visíveis somente à administração.
          {form.date && ` Data escolhida: ${formatDateShort(form.date)}.`}
        </p>
      </form>
    </Dialog>
  );
}
