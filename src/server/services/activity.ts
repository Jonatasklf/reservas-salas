/**
 * REGISTRO DE ATIVIDADES (log de uso)
 * =============================================================================
 * Consulta o AuditLog — onde o sistema grava solicitações recebidas,
 * decisões, alterações, logins e envios de WhatsApp/e-mail — com filtros por
 * período, categoria, administrador e texto.
 * =============================================================================
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dayBoundsUtc } from '@/lib/time';

/** Categorias exibidas no filtro (rótulo + regra de seleção). */
export const ACTIVITY_CATEGORIES = {
  solicitacoes: { label: 'Solicitações', where: { entityType: 'ReservationRequest', NOT: { action: { startsWith: 'NOTIFICATION_' } } } },
  mensagens: { label: 'Mensagens (WhatsApp/e-mail)', where: { action: { startsWith: 'NOTIFICATION_' } } },
  reservas: { label: 'Reservas', where: { entityType: 'Reservation' } },
  recorrentes: { label: 'Reuniões recorrentes', where: { entityType: 'RecurringMeeting' } },
  salas: { label: 'Salas e equipamentos', where: { entityType: { in: ['Room', 'Equipment'] } } },
  bloqueios: { label: 'Bloqueios', where: { entityType: 'AvailabilityBlock' } },
  acesso: { label: 'Acesso e administradores', where: { entityType: 'Admin' } },
  configuracoes: { label: 'Configurações', where: { entityType: 'Settings' } },
} satisfies Record<string, { label: string; where: Prisma.AuditLogWhereInput }>;

export type ActivityCategory = keyof typeof ACTIVITY_CATEGORIES;

/** Categoria de um registro (para o selo na tela e a coluna do CSV). */
export function categoryOf(entry: { entityType: string; action: string }): ActivityCategory {
  if (entry.action.startsWith('NOTIFICATION_')) return 'mensagens';
  switch (entry.entityType) {
    case 'ReservationRequest': return 'solicitacoes';
    case 'Reservation': return 'reservas';
    case 'RecurringMeeting': return 'recorrentes';
    case 'Room':
    case 'Equipment': return 'salas';
    case 'AvailabilityBlock': return 'bloqueios';
    case 'Admin': return 'acesso';
    default: return 'configuracoes';
  }
}

export interface ActivityFilters {
  from?: string;
  to?: string;
  category?: ActivityCategory;
  adminId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

function buildWhere(f: ActivityFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.from) and.push({ createdAt: { gte: dayBoundsUtc(f.from).start } });
  if (f.to) and.push({ createdAt: { lt: dayBoundsUtc(f.to).end } });
  if (f.category) and.push(ACTIVITY_CATEGORIES[f.category].where);
  if (f.adminId === 'sistema') and.push({ adminId: null });
  else if (f.adminId) and.push({ adminId: f.adminId });
  if (f.search) and.push({ summary: { contains: f.search, mode: 'insensitive' } });
  return and.length ? { AND: and } : {};
}

/** Lista paginada (mais recentes primeiro). */
export async function listActivity(f: ActivityFilters) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 200);
  const page = Math.max(f.page ?? 1, 1);
  const where = buildWhere(f);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { admin: { select: { name: true } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      category: categoryOf(r),
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      adminName: r.admin?.name ?? null,
    })),
  };
}

/** Todas as linhas do filtro (para exportação), com limite de segurança. */
export async function exportActivity(f: ActivityFilters, limit = 20_000) {
  const rows = await prisma.auditLog.findMany({
    where: buildWhere(f),
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { admin: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, category: categoryOf(r) }));
}

/** Converte os parâmetros da URL nos filtros do serviço. */
export function activityFiltersFromQuery(q: { de?: string; ate?: string; categoria?: string; admin?: string; busca?: string; pagina?: number }): ActivityFilters {
  return {
    from: q.de,
    to: q.ate,
    category: q.categoria && q.categoria in ACTIVITY_CATEGORIES ? (q.categoria as ActivityCategory) : undefined,
    adminId: q.admin || undefined,
    search: q.busca || undefined,
    page: q.pagina,
  };
}
