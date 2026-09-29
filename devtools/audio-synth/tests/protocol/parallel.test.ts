import { existsSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import type { BatchEstimate } from '../../src/guard/batch';
import { withRenderSession } from '../../src/engine/session';
import { batchWorkers, DEFAULT_PARALLEL_POLICY, WORKERS_ENV } from '../../src/guard/parallel';
import { hashCanonical } from '../../src/protocol/canonical';
import { checkFamily } from '../../src/protocol/family';
import { checkMusic, loadMusicDocuments } from '../../src/protocol/music';
import { ParallelTaskError, runTasks } from '../../src/protocol/parallel';
import { serveTasks } from '../../src/protocol/parallelTasks';
import { RENDER_CACHE_ROOT, repoRenderCache } from '../../src/protocol/renderCacheStore';
import { runSearch } from '../../src/protocol/search';
import { shellFamily } from '../family/fixtures';
import { shellSpec } from '../search/fixtures';
import { PIPELINE_TIMEOUT } from '../support/timeouts';
import { createTestRepo, testProgram, type TestRepo } from './repo';

const REPO = new URL('../../../../', import.meta.url).pathname;
const SEARCHES = 'devtools/audio-synth/audio-searches';

const estimate = (over: Partial<BatchEstimate> = {}): BatchEstimate => ({
  items: 32,
  totalWorkUnits: 1e9,
  maxItemPeakBytes: 64 * 1024 ** 2,
  estimatedSeconds: 20,
  ...over,
});

const policy = { ...DEFAULT_PARALLEL_POLICY, maxWorkers: 7 };

afterEach(() => {
  delete process.env[WORKERS_ENV];
});

describe('eşzamanlılık politikası', () => {
  it('küçük toplu iş seri koşar; worker başına en az eşik kadar iş düşer', () => {
    expect(batchWorkers(estimate({ estimatedSeconds: 1.5 }), undefined, policy)).toBe(1);
    expect(batchWorkers(estimate({ estimatedSeconds: 5 }), undefined, policy)).toBe(2);
    expect(batchWorkers(estimate(), undefined, policy)).toBe(7);
  });

  it('bellek tavanı ve öğe sayısı worker sayısını sınırlar; açık istek eşiği atlar', () => {
    const heavy = estimate({ maxItemPeakBytes: policy.maxConcurrentPeakBytes / 3 });
    expect(batchWorkers(heavy, undefined, policy)).toBe(3);
    expect(batchWorkers(estimate({ items: 2 }), undefined, policy)).toBe(2);
    expect(batchWorkers(estimate({ estimatedSeconds: 0.1 }), 4, policy)).toBe(4);
    expect(batchWorkers(heavy, 6, policy)).toBe(3);
  });

  it('ortam değişkeni worker sayısını sabitler; geçersiz değer sessizce yok sayılmaz', () => {
    process.env[WORKERS_ENV] = '1';
    expect(batchWorkers(estimate(), undefined, policy)).toBe(1);
    process.env[WORKERS_ENV] = 'çok';
    expect(() => batchWorkers(estimate(), undefined, policy)).toThrow(WORKERS_ENV);
  });
});

describe('paralel toplu iş seri ile aynı sonucu aynı sırayla verir', () => {
  let repo: TestRepo | undefined;
  afterEach(() => repo?.cleanup());

  it(
    'arama koşusu: rapor ve dinleme kopyaları seri ve üç worker’da birebir aynı',
    () => {
      const outcome = (workers: number) => {
        repo?.cleanup();
        repo = createTestRepo();
        const run = runSearch(repo.root, SEARCHES, shellSpec(), { audition: true, workers });
        const root = repo.root;
        const auditions = run.auditions.map((file) => [
          file,
          hashCanonical(readFileSync(join(root, file)).toString('base64')),
        ]);
        return { report: run.reportHash, auditions };
      };
      const serial = outcome(1);
      const parallel = outcome(3);
      expect(parallel).toEqual(serial);
      expect(serial.auditions.length).toBeGreaterThan(3);
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'aile kontrolü: üyelerin özetleri, tanımlayıcıları ve kalite raporu aynı',
    () => {
      const serial = checkFamily(REPO, shellFamily(), { workers: 1 });
      const parallel = checkFamily(REPO, shellFamily(), { workers: 3 });
      expect(parallel.members).toEqual(serial.members);
      expect(parallel.quality).toEqual(serial.quality);
      expect(serial.members.map((m) => m.key)).toEqual(
        serial.variants.map((v: { key: string }) => v.key),
      );
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'müzik kontrolü: stem PCM’leri, mastering, QA ve çalışma zamanı sözleşmesi aynı',
    () => {
      const docs = loadMusicDocuments({
        repoRoot: REPO,
        musicRoot: 'devtools/audio-synth/audio-music',
        musicId: 'reference-adaptive',
      });
      const key = (c: ReturnType<typeof checkMusic>) => ({
        pcm: c.rendered.map((r) => r.pcmHash),
        mastering: c.mastering,
        qa: c.qa,
        spec: c.spec,
      });
      expect(key(checkMusic(REPO, docs, { workers: 3 }))).toEqual(
        key(checkMusic(REPO, docs, { workers: 1 })),
      );
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'worker içindeki hata adıyla ana iş parçacığına ulaşır',
    () => {
      const broken = [
        { key: 'a', program: { schema: 'AcousticProgramV1' } },
        { key: 'b', program: { schema: 'AcousticProgramV1' } },
      ];
      expect(() => runTasks(REPO, 'family-member', broken, 2)).toThrow(ParallelTaskError);
      expect(() => runTasks(REPO, 'family-member', broken, 2)).toThrow(/AudioParamError/);
    },
    PIPELINE_TIMEOUT,
  );
});

describe('ölen ya da asılı kalan worker (hata enjeksiyonu)', () => {
  const fault = (name: string) => new URL(`./faultWorkers/${name}.mjs`, import.meta.url);
  const inputs = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

  it('ölen worker kalp atışının durmasıyla saniyeler içinde adıyla düşer', () => {
    const started = Date.now();
    expect(() =>
      runTasks(REPO, 'family-member', inputs, 2, {
        workerUrl: fault('dies'),
        heartbeatStaleMs: 1_500,
      }),
    ).toThrow(/WorkerDied.*öldü/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('canlı ama yanıtsız görev kendi süre sınırında düşer', () => {
    expect(() =>
      runTasks(REPO, 'family-member', inputs, 2, {
        workerUrl: fault('hangs'),
        taskTimeoutMs: 1_500,
      }),
    ).toThrow(/görev yanıtı süre sınırını aştı/);
  });
});

describe('serveTasks — worker döngüsü (süreç içi kanal)', () => {
  let repo: TestRepo | undefined;
  afterEach(() => repo?.cleanup());

  /**
   * Worker gövdesi gerçek worker_thread içinde koşunca kapsam araçlamasına
   * girmez; aynı kod yolu in-process MessageChannel üzerinden sürülür.
   */
  async function request(port: MessagePort, message: unknown): Promise<Record<string, unknown>> {
    const pending = once(port, 'message');
    port.postMessage(message);
    const [response] = (await pending) as [Record<string, unknown>];
    return response;
  }

  it('hazır bildirimi, başarılı görev ve hata yanıtı üretir; her istek sinyal üretir', async () => {
    repo = createTestRepo();
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    try {
      serveTasks({ port: port2, signal });
      const ready = (await once(port1, 'message'))[0] as { ready: boolean };
      expect(ready.ready).toBe(true);
      expect(Atomics.load(signal, 0)).toBe(1);
      const ctx = { repoRoot: repo.root, quality: 'draft', cache: false };
      const ok = await request(port1, {
        id: 1,
        name: 'family-member',
        input: { key: 'k', program: testProgram({ seed: 9 }) },
        ctx,
      });
      expect(ok.ok).toBe(true);
      expect(ok.id).toBe(1);
      expect((ok.output as { pcmHash: string }).pcmHash).toMatch(/^sha256:/);
      expect(Atomics.load(signal, 0)).toBe(2);
      // Bozuk belge → catch dalı: hata adı ana tarafa taşınır.
      const bad = await request(port1, {
        id: 2,
        name: 'family-member',
        input: { key: 'b', program: { schema: 'AcousticProgramV1' } },
        ctx,
      });
      expect(bad.ok).toBe(false);
      expect(bad.id).toBe(2);
      expect((bad.error as { name: string }).name).toMatch(/Error/);
      expect(Atomics.load(signal, 0)).toBe(3);
    } finally {
      port1.close();
      port2.close();
    }
  });

  it('ctx.cache=true worker içinde depo disk önbelleğini açar', async () => {
    repo = createTestRepo();
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    try {
      serveTasks({ port: port2, signal });
      await once(port1, 'message');
      const ok = await request(port1, {
        id: 1,
        name: 'family-member',
        input: { key: 'k', program: testProgram({ seed: 4 }) },
        ctx: { repoRoot: repo.root, quality: 'draft', cache: true },
      });
      expect(ok.ok).toBe(true);
      // Disk önbelleği worker oturumu tarafından açıldı.
      expect(existsSync(join(repo.root, RENDER_CACHE_ROOT))).toBe(true);
    } finally {
      port1.close();
      port2.close();
    }
  });
});

describe('worker’lar ana oturumun önbellek kararını izler', () => {
  it(
    'ana oturumda önbellek yoksa disk önbelleği açılmaz; varsa worker’lar onu paylaşır, sonuç aynı',
    () => {
      const repo = createTestRepo();
      try {
        const inputs = [5, 6, 7].map((seed) => ({
          key: `s${seed}`,
          program: testProgram({ seed }),
        }));
        const plain = runTasks(repo.root, 'family-member', inputs, 2);
        expect(existsSync(join(repo.root, RENDER_CACHE_ROOT))).toBe(false);
        const cached = withRenderSession({ cache: repoRenderCache(repo.root) }, () =>
          runTasks(repo.root, 'family-member', inputs, 2),
        );
        expect(cached).toEqual(plain);
        expect(existsSync(join(repo.root, RENDER_CACHE_ROOT))).toBe(true);
      } finally {
        repo.cleanup();
      }
    },
    PIPELINE_TIMEOUT,
  );
});
