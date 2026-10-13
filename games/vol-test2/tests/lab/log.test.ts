import { describe, expect, it } from 'vitest';
import { LabLog } from '../../src/lab/log';

const fixed = (): Date => new Date('2026-10-13T10:00:00.000Z');

describe('LabLog', () => {
  it('kayıtlara artan sıra, ISO zaman ve sayfa saati koyar', () => {
    const log = new LabLog(8, fixed, () => 12.345);
    const first = log.info('lab', 'run.start', { workload: 'x' });
    const second = log.warn('page', 'console');
    expect(first).toMatchObject({ seq: 1, t: '2026-10-13T10:00:00.000Z', ms: 12.3, lvl: 'info' });
    expect(first.data).toEqual({ workload: 'x' });
    expect(second.seq).toBe(2);
    expect('data' in second).toBe(false);
    expect(log.head).toBe(2);
  });

  it('since artımlı okur ve imleci ilerletir', () => {
    const log = new LabLog(8, fixed);
    for (let index = 0; index < 5; index++) log.info('lab', `e${index}`);
    const first = log.since(0, 2);
    expect(first.records.map((r) => r.ev)).toEqual(['e0', 'e1']);
    expect(first.next).toBe(2);
    const rest = log.since(first.next, 10);
    expect(rest.records.map((r) => r.ev)).toEqual(['e2', 'e3', 'e4']);
    expect(rest.next).toBe(5);
    expect(log.since(rest.next).records).toEqual([]);
  });

  it('halka dolunca eskiyi düşer ve düşen sayıyı bildirir; sayaçlar ömür boyudur', () => {
    const log = new LabLog(3, fixed);
    log.error('page', 'boom');
    for (let index = 0; index < 4; index++) log.info('lab', `e${index}`);
    const page = log.since(0, 10);
    expect(page.records.map((r) => r.ev)).toEqual(['e1', 'e2', 'e3']);
    expect(page.dropped).toBe(2);
    expect(log.counts.error).toBe(1);
    expect(log.counts.info).toBe(4);
  });

  it('minLevel altını eler ama imleç yine ilerler', () => {
    const log = new LabLog(8, fixed);
    log.log('debug', 'lab', 'a');
    log.warn('lab', 'b');
    const page = log.since(0, 10, 'warn');
    expect(page.records.map((r) => r.ev)).toEqual(['b']);
    expect(page.next).toBe(2);
  });

  it('since geleceği gösterirse imleci geri çeker', () => {
    const log = new LabLog(4, fixed);
    log.info('lab', 'a');
    expect(log.since(99).next).toBe(1);
  });

  it('geçersiz kapasiteyi reddeder', () => {
    expect(() => new LabLog(0)).toThrow(RangeError);
  });
});
