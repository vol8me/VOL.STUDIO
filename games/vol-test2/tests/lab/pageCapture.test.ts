import { describe, expect, it, vi } from 'vitest';
import { LabLog } from '../../src/lab/log';
import {
  capturePageErrors,
  formatArgs,
  REPEAT_LIMIT,
  type CaptureTargets,
} from '../../src/lab/pageCapture';

type Handler = (event: Event) => void;

function targets(): {
  targets: CaptureTargets;
  fire: (type: string, event: Partial<ErrorEvent & PromiseRejectionEvent> | Event) => void;
  removed: string[];
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const handlers = new Map<string, Handler>();
  const removed: string[] = [];
  const warn = vi.fn();
  const error = vi.fn();
  const fake: CaptureTargets = {
    window: {
      addEventListener: (type: string, handler: unknown) => {
        handlers.set(type, handler as Handler);
      },
      removeEventListener: (type: string) => {
        removed.push(type);
        handlers.delete(type);
      },
    },
    console: { warn, error },
  };
  return {
    targets: fake,
    fire: (type, event) => handlers.get(type)?.(event as Event),
    removed,
    warn,
    error,
  };
}

const make = (): LabLog =>
  new LabLog(
    500,
    () => new Date('2026-10-13T10:00:00.000Z'),
    () => 1,
  );
const events = (log: LabLog): string[] => log.since(0, 500).records.map((r) => `${r.src}:${r.ev}`);

describe('formatArgs', () => {
  it('metin, hata, nesne ve dairesel nesneyi tek satıra çevirir', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(formatArgs(['merhaba', 3, { x: 1 }])).toBe('merhaba 3 {"x":1}');
    expect(formatArgs([new Error('kırık')])).toContain('kırık');
    expect(formatArgs([circular])).toBe('[object Object]');
    expect(formatArgs([undefined])).toBe('undefined');
  });

  it('çok uzun metni keser', () => {
    const text = formatArgs(['x'.repeat(2000)]);
    expect(text.length).toBeLessThan(600);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('capturePageErrors', () => {
  it('yakalanmamış hatayı konumuyla günlüğe yazar', () => {
    const log = make();
    const t = targets();
    capturePageErrors(log, t.targets);
    t.fire('error', {
      message: 'boom',
      filename: 'a.js',
      lineno: 3,
      colno: 9,
      error: new Error('boom'),
    });
    const record = log.since(0, 10).records[0];
    expect(record).toMatchObject({ lvl: 'error', src: 'page', ev: 'error' });
    expect(record.data).toMatchObject({ message: 'boom', source: 'a.js', line: 3, col: 9 });
    expect(String(record.data?.stack)).toContain('boom');
  });

  it('kırık kaynak yüklemesi (img, script) kaynak adresiyle günlüğe düşer', () => {
    const log = make();
    const t = targets();
    capturePageErrors(log, t.targets);
    t.fire('error', { target: { tagName: 'IMG', src: 'http://x/kit.svg' } } as never);
    expect(log.since(0, 10).records[0]).toMatchObject({
      lvl: 'error',
      ev: 'resource',
      data: { tag: 'img', url: 'http://x/kit.svg' },
    });
    // Hedefi öğe olmayan hata olayı sessizce yok sayılır.
    t.fire('error', { target: {} } as never);
    t.fire('error', {});
    expect(log.head).toBe(1);
  });

  it('reddedilen sözü hata nesnesi ya da düz değer olarak yazar', () => {
    const log = make();
    const t = targets();
    capturePageErrors(log, t.targets);
    t.fire('unhandledrejection', { reason: new Error('söz düştü') });
    t.fire('unhandledrejection', { reason: 'düz neden' });
    const [first, second] = log.since(0, 10).records;
    expect(first.data).toMatchObject({ message: 'söz düştü' });
    expect(second.data).toMatchObject({ message: 'düz neden', stack: '' });
  });

  it('console.warn ve console.error günlüğe girer ama özgün işlev yine çağrılır', () => {
    const log = make();
    const t = targets();
    capturePageErrors(log, t.targets);
    t.targets.console.warn('Phaser', 'uyarısı');
    t.targets.console.error(new Error('kötü'));
    expect(t.warn).toHaveBeenCalledWith('Phaser', 'uyarısı');
    expect(t.error).toHaveBeenCalledTimes(1);
    expect(events(log)).toEqual(['console:warn', 'console:error']);
    expect(log.counts).toMatchObject({ warn: 1, error: 1 });
  });

  it(`aynı ileti ${REPEAT_LIMIT} kereden sonra yazılmaz; sınır bir kez uyarılır ve bastırılan sayılır`, () => {
    const log = make();
    const t = targets();
    const capture = capturePageErrors(log, t.targets);
    for (let index = 0; index < REPEAT_LIMIT + 30; index++) t.targets.console.error('tekrar');
    const written = events(log).filter((event) => event === 'console:error');
    expect(written).toHaveLength(REPEAT_LIMIT);
    expect(events(log).filter((event) => event === 'lab:repeat-limit')).toHaveLength(1);
    expect(capture.suppressed()).toBe(30);
    expect(t.error).toHaveBeenCalledTimes(REPEAT_LIMIT + 30);
    t.targets.console.error('başka');
    expect(events(log).filter((event) => event === 'console:error')).toHaveLength(REPEAT_LIMIT + 1);
  });

  it('dispose dinleyicileri ve özgün konsol işlevlerini geri koyar', () => {
    const log = make();
    const t = targets();
    const originalWarn = t.targets.console.warn;
    const capture = capturePageErrors(log, t.targets);
    expect(t.targets.console.warn).not.toBe(originalWarn);
    capture.dispose();
    expect(t.targets.console.warn).toBe(originalWarn);
    expect(t.removed.sort()).toEqual(['error', 'unhandledrejection']);
    t.targets.console.warn('artık yazılmaz');
    expect(log.head).toBe(0);
  });

  it('başkası konsola sarmalayıcı koyduysa onun zincirini koparmaz', () => {
    const log = make();
    const t = targets();
    const capture = capturePageErrors(log, t.targets);
    const outer = vi.fn();
    t.targets.console.error = outer;
    capture.dispose();
    expect(t.targets.console.error).toBe(outer);
  });
});
