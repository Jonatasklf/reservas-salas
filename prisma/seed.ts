/**
 * DADOS FICTÍCIOS PARA DEMONSTRAÇÃO
 * -----------------------------------------------------------------------------
 * Execute com:  npm run db:seed
 *
 * - Pode ser executado mais de uma vez (equipamentos e salas são atualizados;
 *   reservas/solicitações de exemplo só são criadas se o banco estiver vazio).
 * - Nenhum dado pessoal real: nomes e contatos são inventados.
 * - O administrador de demonstração só é criado se SEED_ADMIN_EMAIL e
 *   SEED_ADMIN_PASSWORD estiverem definidos no .env.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import crypto from 'node:crypto';
import { toRRuleString } from '../src/server/recurrence';

const prisma = new PrismaClient();
const TZ = 'America/Sao_Paulo';

const today = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const at = (date: string, time: string) => fromZonedTime(`${date}T${time}:00`, TZ);
const dateOnly = (date: string) => new Date(`${date}T00:00:00Z`);
/** Próxima data (a partir de amanhã) que cai no dia da semana informado. */
function next(weekday: number, after = 1) {
  let d = addDays(today, after);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== weekday) d = addDays(d, 1);
  return d;
}

async function main() {
  console.log('[seed] Criando configurações...');
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, unitName: 'Reservas de Salas', headerSubtitle: 'Agenda das salas de reuniões — demonstração' },
  });

  console.log('[seed] Criando equipamentos...');
  const equipmentList = [
    { key: 'projetor', name: 'Projetor' },
    { key: 'televisao', name: 'Televisão' },
    { key: 'computador', name: 'Computador' },
    { key: 'microfone', name: 'Microfone' },
    { key: 'sistema-de-som', name: 'Sistema de som' },
    { key: 'ar-condicionado', name: 'Ar-condicionado' },
    { key: 'quadro-branco', name: 'Quadro branco' },
  ];
  const eq: Record<string, string> = {};
  for (const e of equipmentList) {
    const row = await prisma.equipment.upsert({ where: { key: e.key }, update: { name: e.name }, create: e });
    eq[e.key] = row.id;
  }

  console.log('[seed] Criando salas...');
  const roomList = [
    { name: 'Sala de Reuniões 01', location: 'Térreo, ao lado da secretaria', capacity: 20, description: 'Sala ampla com mesa de reunião.', equipment: ['projetor', 'ar-condicionado', 'quadro-branco'], sortOrder: 1 },
    { name: 'Sala de Reuniões 02', location: 'Térreo, corredor B', capacity: 15, description: 'Sala com televisão para apresentações.', equipment: ['televisao', 'ar-condicionado'], sortOrder: 2 },
    { name: 'Sala de Reuniões 03', location: '1º andar', capacity: 8, description: 'Sala pequena para conversas e atendimentos.', equipment: ['quadro-branco'], sortOrder: 3 },
    { name: 'Salão Auxiliar', location: 'Anexo', capacity: 60, description: 'Espaço para reuniões maiores.', equipment: ['projetor', 'microfone', 'sistema-de-som', 'computador'], sortOrder: 4, openTime: '08:00', closeTime: '22:00' },
  ];
  const rooms: Record<string, string> = {};
  for (const r of roomList) {
    const { equipment, ...data } = r;
    const room = await prisma.room.upsert({ where: { name: r.name }, update: { capacity: r.capacity }, create: data });
    rooms[r.name] = room.id;
    await prisma.roomEquipment.deleteMany({ where: { roomId: room.id } });
    await prisma.roomEquipment.createMany({ data: equipment.map((k) => ({ roomId: room.id, equipmentId: eq[k] })) });
  }

  let adminId: string | null = null;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const production = process.env.NODE_ENV === 'production' || (process.env.APP_URL ?? '').startsWith('https://');
  if (email && password && production) {
    console.log('[seed] Ambiente de produção detectado: o administrador de demonstração NÃO foi criado. Use "npm run admin:criar".');
  } else if (email && password) {
    const admin = await prisma.admin.upsert({
      where: { email },
      update: {},
      create: { name: 'Administrador de Demonstração', email, passwordHash: await bcrypt.hash(password, 12) },
    });
    adminId = admin.id;
    console.log(`[seed] Administrador de demonstração: ${email} (senha definida em SEED_ADMIN_PASSWORD).`);
  } else {
    console.log('[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos: crie um administrador com "npm run admin:criar".');
  }

  if ((await prisma.recurringMeeting.count()) === 0) {
    console.log('[seed] Criando reuniões recorrentes de exemplo...');
    await prisma.recurringMeeting.create({
      data: {
        name: 'Reunião de Administração', publicTitle: 'Reunião de Administração', roomId: rooms['Sala de Reuniões 01'],
        frequency: 'WEEKLY', weekdays: [2], startTime: '19:00', endTime: '21:00',
        rrule: toRRuleString({ frequency: 'WEEKLY', interval: 1, weekdays: [2], monthDay: null, nthWeek: null, startDate: addDays(today, -60), endDate: null }),
        startDate: dateOnly(addDays(today, -60)),
        participants: 12, createdById: adminId, equipment: { create: [{ equipmentId: eq['projetor'] }] },
      },
    });
    await prisma.recurringMeeting.create({
      data: {
        name: 'Reunião mensal de ministério', publicTitle: 'Reunião mensal', roomId: rooms['Salão Auxiliar'],
        frequency: 'MONTHLY_NTH_WEEKDAY', weekdays: [1], nthWeek: 1, startTime: '19:30', endTime: '21:30',
        rrule: toRRuleString({ frequency: 'MONTHLY_NTH_WEEKDAY', interval: 1, weekdays: [1], monthDay: null, nthWeek: 1, startDate: addDays(today, -60), endDate: null }),
        startDate: dateOnly(addDays(today, -60)),
        participants: 45, createdById: adminId,
        equipment: { create: [{ equipmentId: eq['microfone'] }, { equipmentId: eq['sistema-de-som'] }] },
      },
    });
    await prisma.recurringMeeting.create({
      data: {
        name: 'Estudo em grupo', publicTitle: 'Estudo em grupo', roomId: rooms['Sala de Reuniões 02'],
        frequency: 'WEEKLY', weekdays: [3, 5], startTime: '14:00', endTime: '16:00',
        rrule: toRRuleString({ frequency: 'WEEKLY', interval: 1, weekdays: [3, 5], monthDay: null, nthWeek: null, startDate: addDays(today, -30), endDate: addDays(today, 150) }),
        startDate: dateOnly(addDays(today, -30)),
        endDate: dateOnly(addDays(today, 150)), participants: 10, createdById: adminId,
      },
    });
  }

  if ((await prisma.reservation.count()) === 0) {
    console.log('[seed] Criando reservas de exemplo...');
    const d1 = next(4); // próxima quinta
    await prisma.reservation.create({
      data: {
        roomId: rooms['Sala de Reuniões 01'], title: 'Planejamento de atividades', publicTitle: 'Planejamento', showPublicTitle: true,
        responsible: 'Responsável Exemplo A', startAt: at(d1, '09:00'), endAt: at(d1, '11:00'), participants: 10, source: 'ADMIN', createdById: adminId,
      },
    });
    await prisma.reservation.create({
      data: {
        roomId: rooms['Sala de Reuniões 01'], title: 'Atendimento agendado', responsible: 'Responsável Exemplo B',
        startAt: at(d1, '14:00'), endAt: at(d1, '16:00'), participants: 6, source: 'ADMIN', createdById: adminId,
      },
    });
    const past = addDays(today, -7);
    await prisma.reservation.create({
      data: {
        roomId: rooms['Sala de Reuniões 03'], title: 'Reunião já realizada (histórico)', responsible: 'Responsável Exemplo C',
        startAt: at(past, '10:00'), endAt: at(past, '11:00'), participants: 5, source: 'ADMIN', createdById: adminId,
      },
    });
  }

  if ((await prisma.reservationRequest.count()) === 0) {
    console.log('[seed] Criando solicitações de exemplo (duas concorrentes)...');
    const d = next(6); // próximo sábado
    const year = Number(today.slice(0, 4));
    const examples = [
      { name: 'Solicitante Exemplo Um', purpose: 'Reunião de organização do coral', room: 'Sala de Reuniões 02', start: '09:00', end: '11:00', people: 12, phone: '(11) 90000-0001' },
      { name: 'Solicitante Exemplo Dois', purpose: 'Encontro de jovens para planejamento', room: 'Sala de Reuniões 02', start: '10:00', end: '12:00', people: 10, email: 'exemplo2@exemplo.local' },
      { name: 'Solicitante Exemplo Três', purpose: 'Reunião de prestação de contas', room: 'Salão Auxiliar', start: '15:00', end: '17:00', people: 30, phone: '(11) 90000-0003', projector: true },
    ];
    for (const ex of examples) {
      const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"ReservationRequest"', 'sequence'))`;
      const sequence = Number(nextval);
      await prisma.reservationRequest.create({
        data: {
          sequence,
          protocol: `${year}-${String(sequence).padStart(6, '0')}`,
          // Código de acesso das solicitações de exemplo: DEMO1234
          accessCodeHash: crypto.createHash('sha256').update('DEMO1234').digest('hex'),
          requesterName: ex.name, purpose: ex.purpose, roomId: rooms[ex.room],
          startAt: at(d, ex.start), endAt: at(d, ex.end), participants: ex.people,
          needsProjector: Boolean(ex.projector), contactPhone: ex.phone ?? null, contactEmail: ex.email ?? null,
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  if ((await prisma.availabilityBlock.count()) === 0) {
    const year = Number(today.slice(0, 4));
    const christmas = today > `${year}-12-25` ? `${year + 1}-12-25` : `${year}-12-25`;
    await prisma.availabilityBlock.create({
      data: { title: 'Feriado de Natal', type: 'HOLIDAY', startAt: at(christmas, '00:00'), endAt: at(christmas, '23:59'), createdById: adminId },
    });
  }

  console.log('[seed] Concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
