/**
 * Esquemas de validação (zod) compartilhados entre o frontend e o backend.
 * O servidor SEMPRE revalida os dados com estes mesmos esquemas.
 */
import { z } from 'zod';
import { isValidDateString, isValidTimeString, timeToMinutes } from './time';
import { siteConfig } from '@/config/site';

// Mensagens padrão do zod em português (as mensagens personalizadas abaixo têm prioridade).
z.config(z.locales.pt());

const msgRequired = 'Campo obrigatório.';

export const dateStr = z
  .string({ error: msgRequired })
  .refine(isValidDateString, 'Data inválida (use o formato AAAA-MM-DD).');
export const timeStr = z
  .string({ error: msgRequired })
  .refine(isValidTimeString, 'Horário inválido (use o formato HH:MM).');
const text = (max: number) => z.string({ error: msgRequired }).trim().max(max, `Máximo de ${max} caracteres.`);
const requiredText = (max: number) => text(max).min(1, msgRequired);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const intFrom = (min: number, max: number) =>
  z.coerce
    .number({ error: 'Informe um número.' })
    .int('Informe um número inteiro.')
    .min(min, `O valor mínimo é ${min}.`)
    .max(max, `O valor máximo é ${max}.`);
const ids = z.array(z.string().min(1)).max(50).default([]);
const weekdays = z.array(z.number().int().min(0).max(6)).max(7);

function endAfterStart<T extends { startTime: string; endTime: string }>(v: T) {
  return !isValidTimeString(v.startTime) || !isValidTimeString(v.endTime) || timeToMinutes(v.endTime) > timeToMinutes(v.startTime);
}
const endAfterStartMsg = { message: 'O horário de término deve ser posterior ao horário de início.', path: ['endTime'] };

// -----------------------------------------------------------------------------
// Solicitação pública
// -----------------------------------------------------------------------------
export const publicRequestSchema = z
  .object({
    requesterName: requiredText(siteConfig.requestForm.nameMaxLength).refine(
      (v) => v.split(/\s+/).filter(Boolean).length >= 2,
      'Informe o nome completo (nome e sobrenome).',
    ),
    purpose: requiredText(siteConfig.requestForm.purposeMaxLength),
    roomId: z.string({ error: 'Selecione uma sala.' }).min(1, 'Selecione uma sala.'),
    date: dateStr,
    startTime: timeStr,
    endTime: timeStr,
    participants: intFrom(1, 10000),
    needsProjector: z.boolean().default(false),
    equipmentIds: ids,
    otherEquipmentNotes: optionalText(500),
    contactPhone: optionalText(30).refine(
      (v) => !v || v.replace(/\D/g, '').length >= 10,
      'Telefone inválido. Inclua o DDD (ex.: 11 91234-5678).',
    ),
    contactEmail: optionalText(160).refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido.'),
  })
  .refine(endAfterStart, endAfterStartMsg)
  .refine((v) => v.contactPhone || v.contactEmail, {
    message: 'Informe pelo menos um contato: telefone ou e-mail.',
    path: ['contactPhone'],
  });
export type PublicRequestInput = z.infer<typeof publicRequestSchema>;

export const protocolLookupSchema = z.object({
  protocol: z.string().trim().toUpperCase().min(4, msgRequired).max(40),
  code: z.string().trim().toUpperCase().min(4, msgRequired).max(20),
});

export const availabilityQuerySchema = z.object({
  date: dateStr,
  startTime: timeStr.optional(),
  endTime: timeStr.optional(),
  participants: z.coerce.number().int().min(1).optional(),
  equipment: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : [])),
});

export const rangeQuerySchema = z.object({ from: dateStr, to: dateStr });

// -----------------------------------------------------------------------------
// Administração
// -----------------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(1, msgRequired).max(200),
});

export const roomSchema = z
  .object({
    name: requiredText(120),
    description: optionalText(1000),
    location: optionalText(200),
    capacity: intFrom(1, 10000),
    openTime: timeStr.nullable().optional().transform((v) => v ?? null),
    closeTime: timeStr.nullable().optional().transform((v) => v ?? null),
    weekdays: weekdays.min(1, 'Selecione pelo menos um dia de funcionamento.').default([0, 1, 2, 3, 4, 5, 6]),
    adminNotes: optionalText(2000),
    active: z.boolean().default(true),
    sortOrder: z.coerce.number().int().default(0),
    equipment: z.array(z.object({ equipmentId: z.string().min(1), quantity: intFrom(1, 999).default(1) })).default([]),
    /** Confirma a operação mesmo com avisos (ex.: desativar sala com reservas futuras). */
    confirm: z.boolean().optional(),
  })
  .refine((v) => (v.openTime === null) === (v.closeTime === null), {
    message: 'Informe abertura e fechamento, ou deixe ambos em branco para usar o padrão.',
    path: ['closeTime'],
  })
  .refine((v) => !v.openTime || !v.closeTime || timeToMinutes(v.closeTime) > timeToMinutes(v.openTime), {
    message: 'O fechamento deve ser posterior à abertura.',
    path: ['closeTime'],
  });
export type RoomInput = z.infer<typeof roomSchema>;

export const equipmentSchema = z.object({
  name: requiredText(80),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]*$/, 'Use apenas letras minúsculas, números e hífen.')
    .max(40)
    .optional(),
  description: optionalText(300),
  active: z.boolean().default(true),
});

export const adminReservationSchema = z
  .object({
    roomId: z.string({ error: 'Selecione uma sala.' }).min(1, 'Selecione uma sala.'),
    title: requiredText(160),
    publicTitle: optionalText(160),
    showPublicTitle: z.boolean().default(false),
    responsible: requiredText(120),
    date: dateStr,
    startTime: timeStr,
    endTime: timeStr,
    participants: intFrom(1, 10000),
    equipmentIds: ids,
    notes: optionalText(2000),
    reason: optionalText(500),
  })
  .refine(endAfterStart, endAfterStartMsg);
export type AdminReservationInput = z.infer<typeof adminReservationSchema>;

export const cancelSchema = z.object({ reason: requiredText(500) });

export const recurringSchema = z
  .object({
    name: requiredText(160),
    description: optionalText(1000),
    publicTitle: optionalText(160),
    showPublicTitle: z.boolean().default(true),
    roomId: z.string({ error: 'Selecione uma sala.' }).min(1, 'Selecione uma sala.'),
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY_DAY', 'MONTHLY_NTH_WEEKDAY', 'CUSTOM']),
    interval: intFrom(1, 52).default(1),
    weekdays: weekdays.default([]),
    monthDay: z.coerce.number().int().min(1).max(31).nullable().optional().transform((v) => v ?? null),
    nthWeek: z.coerce
      .number()
      .int()
      .refine((v) => [1, 2, 3, 4, -1].includes(v), 'Semana inválida.')
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    startTime: timeStr,
    endTime: timeStr,
    startDate: dateStr,
    endDate: dateStr.nullable().optional().transform((v) => v ?? null),
    participants: intFrom(1, 10000),
    equipmentIds: ids,
  })
  .refine(endAfterStart, endAfterStartMsg)
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'A data final deve ser posterior à inicial.', path: ['endDate'] })
  .refine((v) => !['WEEKLY', 'BIWEEKLY', 'CUSTOM'].includes(v.frequency) || v.weekdays.length > 0, {
    message: 'Selecione pelo menos um dia da semana.',
    path: ['weekdays'],
  })
  .refine((v) => v.frequency !== 'MONTHLY_DAY' || v.monthDay, { message: 'Informe o dia do mês.', path: ['monthDay'] })
  .refine((v) => v.frequency !== 'MONTHLY_NTH_WEEKDAY' || (v.nthWeek && v.weekdays.length === 1), {
    message: 'Escolha a semana do mês e exatamente um dia da semana.',
    path: ['nthWeek'],
  });
export type RecurringInput = z.infer<typeof recurringSchema>;

/** Edição de "todas as ocorrências a partir de" uma data. */
export const recurringUpdateSchema = z.object({
  effectiveFrom: dateStr,
  data: recurringSchema,
  reason: optionalText(500),
});

export const occurrenceExceptionSchema = z
  .object({
    originalDate: dateStr,
    type: z.enum(['CANCELLED', 'MODIFIED']),
    newRoomId: z.string().min(1).nullable().optional().transform((v) => v ?? null),
    newStartTime: timeStr.nullable().optional().transform((v) => v ?? null),
    newEndTime: timeStr.nullable().optional().transform((v) => v ?? null),
    reason: optionalText(500),
  })
  .refine((v) => v.type === 'CANCELLED' || v.newRoomId || v.newStartTime || v.newEndTime, {
    message: 'Informe a nova sala e/ou o novo horário.',
    path: ['newRoomId'],
  })
  .refine(
    (v) => !v.newStartTime || !v.newEndTime || timeToMinutes(v.newEndTime) > timeToMinutes(v.newStartTime),
    { message: 'O horário de término deve ser posterior ao de início.', path: ['newEndTime'] },
  );

export const suspendSchema = z
  .object({
    from: dateStr,
    until: dateStr.nullable().optional().transform((v) => v ?? null),
    reason: optionalText(500),
  })
  .refine((v) => !v.until || v.until >= v.from, { message: 'A data final deve ser posterior à inicial.', path: ['until'] });

export const endSeriesSchema = z.object({ endDate: dateStr, reason: optionalText(500) });

export const blockSchema = z
  .object({
    roomId: z.string().min(1).nullable().optional().transform((v) => v ?? null),
    title: requiredText(160),
    type: z.enum(['HOLIDAY', 'MAINTENANCE', 'OTHER']),
    startDate: dateStr,
    startTime: timeStr.default('00:00'),
    endDate: dateStr,
    endTime: timeStr.default('23:59'),
    notes: optionalText(1000),
    confirm: z.boolean().optional(),
  })
  .refine((v) => `${v.endDate}T${v.endTime}` > `${v.startDate}T${v.startTime}`, {
    message: 'O fim do bloqueio deve ser posterior ao início.',
    path: ['endDate'],
  });

export const decisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    /** Obrigatória quando existe pedido mais antigo concorrente pendente. */
    priorityJustification: optionalText(500),
    publicMessage: optionalText(1000),
    publicTitle: optionalText(160),
    showPublicTitle: z.boolean().default(false),
  }),
  z.object({ action: z.literal('reject'), reason: requiredText(1000), publicMessage: optionalText(1000) }),
  z.object({ action: z.literal('request_info'), message: requiredText(1000) }),
  z.object({ action: z.literal('suggest'), suggestion: requiredText(1000) }),
  z.object({ action: z.literal('cancel'), reason: requiredText(1000) }),
  z.object({ action: z.literal('reopen'), note: optionalText(1000) }),
  z.object({ action: z.literal('note'), note: requiredText(1000) }),
]);
export type DecisionInput = z.infer<typeof decisionSchema>;

export const settingsSchema = z
  .object({
    unitName: requiredText(120),
    headerSubtitle: optionalText(200),
    footerText: optionalText(500),
    defaultOpenTime: timeStr,
    defaultCloseTime: timeStr,
    minAdvanceMinutes: intFrom(0, 60 * 24 * 30),
    maxAdvanceDays: intFrom(1, 3650),
    showPublicTitles: z.boolean(),
    emailNotifications: z.boolean(),
    notificationEmail: optionalText(160).refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido.'),
  })
  .refine((v) => timeToMinutes(v.defaultCloseTime) > timeToMinutes(v.defaultOpenTime), {
    message: 'O fechamento deve ser posterior à abertura.',
    path: ['defaultCloseTime'],
  });

export const adminCreateSchema = z.object({
  name: requiredText(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, msgRequired),
  newPassword: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(200),
});
