import { describe, expect, it, vi } from 'vitest';
import { GpuTimer, type GpuTimerSample } from '../../src/diagnostics/GpuTimer';

function fakeGl(version: 1 | 2) {
  const canvas = document.createElement('canvas');
  const queries: Array<{ ready: boolean; ns: unknown; deleted: boolean }> = [];
  let active: (typeof queries)[number] | null = null;
  let disjoint = false;
  let lost = false;
  let resultReads = 0;
  let failRead = false;
  let failBegin = false;
  let failEnd = false;
  let failDelete = false;
  let failExtension = false;
  let disjointOnRead = false;
  let nullQuery = false;
  let noExtension = false;
  const api = {
    create() {
      if (nullQuery) return null;
      const query = { ready: false, ns: 2_500_000, deleted: false };
      queries.push(query);
      return query;
    },
    begin(_target: number, query: (typeof queries)[number]) {
      if (failBegin) throw new Error('begin');
      if (active) throw new Error('query already active');
      active = query;
    },
    end() {
      if (failEnd) throw new Error('end');
      if (!active) throw new Error('query not active');
      active = null;
    },
    delete(query: (typeof queries)[number]) {
      if (query.deleted) throw new Error('double delete');
      query.deleted = true;
      if (failDelete) throw new Error('delete');
    },
    read(query: (typeof queries)[number], kind: number) {
      if (failRead) throw new Error('read');
      if (kind === 2) {
        if (disjointOnRead) disjoint = true;
        return query.ready;
      }
      if (!query.ready) throw new Error('result before ready');
      resultReads++;
      return query.ns;
    },
  };
  const extension =
    version === 2
      ? { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 3 }
      : {
          TIME_ELAPSED_EXT: 1,
          GPU_DISJOINT_EXT: 3,
          QUERY_RESULT_AVAILABLE_EXT: 2,
          QUERY_RESULT_EXT: 4,
          createQueryEXT: api.create,
          beginQueryEXT: api.begin,
          endQueryEXT: api.end,
          deleteQueryEXT: api.delete,
          getQueryObjectEXT: api.read,
        };
  const gl = {
    canvas,
    isContextLost: () => lost,
    getExtension: (name: string) => {
      if (failExtension) throw new Error('extension');
      if (noExtension) return null;
      return name ===
        (version === 2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query')
        ? extension
        : null;
    },
    getParameter: () => disjoint,
    ...(version === 2
      ? {
          createQuery: api.create,
          beginQuery: api.begin,
          endQuery: api.end,
          deleteQuery: api.delete,
          getQueryParameter: api.read,
          QUERY_RESULT_AVAILABLE: 2,
          QUERY_RESULT: 4,
        }
      : {}),
  };
  return {
    gl: gl as unknown as WebGLRenderingContext,
    canvas,
    queries,
    resultReads: () => resultReads,
    active: () => active,
    setDisjoint: (value: boolean) => {
      disjoint = value;
    },
    lose: () => {
      lost = true;
      canvas.dispatchEvent(new Event('webglcontextlost'));
    },
    restore: () => {
      lost = false;
      canvas.dispatchEvent(new Event('webglcontextrestored'));
    },
    fail: () => {
      failRead = true;
    },
    nullQuery: () => {
      nullQuery = true;
    },
    failBegin: () => {
      failBegin = true;
    },
    failEnd: () => {
      failEnd = true;
    },
    failDelete: () => {
      failDelete = true;
    },
    failExtension: () => {
      failExtension = true;
    },
    disjointOnRead: () => {
      disjointOnRead = true;
    },
    loseWithoutEvent: () => {
      lost = true;
    },
    noExtension: () => {
      noExtension = true;
    },
  };
}

describe.each([1, 2] as const)('GpuTimer WebGL%s', (version) => {
  it('ready öncesi result okumaz, sonraki poll özgün frame kimliğiyle ns -> ms verir', () => {
    const fixture = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(fixture.gl, { onSample: (sample) => samples.push(sample) });
    expect(timer.begin(17)).toBe(true);
    timer.end();
    timer.poll();
    expect(fixture.resultReads()).toBe(0);
    expect(samples).toEqual([]);
    fixture.queries[0].ready = true;
    timer.poll();
    expect(samples).toEqual([{ frameId: 17, status: 'ready', durationMs: 2.5 }]);
    expect(fixture.queries[0].deleted).toBe(true);
    timer.destroy();
  });

  it('pending ve active birlikte en çok dört query taşır', () => {
    const fixture = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(fixture.gl, { onSample: (sample) => samples.push(sample) });
    for (let id = 1; id <= 4; id++) {
      expect(timer.begin(id)).toBe(true);
      timer.end();
    }
    expect(timer.begin(5)).toBe(false);
    expect(fixture.queries).toHaveLength(4);
    expect(samples.at(-1)).toEqual({ frameId: 5, status: 'unavailable', durationMs: null });
    fixture.queries[0].ready = true;
    timer.poll();
    expect(timer.begin(6)).toBe(true);
    timer.end();
    timer.destroy();
    expect(fixture.queries.every((query) => query.deleted)).toBe(true);
  });

  it('disjoint active ve pending bütün sonuçları iptal eder, sonuç okumaz', () => {
    const fixture = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(fixture.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    timer.begin(2);
    fixture.queries[0].ready = true;
    fixture.setDisjoint(true);
    timer.poll();
    expect(fixture.resultReads()).toBe(0);
    expect(fixture.active()).toBeNull();
    expect(fixture.queries.every((query) => query.deleted)).toBe(true);
    expect(samples.map((sample) => sample.status)).toEqual(['disjoint', 'disjoint']);
    expect(samples.every((sample) => sample.durationMs === null)).toBe(true);
    fixture.setDisjoint(false);
    expect(timer.begin(3)).toBe(true);
    timer.end();
    timer.destroy();
  });

  it('context lost queryleri bırakır, eski sonucu yayınlamaz ve restore ile yeniden başlar', () => {
    const fixture = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(fixture.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    timer.begin(2);
    fixture.lose();
    expect(fixture.queries.every((query) => query.deleted)).toBe(true);
    expect(timer.status).toBe('context-lost');
    expect(timer.begin(3)).toBe(false);
    fixture.restore();
    expect(timer.begin(4)).toBe(true);
    timer.end();
    timer.destroy();
    expect(samples.some((sample) => sample.status === 'ready')).toBe(false);
  });

  it('read exception error olur, kaynaklar kalmaz; destroy idempotenttir', () => {
    const fixture = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(fixture.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    fixture.fail();
    timer.poll();
    expect(samples.at(-1)).toEqual({ frameId: 1, status: 'error', durationMs: null });
    expect(fixture.queries[0].deleted).toBe(true);
    timer.destroy();
    timer.destroy();
    expect(timer.begin(2)).toBe(false);
    fixture.lose();
    expect(timer.status).toBe('destroyed');
  });

  it('query oluşturulamaması sıfır süre değil unavailable olarak bildirilir', () => {
    const fixture = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    fixture.nullQuery();
    const timer = new GpuTimer(fixture.gl, { onSample: (sample) => samples.push(sample) });
    expect(timer.begin(12)).toBe(false);
    expect(samples).toEqual([{ frameId: 12, status: 'unavailable', durationMs: null }]);
    timer.destroy();
  });

  it('availability okunurken oluşan disjoint sonucu yayınlamaz', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    f.queries[0].ready = true;
    f.disjointOnRead();
    timer.poll();
    expect(f.resultReads()).toBe(0);
    expect(samples).toEqual([{ frameId: 1, status: 'disjoint', durationMs: null }]);
    expect(f.queries[0].deleted).toBe(true);
    timer.destroy();
  });

  it('iç içe begin yeni sorgu oluşturmaz ve etkin sorgunun kimliğini değiştirmez', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(null);
    expect(timer.begin(2)).toBe(false);
    timer.end();
    timer.end();
    f.queries[0].ready = true;
    timer.poll();
    expect(f.queries).toHaveLength(1);
    expect(samples).toEqual([
      { frameId: 2, status: 'unavailable', durationMs: null },
      { frameId: null, status: 'ready', durationMs: 2.5 },
    ]);
    timer.destroy();
  });

  it.each([-1, NaN, Infinity, null, 'invalid'])(
    'geçersiz GPU sonucu %s hazır süre gibi yayınlanmaz',
    (ns) => {
      const f = fakeGl(version);
      const samples: GpuTimerSample[] = [];
      const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
      timer.begin(1);
      timer.end();
      f.queries[0].ns = ns;
      f.queries[0].ready = true;
      timer.poll();
      expect(samples).toEqual([{ frameId: 1, status: 'error', durationMs: null }]);
      expect(f.queries[0].deleted).toBe(true);
      timer.destroy();
    },
  );

  it('begin hatası yeni sorguyu siler ve bekleyen sorguları iptal eder', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    f.failBegin();
    expect(timer.begin(2)).toBe(false);
    expect(f.queries.every((query) => query.deleted)).toBe(true);
    expect(samples).toEqual([
      { frameId: 1, status: 'error', durationMs: null },
      { frameId: 2, status: 'error', durationMs: null },
    ]);
    timer.destroy();
  });

  it('end veya delete hatası geri kalan sorguların temizliğini engellemez', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    timer.begin(2);
    f.failEnd();
    f.failDelete();
    timer.end();
    expect(f.queries.every((query) => query.deleted)).toBe(true);
    expect(samples.map((sample) => sample.status)).toEqual(['error', 'error']);
    timer.destroy();
  });

  it('contextlost olayı gecikse bile poll kaybı görür ve restore eski sonucu canlandırmaz', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    timer.end();
    f.queries[0].ready = true;
    f.loseWithoutEvent();
    timer.poll();
    expect(samples).toEqual([{ frameId: 1, status: 'context-lost', durationMs: null }]);
    expect(timer.status).toBe('context-lost');
    f.restore();
    timer.poll();
    expect(samples).toHaveLength(1);
    expect(timer.begin(2)).toBe(true);
    timer.end();
    timer.destroy();
  });

  it('destroy canvas aboneliklerini kaldırır ve lost context başlangıcı restore ile düzelir', () => {
    const f = fakeGl(version);
    f.loseWithoutEvent();
    const remove = vi.spyOn(f.canvas, 'removeEventListener');
    const timer = new GpuTimer(f.gl, { onSample: () => undefined });
    expect(timer.status).toBe('context-lost');
    f.restore();
    expect(timer.begin(1)).toBe(true);
    timer.destroy();
    timer.destroy();
    expect(remove.mock.calls.map(([name]) => name)).toEqual([
      'webglcontextrestored',
      'webglcontextlost',
    ]);
    remove.mockRestore();
  });

  it('extension okuma hatası ölçümü çökertmeden açık error verir', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    f.failExtension();
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    expect(timer.status).toBe('error');
    expect(timer.begin(1)).toBe(false);
    expect(samples).toEqual([{ frameId: 1, status: 'error', durationMs: null }]);
    timer.destroy();
  });

  it('contextlost olayı gecikse bile begin eski sorguyu iptal eder ve yeni sorgu açmaz', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    timer.begin(1);
    f.loseWithoutEvent();
    expect(timer.begin(2)).toBe(false);
    expect(f.queries).toHaveLength(1);
    expect(f.queries[0].deleted).toBe(true);
    expect(samples).toEqual([
      { frameId: 1, status: 'context-lost', durationMs: null },
      { frameId: 2, status: 'context-lost', durationMs: null },
    ]);
    timer.destroy();
  });

  it('WebGL extension yokken unsupported durumu sıfır GPU süresine çevrilmez', () => {
    const f = fakeGl(version);
    const samples: GpuTimerSample[] = [];
    f.noExtension();
    const timer = new GpuTimer(f.gl, { onSample: (sample) => samples.push(sample) });
    expect(timer.begin(9)).toBe(false);
    expect(samples).toEqual([{ frameId: 9, status: 'unsupported', durationMs: null }]);
    timer.destroy();
  });
});

it('extension yokluğu ve null context unsupported olarak açık kalır', () => {
  const samples: GpuTimerSample[] = [];
  const timer = new GpuTimer(null, { onSample: (sample) => samples.push(sample) });
  expect(timer.status).toBe('unsupported');
  expect(timer.begin(8)).toBe(false);
  expect(samples).toEqual([{ frameId: 8, status: 'unsupported', durationMs: null }]);
  timer.destroy();
});
