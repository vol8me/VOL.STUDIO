import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { summarizeFrameIntervals } from '@volstudio/core/time';
import { describe, expect, it } from 'vitest';

describe('Deck sonda kapanış packet tüketicisi', () => {
  it('ölçüm fazlarını korur; sonsuz etkileşim fazında kare örnekleri biriktirmez', () => {
    let now = 1;
    let scene: { create(): void; update(time: number, delta: number): void };
    const records: Record<string, unknown>[] = [];
    const sandbox = {
      samplesAllocated: 0,
      summarize: summarizeFrameIntervals,
      window: {
        __TAURI__: {
          core: {
            invoke: (command: string, args: { line: string }) => {
              if (command !== 'plugin:vol-diagnostics|report') return new Promise(() => undefined);
              records.push(JSON.parse(args.line) as Record<string, unknown>);
              return Promise.resolve();
            },
          },
          event: { listen: () => Promise.resolve(() => undefined) },
        },
        addEventListener: () => undefined,
      },
      document: { getElementById: () => ({ textContent: '' }), addEventListener: () => undefined },
      performance: { now: () => now },
      setInterval: () => 1,
      requestAnimationFrame: () => 1,
      Phaser: {
        WEBGL: 1,
        Scale: { FIT: 1, CENTER_BOTH: 1 },
        Game: class {
          constructor(config: { scene: typeof scene }) {
            scene = config.scene;
            Object.assign(scene, {
              game: { loop: { actualFps: 60 } },
              add: {
                graphics: () => {
                  const graphics = {
                    fillStyle: () => graphics,
                    fillCircle: () => graphics,
                    generateTexture: () => undefined,
                    destroy: () => undefined,
                  };
                  return graphics;
                },
                image: () => ({ x: 0, y: 0, destroy: () => undefined }),
              },
            });
            scene.create();
          }
        },
      },
    };
    const source = readFileSync(new URL('../../web/probe.js', import.meta.url), 'utf8');
    runInNewContext(
      `
      const nativePush = Array.prototype.push;
      Array.prototype.push = function (...values) {
        if (values.every(value => typeof value === 'number')) samplesAllocated += values.length;
        return nativePush.apply(this, values);
      };
      ${source.replace(/^import .*;$/m, '')}
      runLoadPhases();
    `,
      sandbox,
    );
    for (now = 1001; now <= 27001; now += 1000) scene!.update(now, 1000);
    expect(
      records.filter((record) => record.type === 'phase').map((record) => record.frames),
    ).toEqual([5, 10, 10]);
    const measuredAllocations = sandbox.samplesAllocated;
    for (let frame = 0; frame < 5000; frame++) {
      now += 16;
      scene!.update(now, 16);
    }
    expect(sandbox.samplesAllocated).toBe(measuredAllocations);
  });
  it('report IPC reddini ekranda ve sonraki teslim kaydında kayıp olarak gösterir', async () => {
    const delivered: Record<string, unknown>[] = [];
    const detail = { textContent: '' };
    let attempts = 0;
    const source = readFileSync(new URL('../../web/probe.js', import.meta.url), 'utf8');
    const log = runInNewContext(source.replace(/^import .*;$/m, '') + '\nlog', {
      window: {
        __TAURI__: {
          core: {
            invoke: (command: string, args: { line: string }) => {
              if (command !== 'plugin:vol-diagnostics|report') return new Promise(() => undefined);
              if (++attempts === 1) return Promise.reject(new Error('disk'));
              delivered.push(JSON.parse(args.line) as Record<string, unknown>);
              return Promise.resolve();
            },
          },
          event: { listen: () => Promise.resolve(() => undefined) },
        },
        addEventListener: () => undefined,
      },
      document: { getElementById: () => detail, addEventListener: () => undefined },
      performance: { now: () => 10 },
      setInterval: () => 1,
      requestAnimationFrame: () => 1,
      Date,
    }) as (type: string) => Promise<void>;
    await log('phase');
    expect(detail.textContent).toContain('kayıp');
    await log('phase');
    expect(delivered[0]).toMatchObject({ lostReports: 1 });
  });

  it('native kapanışın kimliğini, nedenini ve sinyalini düz alanlarla kaydeder', async () => {
    const listeners = new Map<string, (event: { payload: unknown }) => Promise<void>>();
    const records: Record<string, unknown>[] = [];
    const source = readFileSync(new URL('../../web/probe.js', import.meta.url), 'utf8');
    runInNewContext(source.replace(/^import .*;$/m, ''), {
      window: {
        __TAURI__: {
          core: {
            invoke: (command: string, args: { line: string }) => {
              if (command === 'plugin:vol-diagnostics|report') {
                records.push(JSON.parse(args.line) as Record<string, unknown>);
                return Promise.resolve();
              }
              return new Promise(() => undefined);
            },
          },
          event: {
            listen: (event: string, handler: (event: { payload: unknown }) => Promise<void>) => {
              listeners.set(event, handler);
              return Promise.resolve(() => undefined);
            },
          },
        },
        addEventListener: () => undefined,
      },
      document: { getElementById: () => ({ textContent: '' }), addEventListener: () => undefined },
      performance: { now: () => 10 },
      setInterval: () => 1,
      requestAnimationFrame: () => 1,
      Date,
    });
    await listeners.get('vol:terminate')?.({
      payload: {
        requestId: 'shutdown-1',
        reason: 'signal',
        signal: 15,
      },
    });
    expect(records).toEqual([
      {
        v: 1,
        src: 'js',
        type: 'terminate-received',
        t: 10,
        wall: expect.any(Number) as unknown,
        lostReports: 0,
        requestId: 'shutdown-1',
        reason: 'signal',
        signal: 15,
      },
    ]);
  });
});
