/**
 * Funções auxiliares dos testes de integração (banco de testes).
 */
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { addDays, todayString, weekdayOf } from '@/lib/time';
import type { PublicRequestInput, RecurringInput } from '@/lib/validation';

/** Apaga todos os dados do banco de testes. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "AuditLog", "RecurrenceException", "RecurringEquipment", "RecurringMeeting",
      "RequestEquipment", "ReservationRequest", "ReservationEquipment", "Reservation",
      "AvailabilityBlock", "RoomEquipment", "Room", "Equipment", "Admin", "Settings"
    RESTART IDENTITY CASCADE`);
}

export async function makeAdmin(email = 'teste@exemplo.local') {
  return prisma.admin.create({ data: { name: 'Admin Teste', email, passwordHash: await hashPassword('Senha123') } });
}

export async function makeRoom(data: Partial<{ name: string; capacity: number; active: boolean }> = {}) {
  return prisma.room.create({
    data: { name: data.name ?? `Sala ${Math.random().toString(36).slice(2, 7)}`, capacity: data.capacity ?? 20, active: data.active ?? true },
  });
}

/** Próxima data futura (a partir de 7 dias) que cai no dia da semana informado. */
export function futureWeekday(weekday: number, weeksAhead = 1): string {
  let d = addDays(todayString(), 7 * weeksAhead);
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

export function requestInput(roomId: string, overrides: Partial<PublicRequestInput> = {}): PublicRequestInput {
  return {
    requesterName: 'Solicitante Teste',
    purpose: 'Reunião de teste',
    roomId,
    date: futureWeekday(4),
    startTime: '14:00',
    endTime: '16:00',
    participants: 10,
    needsProjector: false,
    equipmentIds: [],
    otherEquipmentNotes: null,
    contactPhone: '(11) 90000-0000',
    contactEmail: null,
    ...overrides,
  };
}

export function recurringInput(roomId: string, overrides: Partial<RecurringInput> = {}): RecurringInput {
  return {
    name: 'Administração',
    description: null,
    publicTitle: null,
    showPublicTitle: true,
    roomId,
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [2], // terça-feira
    monthDay: null,
    nthWeek: null,
    startTime: '19:00',
    endTime: '21:00',
    startDate: todayString(),
    endDate: null,
    participants: 10,
    equipmentIds: [],
    ...overrides,
  };
}
