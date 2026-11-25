/**
 * SOLICITAÇÕES DE RESERVA E FILA CRONOLÓGICA
 * =============================================================================
 * Fluxo:
 *   1. Público envia o pedido → validado com as mesmas regras de
 *      disponibilidade → gravado como PENDING com `receivedAt` (relógio do
 *      servidor) e `sequence` (número crescente do banco).
 *   2. A fila administrativa é ordenada por `sequence` (mais antigo primeiro).
 *   3. Pedidos sobrepostos na mesma sala são marcados como "concorrentes".
 *   4. Aprovar = criar uma Reservation CONFIRMED dentro de uma transação que
 *      trava a sala (advisory lock). A restrição de exclusão do banco é a
 *      última barreira contra duas reservas sobrepostas.
 *   5. Aprovar um pedido posterior enquanto um anterior concorrente está
 *      pendente exige justificativa, registrada no histórico.
 *   6. Após aprovar, os demais pedidos conflitantes são marcados como
 *      "perderam a disponibilidade".
 * =============================================================================
 */
import crypto from 'node:crypto';
import type { Prisma, RequestStatus } from '@prisma/client';
import { prisma, transaction, lockRooms, type Db } from '@/lib/db';
import { AppError, conflict, notFound } from '@/lib/errors';
import { sendEmail } from '@/lib/email';
import { adminNewRequestEmail, requestReceivedEmail, requestUpdateEmail } from '../emails';
import { deliverToRequester, type DeliveryReport } from '../notifications';
import { requestReceivedWhatsApp, requestUpdateWhatsApp } from '../whatsapp-mensagens';
import { utcToDateString, zonedToUtc } from '@/lib/time';
import { siteConfig } from '@/config/site';
import type { DecisionInput, PublicRequestInput } from '@/lib/validation';
import { checkRoomAvailability, findCompetingRequests, overlaps } from '../availability';
import { loadBusySlots } from '../occupancy';
import { assertAvailable, evaluateBooking } from './booking';
import { audit } from './audit';
import { getSettings } from './settings';
import { toRoomRules } from './rooms';

export const OPEN_STATUSES: RequestStatus[] = ['PENDING', 'AWAITING_INFO'];
const statusLabel = (s: RequestStatus) => siteConfig.requestStatusLabels[s];

// -----------------------------------------------------------------------------
// Protocolo e código de acesso
// -----------------------------------------------------------------------------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

export function generateAccessCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function hashAccessCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function formatProtocol(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}

// -----------------------------------------------------------------------------
// Criação (área pública)
// -----------------------------------------------------------------------------
export interface CreateRequestResult {
  protocol: string;
  accessCode: string;
  receivedAt: Date;
  status: RequestStatus;
  warnings: string[];
  hasCompetition: boolean;
  /** Por onde o protocolo foi enviado (WhatsApp e/ou e-mail). */
  delivery: DeliveryReport;
}

export async function createPublicRequest(input: PublicRequestInput, now: Date = new Date()): Promise<CreateRequestResult> {
  const room = await prisma.room.findUnique({ where: { id: input.roomId }, include: { equipment: true } });
  if (!room) throw notFound('Sala');

  const startAt = zonedToUtc(input.date, input.startTime);
  const endAt = zonedToUtc(input.date, input.endTime);

  // Equipamentos: devem existir e estar ativos. Os que a sala não possui
  // ficam registrados como "exigem análise administrativa".
  const equipmentIds = [...new Set(input.equipmentIds)];
  const equipment = equipmentIds.length
    ? await prisma.equipment.findMany({ where: { id: { in: equipmentIds }, active: true } })
    : [];
  if (equipment.length !== equipmentIds.length) {
    throw new AppError(400, 'INVALID_EQUIPMENT', 'Um ou mais equipamentos selecionados não estão disponíveis no sistema.');
  }
  const roomEquipmentIds = new Set(room.equipment.map((e) => e.equipmentId));
  const warnings: string[] = [];
  const missing = equipment.filter((e) => !roomEquipmentIds.has(e.id));
  if (missing.length) {
    warnings.push(`A sala não possui: ${missing.map((e) => e.name).join(', ')}. O pedido será analisado pela administração.`);
  }
  if (input.needsProjector) {
    const projector = await prisma.equipment.findUnique({ where: { key: 'projetor' } });
    if (!projector || !roomEquipmentIds.has(projector.id)) {
      warnings.push('Esta sala não possui projetor cadastrado. A necessidade será analisada pela administração.');
    }
  }
  if (input.otherEquipmentNotes) warnings.push('Outros equipamentos descritos serão analisados pela administração.');

  const result = await evaluateBooking(prisma, { room, startAt, endAt, participants: input.participants, now, publicRequest: true });
  if (!result.available) {
    const alternatives = await findAlternativeRooms(prisma, room.id, startAt, endAt, input.participants, now);
    assertAvailable(result, { alternatives }, { publicView: true });
  }

  const accessCode = generateAccessCode();
  const created = await transaction(async (tx) => {
    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"ReservationRequest"', 'sequence'))`;
    const sequence = Number(nextval);
    const protocol = formatProtocol(Number(utcToDateString(now).slice(0, 4)), sequence);
    const req = await tx.reservationRequest.create({
      data: {
        sequence,
        protocol,
        accessCodeHash: hashAccessCode(accessCode),
        requesterName: input.requesterName,
        purpose: input.purpose,
        roomId: room.id,
        startAt,
        endAt,
        participants: input.participants,
        needsProjector: input.needsProjector,
        otherEquipmentNotes: input.otherEquipmentNotes,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        equipment: { create: equipmentIds.map((equipmentId) => ({ equipmentId })) },
      },
    });
    await audit(tx, {
      action: 'REQUEST_RECEIVED', entityType: 'ReservationRequest', entityId: req.id,
      summary: `Solicitação recebida pela página pública${warnings.length ? ' (exige análise de equipamentos)' : ''}.`,
    });
    return req;
  });

  const competing = await prisma.reservationRequest.count({
    where: { id: { not: created.id }, roomId: room.id, status: { in: OPEN_STATUSES }, startAt: { lt: endAt }, endAt: { gt: startAt } },
  });

  // Confirmação ao solicitante (protocolo + código) pelo canal configurado
  // (WhatsApp, e-mail ou ambos, com o outro como reserva) e aviso à administração.
  const settings = await getSettings();
  const info = { protocol: created.protocol, requesterName: created.requesterName, roomName: room.name, startAt, endAt, participants: created.participants };
  const delivery = await deliverToRequester(
    settings,
    { phone: created.contactPhone, email: created.contactEmail },
    {
      whatsapp: () => requestReceivedWhatsApp(settings.unitName, info, accessCode),
      email: (to) => requestReceivedEmail(settings.unitName, to, info, accessCode),
    },
  );
  if (settings.emailNotifications && settings.notificationEmail) {
    void sendEmail(adminNewRequestEmail(settings.unitName, settings.notificationEmail, info));
  }

  return {
    protocol: created.protocol,
    accessCode,
    receivedAt: created.receivedAt,
    status: created.status,
    warnings,
    hasCompetition: competing > 0,
    delivery,
  };
}

/** Outras salas ativas que comportam o pedido no mesmo horário. */
export async function findAlternativeRooms(db: Db, excludeRoomId: string, startAt: Date, endAt: Date, participants: number, now = new Date()) {
  const settings = await getSettings(db);
  const rooms = await db.room.findMany({ where: { active: true, id: { not: excludeRoomId }, capacity: { gte: participants } } });
  if (!rooms.length) return [];
  const busy = await loadBusySlots(db, { from: startAt, to: endAt, roomIds: rooms.map((r) => r.id) });
  return rooms
    .filter(
      (r) =>
        checkRoomAvailability({
          room: toRoomRules(r), startAt, endAt, participants, busy, now,
          hours: { defaultOpenTime: settings.defaultOpenTime, defaultCloseTime: settings.defaultCloseTime },
        }).available,
    )
    .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, location: r.location }));
}

// -----------------------------------------------------------------------------
// Consulta pública pelo protocolo (exige o código de acesso)
// -----------------------------------------------------------------------------
export async function lookupProtocol(protocol: string, code: string) {
  const req = await prisma.reservationRequest.findUnique({ where: { protocol }, include: { room: { select: { name: true, location: true } } } });
  const expected = Buffer.from(req?.accessCodeHash ?? '0'.repeat(64), 'hex');
  const given = Buffer.from(hashAccessCode(code), 'hex');
  // Comparação em tempo constante; mesma resposta para "não existe" e "código errado".
  if (!req || !crypto.timingSafeEqual(expected, given)) {
    throw new AppError(404, 'NOT_FOUND', 'Protocolo ou código de acesso não conferem.');
  }
  return {
    protocol: req.protocol,
    status: req.status,
    statusLabel: statusLabel(req.status),
    room: req.room.name,
    location: req.room.location,
    startAt: req.startAt,
    endAt: req.endAt,
    participants: req.participants,
    receivedAt: req.receivedAt,
    decidedAt: req.decidedAt,
    publicMessage: req.publicMessage,
    suggestion: req.suggestion,
  };
}

// -----------------------------------------------------------------------------
// Fila administrativa
// -----------------------------------------------------------------------------
export interface QueueFilters {
  statuses?: RequestStatus[];
  roomId?: string;
  from?: string;
  to?: string;
  search?: string;
}

const queueInclude = {
  room: { select: { id: true, name: true, capacity: true, active: true } },
  equipment: { include: { equipment: { select: { id: true, name: true } } } },
} satisfies Prisma.ReservationRequestInclude;

export async function listQueue(filters: QueueFilters = {}) {
  const where: Prisma.ReservationRequestWhereInput = {
    status: filters.statuses?.length ? { in: filters.statuses } : undefined,
    roomId: filters.roomId || undefined,
    startAt: filters.from ? { gte: zonedToUtc(filters.from, '00:00') } : undefined,
    AND: filters.to ? [{ startAt: { lt: zonedToUtc(filters.to, '23:59') } }] : undefined,
    OR: filters.search
      ? [
          { requesterName: { contains: filters.search, mode: 'insensitive' } },
          { protocol: { contains: filters.search, mode: 'insensitive' } },
          { purpose: { contains: filters.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  // Ordem cronológica de recebimento: sequence crescente.
  const requests = await prisma.reservationRequest.findMany({ where, include: queueInclude, orderBy: { sequence: 'asc' }, take: 500 });

  // Concorrência e disponibilidade atual, calculadas para os pedidos em aberto.
  const open = await prisma.reservationRequest.findMany({
    where: { status: { in: OPEN_STATUSES } },
    select: { id: true, roomId: true, startAt: true, endAt: true, sequence: true, protocol: true },
  });
  const competing = findCompetingRequests(open);
  const availability = await currentAvailability(requests.filter((r) => OPEN_STATUSES.includes(r.status)));

  return requests.map((r) => {
    const rivals = competing.get(r.id) ?? [];
    return {
      ...r,
      accessCodeHash: undefined,
      competitors: rivals.map((c) => ({ id: c.id, protocol: c.protocol, sequence: c.sequence })),
      isOldestInCompetition: rivals.every((c) => c.sequence > r.sequence),
      currentIssues: availability.get(r.id) ?? [],
    };
  });
}

/** Reavalia se cada pedido em aberto ainda cabe na agenda atual. */
async function currentAvailability(requests: { id: string; roomId: string; startAt: Date; endAt: Date; participants: number }[]) {
  const map = new Map<string, { reason: string; message: string }[]>();
  if (!requests.length) return map;
  const settings = await getSettings();
  const from = new Date(Math.min(...requests.map((r) => r.startAt.getTime())));
  const to = new Date(Math.max(...requests.map((r) => r.endAt.getTime())));
  const roomIds = [...new Set(requests.map((r) => r.roomId))];
  const [busy, rooms] = await Promise.all([
    loadBusySlots(prisma, { from, to, roomIds }),
    prisma.room.findMany({ where: { id: { in: roomIds } } }),
  ]);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  for (const r of requests) {
    const room = byId.get(r.roomId);
    if (!room) continue;
    const res = checkRoomAvailability({
      room: toRoomRules(room), startAt: r.startAt, endAt: r.endAt, participants: r.participants, busy,
      hours: { defaultOpenTime: settings.defaultOpenTime, defaultCloseTime: settings.defaultCloseTime },
    });
    map.set(r.id, res.issues.map((i) => ({ reason: i.reason, message: i.message })));
  }
  return map;
}

export async function getRequestDetail(id: string) {
  const req = await prisma.reservationRequest.findUnique({ where: { id }, include: { ...queueInclude, reservation: true } });
  if (!req) throw notFound('Solicitação');
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'ReservationRequest', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { admin: { select: { name: true } } },
  });
  const competitors = await prisma.reservationRequest.findMany({
    where: { id: { not: id }, roomId: req.roomId, status: { in: OPEN_STATUSES }, startAt: { lt: req.endAt }, endAt: { gt: req.startAt } },
    select: { id: true, protocol: true, sequence: true, requesterName: true, receivedAt: true, status: true },
    orderBy: { sequence: 'asc' },
  });
  const availability = OPEN_STATUSES.includes(req.status) ? (await currentAvailability([req])).get(req.id) ?? [] : [];
  const alternatives = OPEN_STATUSES.includes(req.status)
    ? await findAlternativeRooms(prisma, req.roomId, req.startAt, req.endAt, req.participants)
    : [];
  return { ...req, accessCodeHash: undefined, history, competitors, currentIssues: availability, alternatives };
}

// -----------------------------------------------------------------------------
// Decisões administrativas
// -----------------------------------------------------------------------------
export async function decideRequest(id: string, input: DecisionInput, adminId: string) {
  switch (input.action) {
    case 'approve':
      return approveRequest(id, input, adminId);
    case 'reject':
      return simpleTransition(id, adminId, {
        allowed: OPEN_STATUSES, to: 'REJECTED', action: 'REQUEST_REJECTED',
        summary: `Solicitação rejeitada. Justificativa: ${input.reason}`,
        data: { internalNotes: input.reason, publicMessage: input.publicMessage ?? input.reason },
        notify: 'Solicitação não aprovada',
      });
    case 'request_info':
      return simpleTransition(id, adminId, {
        allowed: OPEN_STATUSES, to: 'AWAITING_INFO', action: 'REQUEST_INFO_REQUESTED',
        summary: `Informações complementares solicitadas: ${input.message}`,
        data: { publicMessage: input.message }, decided: false,
        notify: 'A administração precisa de mais informações',
      });
    case 'suggest':
      return simpleTransition(id, adminId, {
        allowed: OPEN_STATUSES, to: 'AWAITING_INFO', action: 'REQUEST_SUGGESTION',
        summary: `Sugestão enviada: ${input.suggestion}`,
        data: { suggestion: input.suggestion }, decided: false,
        notify: 'Sugestão de outra sala ou horário',
      });
    case 'reopen':
      return simpleTransition(id, adminId, {
        allowed: ['AWAITING_INFO'], to: 'PENDING', action: 'REQUEST_REOPENED',
        summary: `Solicitação voltou para análise.${input.note ? ' Observação: ' + input.note : ''}`,
        data: {}, decided: false,
      });
    case 'cancel':
      return cancelRequest(id, input.reason, adminId);
    case 'note':
      await audit(prisma, { adminId, action: 'REQUEST_NOTE', entityType: 'ReservationRequest', entityId: id, summary: `Anotação: ${input.note}` });
      return prisma.reservationRequest.findUniqueOrThrow({ where: { id } });
  }
}

async function lockRequest(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "ReservationRequest" WHERE id = ${id} FOR UPDATE`;
  const req = await tx.reservationRequest.findUnique({ where: { id }, include: { room: true, equipment: true } });
  if (!req) throw notFound('Solicitação');
  return req;
}

async function simpleTransition(
  id: string,
  adminId: string,
  t: {
    allowed: RequestStatus[];
    to: RequestStatus;
    action: string;
    summary: string;
    data: Prisma.ReservationRequestUpdateInput;
    decided?: boolean;
    notify?: string;
  },
) {
  const updated = await transaction(async (tx) => {
    const req = await lockRequest(tx, id);
    if (!t.allowed.includes(req.status)) {
      throw conflict(`Esta solicitação está "${statusLabel(req.status)}" e não pode receber esta ação.`);
    }
    const u = await tx.reservationRequest.update({
      where: { id },
      data: { ...t.data, status: t.to, ...(t.decided === false ? {} : { decidedAt: new Date(), decidedById: adminId }) },
    });
    await audit(tx, { adminId, action: t.action, entityType: 'ReservationRequest', entityId: id, summary: t.summary, details: { from: req.status, to: t.to } });
    return u;
  });
  if (t.notify) notifyRequester(updated, t.notify);
  return updated;
}

export async function approveRequest(
  id: string,
  input: { priorityJustification?: string | null; publicMessage?: string | null; publicTitle?: string | null; showPublicTitle?: boolean },
  adminId: string,
  now: Date = new Date(),
) {
  const result = await transaction(async (tx) => {
    // Ordem dos travamentos: PRIMEIRO a sala, depois o pedido. Assim duas
    // aprovações simultâneas da mesma sala ficam em fila (sem deadlock):
    // a segunda só prossegue depois que a primeira terminar.
    const target = await tx.reservationRequest.findUnique({ where: { id }, select: { roomId: true } });
    if (!target) throw notFound('Solicitação');
    await lockRooms(tx, [target.roomId]);
    const req = await lockRequest(tx, id);

    if (!OPEN_STATUSES.includes(req.status)) {
      throw conflict(`Esta solicitação já está "${statusLabel(req.status)}".`);
    }

    // Ordem de chegada: há pedido ANTERIOR, em aberto, disputando o mesmo horário?
    const earlier = await tx.reservationRequest.findMany({
      where: {
        id: { not: id }, roomId: req.roomId, status: { in: OPEN_STATUSES }, sequence: { lt: req.sequence },
        startAt: { lt: req.endAt }, endAt: { gt: req.startAt },
      },
      select: { id: true, protocol: true, requesterName: true, receivedAt: true },
      orderBy: { sequence: 'asc' },
    });
    if (earlier.length && !input.priorityJustification) {
      throw new AppError(
        409,
        'EARLIER_REQUEST_PENDING',
        'Existe pedido mais antigo para este mesmo horário. Para priorizar este pedido, informe uma justificativa.',
        { earlier },
      );
    }

    const availability = await evaluateBooking(tx, {
      room: req.room, startAt: req.startAt, endAt: req.endAt, participants: req.participants, now,
    });
    // Mesmas regras de sempre: capacidade, sala ativa, horário, conflitos e bloqueios.
    assertAvailable(availability);

    const reservation = await tx.reservation.create({
      data: {
        roomId: req.roomId,
        title: req.purpose,
        publicTitle: input.publicTitle ?? null,
        showPublicTitle: Boolean(input.showPublicTitle && input.publicTitle),
        responsible: req.requesterName,
        startAt: req.startAt,
        endAt: req.endAt,
        participants: req.participants,
        notes: req.otherEquipmentNotes ? `Equipamentos (descrição do solicitante): ${req.otherEquipmentNotes}` : null,
        source: 'REQUEST',
        createdById: adminId,
        equipment: { create: req.equipment.map((e) => ({ equipmentId: e.equipmentId })) },
      },
    });
    const updated = await tx.reservationRequest.update({
      where: { id },
      data: {
        status: 'APPROVED', reservationId: reservation.id, decidedAt: now, decidedById: adminId,
        publicMessage: input.publicMessage ?? null, availabilityLostAt: null,
      },
    });

    await audit(tx, {
      adminId,
      action: earlier.length ? 'REQUEST_APPROVED_OUT_OF_ORDER' : 'REQUEST_APPROVED',
      entityType: 'ReservationRequest',
      entityId: id,
      summary: earlier.length
        ? `Aprovada com prioridade sobre ${earlier.map((e) => e.protocol).join(', ')}. Justificativa: ${input.priorityJustification}`
        : 'Solicitação aprovada; reserva confirmada criada.',
      details: { reservationId: reservation.id, skipped: earlier.map((e) => e.protocol) },
    });

    // Reavaliação automática: os demais pedidos em aberto que conflitam
    // com a reserva recém-criada perdem a disponibilidade.
    const lost = await tx.reservationRequest.findMany({
      where: {
        id: { not: id }, roomId: req.roomId, status: { in: OPEN_STATUSES },
        startAt: { lt: req.endAt }, endAt: { gt: req.startAt },
      },
      select: { id: true, protocol: true },
    });
    if (lost.length) {
      await tx.reservationRequest.updateMany({ where: { id: { in: lost.map((l) => l.id) } }, data: { availabilityLostAt: now } });
      for (const l of lost) {
        await audit(tx, {
          adminId, action: 'REQUEST_LOST_AVAILABILITY', entityType: 'ReservationRequest', entityId: l.id,
          summary: `Horário deixou de estar disponível: a solicitação ${req.protocol} foi aprovada para a mesma sala.`,
        });
      }
    }
    return { request: updated, reservation, lostAvailability: lost.map((l) => l.protocol) };
  });
  notifyRequester(result.request, 'Solicitação aprovada: reserva confirmada');
  return result;
}

async function cancelRequest(id: string, reason: string, adminId: string) {
  const updated = await transaction(async (tx) => {
    const req = await lockRequest(tx, id);
    if (!['PENDING', 'AWAITING_INFO', 'APPROVED'].includes(req.status)) {
      throw conflict(`Esta solicitação já está "${statusLabel(req.status)}".`);
    }
    if (req.reservationId) {
      await tx.reservation.update({
        where: { id: req.reservationId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      });
      await audit(tx, { adminId, action: 'RESERVATION_CANCELLED', entityType: 'Reservation', entityId: req.reservationId, summary: `Reserva cancelada: ${reason}` });
    }
    const u = await tx.reservationRequest.update({
      where: { id },
      data: { status: 'CANCELLED', decidedAt: new Date(), decidedById: adminId, internalNotes: reason, publicMessage: reason },
    });
    await audit(tx, { adminId, action: 'REQUEST_CANCELLED', entityType: 'ReservationRequest', entityId: id, summary: `Solicitação cancelada: ${reason}` });
    return u;
  });
  notifyRequester(updated, 'Solicitação cancelada');
  return updated;
}

/**
 * Avisa o solicitante sobre a mudança de situação, pelo canal configurado
 * (WhatsApp e/ou e-mail). Executa em segundo plano: a decisão do
 * administrador não espera a mensagem ser entregue.
 */
function notifyRequester(req: { id: string; contactEmail: string | null; contactPhone: string | null }, headline: string) {
  if (!req.contactEmail && !req.contactPhone) return;
  void (async () => {
    const [s, full] = await Promise.all([
      getSettings(),
      prisma.reservationRequest.findUnique({ where: { id: req.id }, include: { room: { select: { name: true } } } }),
    ]);
    if (!full) return;
    const info = { protocol: full.protocol, requesterName: full.requesterName, roomName: full.room.name, startAt: full.startAt, endAt: full.endAt, participants: full.participants };
    const extra = { publicMessage: full.publicMessage, suggestion: full.suggestion };
    await deliverToRequester(
      s,
      { phone: full.contactPhone, email: full.contactEmail },
      {
        whatsapp: () => requestUpdateWhatsApp(s.unitName, info, headline, extra),
        email: (to) => requestUpdateEmail(s.unitName, to, info, headline, extra),
      },
    );
  })().catch((err) => console.error('[avisos] Falha ao notificar solicitante:', err));
}

/** Indicador para o menu: quantidade de solicitações em aberto. */
export function countOpenRequests() {
  return prisma.reservationRequest.count({ where: { status: { in: OPEN_STATUSES } } });
}

export { overlaps };
