/**
 * Testes UNITÁRIOS do motor de recorrência.
 */
import { describe, expect, it } from 'vitest';
import { describeRule, expandOccurrences, ruleDates, type RecurringMeetingLike } from '@/server/recurrence';
import { weekdayOf, zonedToUtc } from '@/lib/time';

const base: RecurringMeetingLike = {
  id: 'm1', name: 'Administração', publicTitle: null, showPublicTitle: true, roomId: 'sala1',
  frequency: 'WEEKLY', interval: 1, weekdays: [2], monthDay: null, nthWeek: null,
  startDate: '2030-01-01', endDate: null, startTime: '19:00', endTime: '21:00',
  participants: 10, status: 'ACTIVE', suspendedFrom: null, suspendedUntil: null,
};

describe('regras de recorrência', () => {
  // Cenário obrigatório 3 (regra pura)
  it('semanal: toda terça-feira, sem cadastrar cada semana', () => {
    const dates = ruleDates(base, '2030-01-01', '2030-01-31');
    expect(dates).toEqual(['2030-01-01', '2030-01-08', '2030-01-15', '2030-01-22', '2030-01-29']);
    expect(dates.every((d) => weekdayOf(d) === 2)).toBe(true);
  });

  it('horário local de São Paulo convertido corretamente', () => {
    const [occ] = expandOccurrences(base, [], '2030-01-08', '2030-01-08');
    expect(occ.startAt).toEqual(zonedToUtc('2030-01-08', '19:00'));
    expect(occ.startAt.toISOString()).toBe('2030-01-08T22:00:00.000Z'); // UTC-3
  });

  it('quinzenal', () => {
    expect(ruleDates({ ...base, frequency: 'BIWEEKLY' }, '2030-01-01', '2030-02-01')).toEqual(['2030-01-01', '2030-01-15', '2030-01-29']);
  });

  it('primeira segunda-feira de cada mês', () => {
    const dates = ruleDates({ ...base, frequency: 'MONTHLY_NTH_WEEKDAY', weekdays: [1], nthWeek: 1 }, '2030-01-01', '2030-04-30');
    expect(dates).toEqual(['2030-01-07', '2030-02-04', '2030-03-04', '2030-04-01']);
  });

  it('última sexta-feira do mês', () => {
    const dates = ruleDates({ ...base, frequency: 'MONTHLY_NTH_WEEKDAY', weekdays: [5], nthWeek: -1 }, '2030-01-01', '2030-02-28');
    expect(dates).toEqual(['2030-01-25', '2030-02-22']);
  });

  it('mensal por dia do mês e data final', () => {
    const dates = ruleDates({ ...base, frequency: 'MONTHLY_DAY', monthDay: 10, endDate: '2030-03-10' }, '2030-01-01', '2030-12-31');
    expect(dates).toEqual(['2030-01-10', '2030-02-10', '2030-03-10']);
  });

  it('diária a cada 2 dias e personalizada (seg e qua)', () => {
    expect(ruleDates({ ...base, frequency: 'DAILY', interval: 2 }, '2030-01-01', '2030-01-07')).toEqual(['2030-01-01', '2030-01-03', '2030-01-05', '2030-01-07']);
    expect(ruleDates({ ...base, frequency: 'CUSTOM', weekdays: [1, 3] }, '2030-01-01', '2030-01-09')).toEqual(['2030-01-02', '2030-01-07', '2030-01-09']);
  });
});

describe('exceções e suspensões', () => {
  // Cenário obrigatório 4 (regra pura)
  it('cancelar uma ocorrência libera somente aquela data', () => {
    const occ = expandOccurrences(
      base,
      [{ id: 'e1', originalDate: '2030-01-15', type: 'CANCELLED', newRoomId: null, newStartTime: null, newEndTime: null, reason: 'Feriado' }],
      '2030-01-01',
      '2030-01-31',
    );
    expect(occ.filter((o) => o.state === 'CANCELLED').map((o) => o.date)).toEqual(['2030-01-15']);
    expect(occ.filter((o) => o.state === 'SCHEDULED')).toHaveLength(4);
  });

  it('alterar sala e horário de uma ocorrência', () => {
    const [o] = expandOccurrences(
      base,
      [{ id: 'e1', originalDate: '2030-01-08', type: 'MODIFIED', newRoomId: 'sala2', newStartTime: '18:00', newEndTime: '20:00', reason: null }],
      '2030-01-08',
      '2030-01-08',
    );
    expect(o.roomId).toBe('sala2');
    expect(o.startTime).toBe('18:00');
    expect(o.modified).toBe(true);
  });

  it('suspensão temporária', () => {
    const occ = expandOccurrences({ ...base, status: 'SUSPENDED', suspendedFrom: '2030-01-10', suspendedUntil: '2030-01-20' }, [], '2030-01-01', '2030-01-31');
    expect(occ.filter((o) => o.state === 'SUSPENDED').map((o) => o.date)).toEqual(['2030-01-15']);
  });

  it('descrição em português', () => {
    expect(describeRule({ ...base })).toBe('Toda terça-feira, das 19h00 às 21h00');
    expect(describeRule({ ...base, frequency: 'MONTHLY_NTH_WEEKDAY', weekdays: [1], nthWeek: 1, startTime: undefined, endTime: undefined })).toBe(
      'Primeira segunda-feira de cada mês',
    );
  });
});
