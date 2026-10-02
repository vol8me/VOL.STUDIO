import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('Deck sonda kapanış packet tüketicisi', () => {
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
        requestId: 'shutdown-1',
        reason: 'signal',
        signal: 15,
      },
    ]);
  });
});
