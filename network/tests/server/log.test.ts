import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  errorData,
  fileSink,
  Logger,
  stdoutSink,
  type LogRecord,
  type LogSink,
} from '../../src/server';

const FIXED = new Date('2026-01-02T03:04:05.678Z');

const parse = (line: string): LogRecord => JSON.parse(line) as LogRecord;

function collect(): { sink: LogSink; lines: string[]; records: LogRecord[] } {
  const lines: string[] = [];
  const records: LogRecord[] = [];
  return {
    lines,
    records,
    sink: {
      write: (record, line) => {
        records.push(record);
        lines.push(line);
      },
    },
  };
}

describe('Logger', () => {
  it('kaydı sabit alanlarla ve JSONL satırı olarak yazar', () => {
    const { sink, lines, records } = collect();
    const logger = Logger.create({ src: 'host', sinks: [sink], now: () => FIXED });
    logger.info('listening', { port: 2567 });
    expect(records[0]).toEqual({
      seq: 1,
      t: '2026-01-02T03:04:05.678Z',
      lvl: 'info',
      src: 'host',
      ev: 'listening',
      data: { port: 2567 },
    });
    expect(JSON.parse(lines[0])).toEqual(records[0]);
  });

  it('veri yoksa data alanı hiç yazılmaz', () => {
    const { sink, records } = collect();
    Logger.create({ src: 'a', sinks: [sink] }).info('x');
    expect('data' in records[0]).toBe(false);
  });

  it('seviye altındaki kaydı atar ve seviye sonradan değişir', () => {
    const { sink, records } = collect();
    const logger = Logger.create({ src: 'a', sinks: [sink] });
    logger.debug('gizli');
    logger.info('görünür');
    logger.setLevel('debug');
    logger.debug('artık görünür');
    logger.setLevel('error');
    logger.warn('elendi');
    logger.error('kalır');
    expect(records.map((record) => record.ev)).toEqual(['görünür', 'artık görünür', 'kalır']);
    expect(logger.lastSeq).toBe(3);
  });

  it('çocuk günlükçü kaynağı değiştirir, sıra numarasını ve halkayı paylaşır', () => {
    const logger = Logger.create({ src: 'host' });
    const room = logger.child('room:lab');
    logger.info('a');
    room.info('b');
    expect(
      logger.since().records.map((record) => `${record.src}/${record.ev}/${record.seq}`),
    ).toEqual(['host/a/1', 'room:lab/b/2']);
    expect(room.src).toBe('room:lab');
  });

  it('bozuk bir hedef sunucuyu düşürmez ve diğer hedefler yazmaya devam eder', () => {
    const { sink, records } = collect();
    const broken: LogSink = {
      write: () => {
        throw new Error('disk');
      },
    };
    const logger = Logger.create({ src: 'a', sinks: [broken, sink] });
    expect(() => logger.info('x')).not.toThrow();
    expect(records).toHaveLength(1);
  });

  it('bigint ve döngüsel veriyi serileştirir ya da işaretler', () => {
    const { sink, lines } = collect();
    const logger = Logger.create({ src: 'a', sinks: [sink] });
    logger.info('big', { n: 12n });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    logger.info('cycle', cyclic);
    expect(parse(lines[0]).data).toEqual({ n: '12' });
    expect(parse(lines[1]).data).toEqual({ unserializable: true });
  });

  it('close tüm hedefleri kapatır; kapatması olmayan hedef sorun değildir', () => {
    let closed = 0;
    const logger = Logger.create({
      src: 'a',
      sinks: [{ write: () => undefined, close: () => closed++ }, { write: () => undefined }],
    });
    logger.close();
    expect(closed).toBe(1);
  });

  it('geçersiz halka kapasitesini reddeder', () => {
    expect(() => Logger.create({ src: 'a', capacity: 0 })).toThrow(RangeError);
    expect(() => Logger.create({ src: 'a', capacity: 1.5 })).toThrow(RangeError);
  });
});

describe('Logger.since', () => {
  it('boş günlükte boş sayfa ve next 0 döner', () => {
    expect(Logger.create({ src: 'a' }).since()).toEqual({ records: [], next: 0, dropped: 0 });
  });

  it('artımlı okur: next bir sonraki çağrının since değeridir', () => {
    const logger = Logger.create({ src: 'a' });
    for (const ev of ['a', 'b', 'c']) logger.info(ev);
    const first = logger.since(0, 2);
    expect(first.records.map((record) => record.ev)).toEqual(['a', 'b']);
    expect(first.next).toBe(2);
    const second = logger.since(first.next, 2);
    expect(second.records.map((record) => record.ev)).toEqual(['c']);
    expect(second.next).toBe(3);
    expect(logger.since(second.next)).toEqual({ records: [], next: 3, dropped: 0 });
  });

  it('halka dolunca eski kayıtları düşer ve kaç tane düştüğünü bildirir', () => {
    const logger = Logger.create({ src: 'a', capacity: 3 });
    for (let index = 1; index <= 5; index++) logger.info(`e${index}`);
    const page = logger.since(0);
    expect(page.records.map((record) => record.ev)).toEqual(['e3', 'e4', 'e5']);
    expect(page.dropped).toBe(2);
    expect(page.next).toBe(5);
    expect(logger.since(3).dropped).toBe(0);
  });

  it('sonu aşan since değerini kırpar', () => {
    const logger = Logger.create({ src: 'a' });
    logger.info('a');
    expect(logger.since(99)).toEqual({ records: [], next: 1, dropped: 0 });
  });

  it('seviye süzgeci kayıtları eler ama okuma imlecini ilerletir', () => {
    const logger = Logger.create({ src: 'a' });
    logger.setLevel('debug');
    logger.debug('d');
    logger.info('i');
    logger.error('e');
    logger.debug('d2');
    const page = logger.since(0, 200, 'warn');
    expect(page.records.map((record) => record.ev)).toEqual(['e']);
    expect(page.next).toBe(4);
  });
});

describe('errorData', () => {
  it('hata adını, iletisini ve en çok beş satır yığını taşır', () => {
    const data = errorData(new TypeError('kırık'));
    expect(data.name).toBe('TypeError');
    expect(data.message).toBe('kırık');
    expect(String(data.stack).split('\n').length).toBeLessThanOrEqual(5);
  });

  it('hata olmayan değeri metne çevirir', () => {
    expect(errorData('düz')).toEqual({ message: 'düz' });
    expect(errorData(7)).toEqual({ message: '7' });
  });
});

describe('hedefler', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('stdoutSink satırın sonuna yeni satır ekler', () => {
    const written: string[] = [];
    const logger = Logger.create({ src: 'a', sinks: [stdoutSink((text) => written.push(text))] });
    logger.info('x');
    expect(written).toHaveLength(1);
    expect(written[0].endsWith('\n')).toBe(true);
    expect(parse(written[0]).ev).toBe('x');
  });

  it('fileSink iç içe dizini kurar, kapanışta biriken satırları yazar ve kapanıştan sonra yazmaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vol-log-'));
    dirs.push(dir);
    const path = join(dir, 'a', 'b', 'run.jsonl');
    const sink = fileSink(path, 60_000);
    const logger = Logger.create({ src: 'a', sinks: [sink] });
    logger.info('bir');
    logger.info('iki');
    logger.close();
    logger.info('kapalı');
    sink.close?.();
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    expect(lines.map((line) => parse(line).ev)).toEqual(['bir', 'iki']);
  });

  it('fileSink aralık dolunca kapanmadan yazar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vol-log-'));
    dirs.push(dir);
    const path = join(dir, 'run.jsonl');
    const sink = fileSink(path, 10);
    const logger = Logger.create({ src: 'a', sinks: [sink] });
    logger.info('erken');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(readFileSync(path, 'utf8')).toContain('erken');
    logger.close();
  });
});
