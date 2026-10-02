import { EventEmitter } from 'node:events';
import Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GpuTimerSample } from '@volstudio/core';
import { RenderMeasurements, type CpuRenderSample } from '@/app/RenderMeasurements';

function fixture(webgl: boolean) {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const canvas = document.createElement('canvas');
  const events = new EventEmitter();
  const queries: Array<{ ready: boolean; deleted: boolean }> = [];
  let active: (typeof queries)[number] | null = null;
  const gl = {
    canvas,
    QUERY_RESULT_AVAILABLE: 2,
    QUERY_RESULT: 4,
    isContextLost: () => false,
    getExtension: () => ({ TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 3 }),
    getParameter: () => false,
    createQuery: () => {
      const query = { ready: false, deleted: false };
      queries.push(query);
      return query;
    },
    beginQuery: (_target: number, query: (typeof queries)[number]) => {
      active = query;
    },
    endQuery: () => {
      active = null;
    },
    deleteQuery: (query: (typeof queries)[number]) => {
      query.deleted = true;
    },
    getQueryParameter: (query: (typeof queries)[number], kind: number) => {
      if (kind === 2) return query.ready;
      if (!query.ready) throw new Error('not ready');
      return 3_000_000;
    },
  };
  const loop = { frame: 11 };
  const renderer = webgl ? { gl } : {};
  const game = { events, renderer, loop } as unknown as Phaser.Game;
  const cpu: CpuRenderSample[] = [];
  const gpu: GpuTimerSample[] = [];
  const measurements = new RenderMeasurements(game, {
    onCpuSample: (sample) => cpu.push(sample),
    onGpuSample: (sample) => gpu.push(sample),
  });
  return {
    events,
    loop,
    cpu,
    gpu,
    queries,
    measurements,
    game,
    active: () => active,
    now: (value: number) => {
      now = value;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('RenderMeasurements', () => {
  it('gerçek Game.step temizliği dışarıda, sahne çizimi ve renderer postRender süresini içeride tutar', () => {
    const f = fixture(true);
    Object.assign(f.game.renderer, {
      preRender: () => {
        expect(f.active()).toBeNull();
        f.now(50);
      },
      postRender: () => {
        expect(f.active()).toBe(f.queries[0]);
        f.now(60);
      },
    });
    Object.assign(f.game, {
      scene: {
        update: () => f.now(15),
        render: () => {
          expect(f.active()).toBe(f.queries[0]);
          f.now(57);
        },
      },
    });
    Phaser.Game.prototype.step.call(f.game, 0, 16);
    expect(f.cpu).toEqual([{ frameId: 11, durationMs: 10 }]);
    expect(f.active()).toBeNull();
    f.measurements.destroy();
  });

  it('game render olayları arasında CPU süresini ve sonraki poll GPU sonucunu aynı kimliğe bağlar', () => {
    const f = fixture(true);
    f.now(10);
    f.events.emit('prerender');
    expect(f.active()).toBe(f.queries[0]);
    f.now(17);
    f.events.emit('postrender');
    expect(f.active()).toBeNull();
    expect(f.cpu).toEqual([{ frameId: 11, durationMs: 7 }]);
    expect(f.gpu).toEqual([]);
    f.queries[0].ready = true;
    f.loop.frame = 12;
    f.now(20);
    f.events.emit('prerender');
    expect(f.gpu).toEqual([{ frameId: 11, status: 'ready', durationMs: 3 }]);
    f.now(24);
    f.events.emit('postrender');
    expect(f.cpu.at(-1)).toEqual({ frameId: 12, durationMs: 4 });
    f.measurements.destroy();
  });

  it('Canvas GPU süresi uydurmaz, CPU ölçümünü korur', () => {
    const f = fixture(false);
    f.now(30);
    f.events.emit('prerender');
    f.now(35);
    f.events.emit('postrender');
    expect(f.cpu).toEqual([{ frameId: 11, durationMs: 5 }]);
    expect(f.gpu).toEqual([{ frameId: 11, status: 'unsupported', durationMs: null }]);
    f.measurements.destroy();
  });

  it('oyun destroy aktif sorguyu ve bütün abonelikleri kaldırır; ikinci destroy güvenlidir', () => {
    const f = fixture(true);
    f.events.emit('prerender');
    f.events.emit('destroy');
    expect(f.active()).toBeNull();
    expect(f.queries[0].deleted).toBe(true);
    expect(f.events.listenerCount('prerender')).toBe(0);
    expect(f.events.listenerCount('postrender')).toBe(0);
    expect(f.events.listenerCount('destroy')).toBe(0);
    f.measurements.destroy();
    f.events.emit('postrender');
    f.events.emit('prerender');
    expect(f.cpu).toEqual([]);
    expect(f.queries).toHaveLength(1);
  });

  it('başlangıcı olmayan postrender sahte CPU ölçümü yayınlamaz', () => {
    const f = fixture(false);
    f.events.emit('postrender');
    expect(f.cpu).toEqual([]);
    f.measurements.destroy();
  });
});
