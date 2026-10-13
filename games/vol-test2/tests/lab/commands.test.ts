import { describe, expect, it } from 'vitest';
import { buildCommands, dispatch, LAB_API_VERSION, parseBaseline } from '../../src/lab/commands';
import { LabLog } from '../../src/lab/log';
import type { LabRuntime, Outcome } from '../../src/lab/runtime';
import type { WorkloadDef } from '../../src/lab/workload';

const WORKLOADS: WorkloadDef[] = [
  {
    id: 'alpha',
    title: 'Alfa',
    summary: 'a',
    scene: 's',
    params: [{ name: 'count', type: 'integer', default: 1, min: 1, max: 9, description: 'adet' }],
    actions: [{ name: 'setCount', summary: 'adet', args: [] }],
    create: () => Promise.reject(new Error('kullanılmaz')),
  },
  {
    id: 'beta',
    title: 'Beta',
    summary: 'b',
    scene: 's',
    params: [],
    actions: [{ name: 'tap', summary: 'dokun', args: [] }],
    create: () => Promise.reject(new Error('kullanılmaz')),
  },
];

const COMMANDS = buildCommands(WORKLOADS);

interface Calls {
  start: unknown[];
  action: [string, Record<string, unknown>][];
  rejudge: unknown[];
}

function fakeRuntime(overrides: Record<string, unknown> = {}): {
  runtime: LabRuntime;
  calls: Calls;
  log: LabLog;
} {
  const log = new LabLog(100);
  const calls: Calls = { start: [], action: [], rejudge: [] };
  const runtime = {
    log,
    observeOnly: false,
    status: () => ({ state: 'idle' }),
    start: (options: unknown) => {
      calls.start.push(options);
      return Promise.resolve({ ok: true, data: { runId: 1, paramsKey: 'k' } });
    },
    waitFinished: () => Promise.resolve({ runId: 1, verdict: { status: 'pass' } }),
    stop: () => ({ ok: true, data: { runId: 1 } }),
    reset: () => undefined,
    metrics: () => ({ state: 'idle' }),
    environment: () => ({ engine: 'chromium' }),
    rejudge: (options: unknown, baseline: unknown) => {
      calls.rejudge.push([options, baseline]);
      return { status: 'pass' };
    },
    action: (name: string, args: Record<string, unknown>) => {
      calls.action.push([name, args]);
      return { ok: true, data: { done: true } };
    },
    ...overrides,
  } as unknown as LabRuntime;
  return { runtime, calls, log };
}

async function call(runtime: LabRuntime, name: string, input?: unknown): Promise<Outcome<unknown>> {
  return dispatch(COMMANDS, runtime, name, input);
}

function errorOf(outcome: Outcome<unknown>): { code: string; message: string } {
  if (outcome.ok) throw new Error('hata bekleniyordu');
  return outcome.error;
}

describe('komut kataloğu', () => {
  it('describe sürümü, komutları (nesne argümanlarıyla) ve yükleri verir', async () => {
    const { runtime } = fakeRuntime();
    const outcome = await call(runtime, 'describe');
    expect(outcome.ok).toBe(true);
    const data = (
      outcome as {
        data: {
          version: number;
          commands: { name: string; objectArgs: string[] }[];
          workloads: unknown[];
        };
      }
    ).data;
    expect(data.version).toBe(LAB_API_VERSION);
    expect(data.commands.map((command) => command.name)).toEqual(
      COMMANDS.map((command) => command.name),
    );
    expect(data.commands.find((command) => command.name === 'start')?.objectArgs).toEqual([
      'params',
    ]);
    expect(data.workloads).toEqual([
      { id: 'alpha', title: 'Alfa' },
      { id: 'beta', title: 'Beta' },
    ]);
  });

  it('komut adları benzersizdir ve her komutun özeti vardır', () => {
    expect(new Set(COMMANDS.map((command) => command.name)).size).toBe(COMMANDS.length);
    for (const command of COMMANDS)
      expect(command.summary.length, command.name).toBeGreaterThan(10);
  });

  it('workloads parametre şeması ve eylemleri listeler', async () => {
    const { runtime } = fakeRuntime();
    const outcome = await call(runtime, 'workloads');
    const data = (outcome as { data: { id: string; actions: { name: string }[] }[] }).data;
    expect(data.map((workload) => workload.id)).toEqual(['alpha', 'beta']);
    expect(data[0].actions[0].name).toBe('setCount');
  });
});

describe('dispatch', () => {
  it('bilinmeyen komutu geçerli adlarla reddeder', async () => {
    const { runtime } = fakeRuntime();
    const error = errorOf(await call(runtime, 'yok'));
    expect(error.code).toBe('unknown-command');
    expect(error.message).toContain('describe');
  });

  it('nesne olmayan girdiyi ve bilinmeyen argümanı reddeder; geçerli nesne argümanlarını sayar', async () => {
    const { runtime } = fakeRuntime();
    expect(errorOf(await call(runtime, 'status', 5)).code).toBe('bad-args');
    expect(errorOf(await call(runtime, 'status', [1])).code).toBe('bad-args');
    const unknown = errorOf(await call(runtime, 'start', { workload: 'alpha', durationn: 1 }));
    expect(unknown.code).toBe('bad-args');
    expect(unknown.message).toContain('durationn');
    expect(unknown.message).toContain('params');
    // notes metnindeki bir sözcük argüman sayılmaz.
    expect(errorOf(await call(runtime, 'start', { workload: 'alpha', yükün: {} })).code).toBe(
      'bad-args',
    );
  });

  it('girdi null ya da boşsa varsayılanlarla çalışır', async () => {
    const { runtime } = fakeRuntime();
    expect((await call(runtime, 'status')).ok).toBe(true);
    expect((await call(runtime, 'status', null)).ok).toBe(true);
    expect((await call(runtime, 'status', {})).ok).toBe(true);
  });

  it('komut fırlatırsa internal döner, günlüğe yazılır ve dispatch fırlatmaz', async () => {
    const { runtime, log } = fakeRuntime({
      metrics: () => {
        throw new Error('patladı');
      },
    });
    const error = errorOf(await call(runtime, 'metrics'));
    expect(error).toEqual({ code: 'internal', message: 'patladı' });
    expect(log.counts.error).toBe(1);
  });
});

describe('start ve run', () => {
  it('start varsayılanları ve nesne argümanı yükle birlikte geçirir', async () => {
    const { runtime, calls } = fakeRuntime();
    await call(runtime, 'start', { workload: 'beta', params: { x: 1 }, durationMs: 1000 });
    expect(calls.start[0]).toEqual({
      workload: 'beta',
      params: { x: 1 },
      durationMs: 1000,
      warmupMs: 1500,
    });
    await call(runtime, 'start', {});
    expect(calls.start[1]).toMatchObject({ workload: 'alpha', durationMs: 8000, warmupMs: 1500 });
  });

  it.each([
    [{ workload: 'gamma' }, 'workload'],
    [{ durationMs: 10 }, 'durationMs'],
    [{ durationMs: 600_001 }, 'durationMs'],
    [{ warmupMs: -1 }, 'warmupMs'],
    [{ durationMs: 1000.5 }, 'durationMs'],
    [{ durationMs: '1000' }, 'durationMs'],
  ])('start %j geçersizdir', async (input, field) => {
    const { runtime, calls } = fakeRuntime();
    const error = errorOf(await call(runtime, 'start', input));
    expect(error.code).toBe('bad-args');
    expect(error.message).toContain(field);
    expect(calls.start).toHaveLength(0);
  });

  it('run başlatır, bitişi bekler ve raporu döndürür', async () => {
    let waited = 0;
    const { runtime } = fakeRuntime({
      waitFinished: (timeoutMs: number) => {
        waited = timeoutMs;
        return Promise.resolve({ runId: 7 });
      },
    });
    const outcome = await call(runtime, 'run', {
      workload: 'alpha',
      durationMs: 2000,
      warmupMs: 500,
    });
    expect(outcome).toEqual({ ok: true, data: { runId: 7 } });
    expect(waited).toBe(2000 + 500 + 15_000);
  });

  it('run: başlatma hatası olduğu gibi döner; bitiş gelmezse timeout', async () => {
    const failing = fakeRuntime({
      start: () => Promise.resolve({ ok: false, error: { code: 'busy', message: 'meşgul' } }),
    });
    expect(errorOf(await call(failing.runtime, 'run', {})).code).toBe('busy');

    const hung = fakeRuntime({ waitFinished: () => Promise.resolve(null) });
    expect(errorOf(await call(hung.runtime, 'run', {})).code).toBe('timeout');
  });
});

describe('verdict ve parseBaseline', () => {
  const BASELINE = {
    workload: 'alpha',
    paramsKey: 'count=1',
    engine: 'chromium',
    rendererClass: 'hardware',
    workP95Ms: 2,
    intervalP99Ms: 17,
  };

  it('parseBaseline: yok → null; eksik ya da bozuk alan açık mesaj verir', () => {
    expect(parseBaseline(undefined)).toBeNull();
    expect(parseBaseline(null)).toBeNull();
    expect(parseBaseline(BASELINE)).toEqual(BASELINE);
    expect(parseBaseline(5)).toBe('baseline bir nesne olmalı');
    expect(parseBaseline({ workload: 'a' })).toContain('baseline alanları eksik');
    expect(parseBaseline({ ...BASELINE, engine: 'opera' })).toBe('baseline.engine geçersiz');
    expect(parseBaseline({ ...BASELINE, rendererClass: 'gpu' })).toBe(
      'baseline.rendererClass geçersiz',
    );
    expect(parseBaseline({ ...BASELINE, workP95Ms: Number.NaN })).toContain('eksik');
    expect(parseBaseline({ ...BASELINE, workP95Ms: '2' })).toContain('eksik');
  });

  it('verdict taban çizgiyi ve donanım şartını runtime a iletir', async () => {
    const { runtime, calls } = fakeRuntime();
    expect((await call(runtime, 'verdict', { requireHardware: true, baseline: BASELINE })).ok).toBe(
      true,
    );
    expect(calls.rejudge[0]).toEqual([{ requireHardware: true }, BASELINE]);
  });

  it('verdict: bozuk taban reddedilir, koşu yoksa no-run', async () => {
    const { runtime } = fakeRuntime();
    expect(errorOf(await call(runtime, 'verdict', { baseline: { workload: 'x' } })).code).toBe(
      'bad-args',
    );
    const empty = fakeRuntime({ rejudge: () => null });
    expect(errorOf(await call(empty.runtime, 'verdict')).code).toBe('no-run');
  });
});

describe('telemetry ve errors', () => {
  it('telemetry since/limit/minLevel ile artımlı okur ve girdiyi doğrular', async () => {
    const { runtime, log } = fakeRuntime();
    log.info('lab', 'a');
    log.warn('lab', 'b');
    log.error('lab', 'c');
    const all = (await call(runtime, 'telemetry', {})) as {
      ok: true;
      data: { records: { ev: string }[]; next: number };
    };
    expect(all.data.records.map((record) => record.ev)).toEqual(['a', 'b', 'c']);
    const warn = (await call(runtime, 'telemetry', { minLevel: 'warn' })) as typeof all;
    expect(warn.data.records.map((record) => record.ev)).toEqual(['b', 'c']);
    const tail = (await call(runtime, 'telemetry', { since: all.data.next - 1 })) as typeof all;
    expect(tail.data.records.map((record) => record.ev)).toEqual(['c']);
    expect(errorOf(await call(runtime, 'telemetry', { since: -1 })).code).toBe('bad-args');
    expect(errorOf(await call(runtime, 'telemetry', { minLevel: 'trace' })).code).toBe('bad-args');
    expect(errorOf(await call(runtime, 'telemetry', { limit: 0 })).code).toBe('bad-args');
  });

  it('errors sayıları ve son kayıtları sınırlı verir', async () => {
    const { runtime, log } = fakeRuntime();
    log.warn('page', 'w1');
    for (let index = 0; index < 5; index++) log.error('page', `e${index}`);
    log.info('lab', 'gürültü');
    const outcome = (await call(runtime, 'errors', { limit: 2 })) as {
      ok: true;
      data: { errors: number; warnings: number; recent: { ev: string }[] };
    };
    expect(outcome.data.errors).toBe(5);
    expect(outcome.data.warnings).toBe(1);
    expect(outcome.data.recent.map((record) => record.ev)).toEqual(['e3', 'e4']);
  });
});

describe('action', () => {
  it('eylem adı zorunludur: verilmezse setCount a düşmez', async () => {
    const { runtime, calls } = fakeRuntime();
    const error = errorOf(await call(runtime, 'action', {}));
    expect(error).toEqual({ code: 'bad-args', message: 'name: zorunlu' });
    expect(calls.action).toHaveLength(0);
  });

  it('yalnız kayıtlı eylem adlarını kabul eder ve nesne argümanını geçirir', async () => {
    const { runtime, calls } = fakeRuntime();
    expect(errorOf(await call(runtime, 'action', { name: 'yok' })).code).toBe('bad-args');
    expect((await call(runtime, 'action', { name: 'tap', args: { x: 3 } })).ok).toBe(true);
    expect(calls.action).toEqual([['tap', { x: 3 }]]);
    expect((await call(runtime, 'action', { name: 'setCount' })).ok).toBe(true);
    expect(calls.action[1]).toEqual(['setCount', {}]);
    expect(errorOf(await call(runtime, 'action', { name: 'tap', args: 5 })).code).toBe('bad-args');
  });
});

describe('durum komutları', () => {
  it('reset durumu döndürür; stop runtime sonucunu olduğu gibi aktarır', async () => {
    let resets = 0;
    const { runtime } = fakeRuntime({
      reset: () => {
        resets++;
      },
      stop: () => ({ ok: false, error: { code: 'not-running', message: 'yok' } }),
    });
    expect(await call(runtime, 'reset')).toEqual({ ok: true, data: { state: 'idle' } });
    expect(resets).toBe(1);
    expect(errorOf(await call(runtime, 'stop')).code).toBe('not-running');
  });
});
