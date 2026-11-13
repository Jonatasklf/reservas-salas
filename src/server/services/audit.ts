/**
 * Registro de auditoria das decisões administrativas importantes
 * (aprovações, rejeições, cancelamentos, alterações de salas e recorrências).
 */
import type { Prisma } from '@prisma/client';
import type { Db } from '@/lib/db';

export interface AuditEntry {
  adminId?: string | null;
  action: string;
  entityType: 'Room' | 'Equipment' | 'ReservationRequest' | 'Reservation' | 'RecurringMeeting' | 'AvailabilityBlock' | 'Settings' | 'Admin';
  entityId: string;
  summary: string;
  details?: Prisma.InputJsonValue;
}

export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      adminId: entry.adminId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      details: entry.details,
    },
  });
}

export function listAudit(db: Db, entityType: string, entityId: string) {
  return db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
    include: { admin: { select: { name: true } } },
  });
}
