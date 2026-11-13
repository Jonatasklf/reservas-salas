/**
 * Testes UNITÁRIOS das regras de disponibilidade (sem banco de dados).
 */
import { describe, expect, it } from 'vitest';
import { checkRoomAvailability, findCompetingRequests, freeIntervals, overlaps, type BusySlot, type RoomRules } from '@/server/availability';
import { zonedToUtc } from '@/lib/time';

const DATE = '2030-03-14'; // quinta-feira no futuro
const NOW = zonedToUtc('2030-03-01', '08:00');
const hours = { defaultOpenTime: '07:00', defaultCloseTime: '22:00' };
const room: RoomRules = { id: 'sala1', name: 'Sala 1', capacity: 20, active: true, openTime: null, closeTime: null, weekdays: [0, 1, 2, 3, 4, 5, 6] };
const existing: BusySlot = {
  kind: 'RESERVATION', roomId: 'sala1', startAt: zonedToUtc(DATE, '14:00'), endAt: zonedToUtc(DATE, '16:00'),
  title: 'Reunião confirmada', publicTitle: 'Reservado', refId: 'r1',
};

function check(start: string, end: string, extra: Partial<Parameters<typeof checkRoomAvailability>[0]> = {}) {
  return checkRoomAvailability({
    room, startAt: zonedToUtc(DATE, start), endAt: zonedToUtc(DATE, end), participants: 10, busy: [existing], hours, now: NOW, ...extra,
  });
}

describe('sobreposição de horários', () => {
  it('detecta intervalos sobrepostos e aceita consecutivos', () => {
    const a = zonedToUtc(DATE, '14:00');
    const b = zonedToUtc(DATE, '16:00');
    expect(overlaps(a, b, zonedToUtc(DATE, '15:00'), zonedToUtc(DATE, '17:00'))).toBe(true);
    expect(overlaps(a, b, zonedToUtc(DATE, '16:00'), zonedToUtc(DATE, '18:00'))).toBe(false);
  });

  it('exemplo do enunciado: reserva das 14h às 16h', () => {
    expect(check('13:00', '14:00').available).toBe(true); // permitido
    expect(check('16:00', '18:00').available).toBe(true); // permitido
    expect(check('15:00', '17:00').available).toBe(false); // indisponível
    expect(check('14:30', '15:30').available).toBe(false); // indisponível
    expect(check('15:00', '17:00').issues[0].reason).toBe('CONFLICT');
  });

  // Cenário obrigatório 11
  it('horários consecutivos sem sobreposição: permite ambos', () => {
    const first: BusySlot = { ...existing, startAt: zonedToUtc(DATE, '09:00'), endAt: zonedToUtc(DATE, '10:00') };
    const res = checkRoomAvailability({
      room, startAt: zonedToUtc(DATE, '10:00'), endAt: zonedToUtc(DATE, '11:00'), participants: 5, busy: [first], hours, now: NOW,
    });
    expect(res.available).toBe(true);
  });
});

describe('capacidade', () => {
  // Cenário obrigatório 1 (regra pura; ver também o teste de integração)
  it('25 participantes em sala de capacidade 20: rejeita com a mensagem correta', () => {
    const res = check('09:00', '10:00', { participants: 25 });
    expect(res.available).toBe(false);
    const issue = res.issues.find((i) => i.reason === 'CAPACITY');
    expect(issue?.message).toBe('Esta sala possui capacidade máxima de 20 pessoas. Selecione uma sala com capacidade adequada.');
  });

  it('participantes abaixo de 1: rejeita', () => {
    expect(check('09:00', '10:00', { participants: 0 }).issues.map((i) => i.reason)).toContain('INVALID_PARTICIPANTS');
  });
});

describe('outras regras', () => {
  // Cenário obrigatório 12
  it('horário no passado: impede', () => {
    const res = check('09:00', '10:00', { now: zonedToUtc(DATE, '12:00') });
    expect(res.issues.map((i) => i.reason)).toContain('PAST');
  });

  it('término igual ou anterior ao início: impede', () => {
    expect(check('10:00', '10:00').issues[0].reason).toBe('INVALID_RANGE');
    expect(check('11:00', '10:00').issues[0].reason).toBe('INVALID_RANGE');
  });

  // Cenário obrigatório 8 (regra pura)
  it('sala desativada: impede novas reservas', () => {
    const res = check('09:00', '10:00', { room: { ...room, active: false } });
    expect(res.issues.map((i) => i.reason)).toContain('INACTIVE');
  });

  it('fora do horário de funcionamento: impede', () => {
    expect(check('06:00', '08:00').issues.map((i) => i.reason)).toContain('OUTSIDE_HOURS');
    expect(check('21:00', '23:00').issues.map((i) => i.reason)).toContain('OUTSIDE_HOURS');
  });

  it('bloqueio administrativo para todas as salas: impede', () => {
    const block: BusySlot = { kind: 'BLOCK', roomId: null, startAt: zonedToUtc(DATE, '00:00'), endAt: zonedToUtc(DATE, '23:59'), title: 'Feriado', publicTitle: 'Feriado', refId: 'b1' };
    const res = checkRoomAvailability({ room, startAt: zonedToUtc(DATE, '09:00'), endAt: zonedToUtc(DATE, '10:00'), participants: 5, busy: [block], hours, now: NOW });
    expect(res.issues.map((i) => i.reason)).toContain('BLOCKED');
  });

  it('antecedência mínima para pedidos públicos', () => {
    const res = check('09:00', '10:00', { now: zonedToUtc(DATE, '08:30'), publicLimits: { minAdvanceMinutes: 60, maxAdvanceDays: 180 } });
    expect(res.issues.map((i) => i.reason)).toContain('TOO_SOON');
  });

  it('calcula intervalos livres do dia', () => {
    const free = freeIntervals(room, DATE, [existing], hours, zonedToUtc);
    expect(free).toHaveLength(2);
    expect(free[0].endAt).toEqual(zonedToUtc(DATE, '14:00'));
    expect(free[1].startAt).toEqual(zonedToUtc(DATE, '16:00'));
  });
});

describe('pedidos concorrentes', () => {
  it('identifica concorrentes da mesma sala em ordem cronológica', () => {
    const base = { roomId: 'sala1', startAt: zonedToUtc(DATE, '09:00'), endAt: zonedToUtc(DATE, '11:00') };
    const map = findCompetingRequests([
      { id: 'b', sequence: 2, ...base, startAt: zonedToUtc(DATE, '10:00'), endAt: zonedToUtc(DATE, '12:00') },
      { id: 'a', sequence: 1, ...base },
      { id: 'c', sequence: 3, ...base, roomId: 'sala2' },
    ]);
    expect(map.get('b')?.map((r) => r.id)).toEqual(['a']);
    expect(map.get('a')?.map((r) => r.id)).toEqual(['b']);
    expect(map.has('c')).toBe(false);
  });
});
