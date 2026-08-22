import { describe, it, expect } from 'vitest';
import type { SpriteDoc } from '@volstudio/core/visual';
import { PreviewRenderer, type PreviewFrame } from '../../src/preview/PreviewRenderer';

const DOC: SpriteDoc = {
  schemaVersion: 1,
  size: [512, 512],
  seed: 1,
  palette: { colors: ['#000000', '#ffffff'], ramps: [{ id: 0, indices: [0, 1] }] },
  layers: [{ id: 'a', source: { kind: 'sdf.circle', r: 0.5 }, material: 0 }],
} as SpriteDoc;

/** Zamanlayıcı ve saat enjekte edilen bir koşum ortamı. */
function harness(options: { costs?: number[] } = {}) {
  const tasks: Array<{ at: number; run: () => void }> = [];
  let time = 0;
  let costIndex = 0;
  const costs = options.costs ?? [];

  const renderer = new PreviewRenderer({
    budgetMs: 24,
    idleMs: 300,
    initialCap: 256,
    now: () => {
      // Her `now()` çifti bir render'ı çerçeveler: ilk okuma başlangıç,
      // ikinci okuma maliyeti EKLEDİKTEN SONRA bitiş zamanıdır.
      if (costIndex % 2 === 1) time += costs[Math.floor(costIndex / 2)] ?? 1;
      costIndex++;
      return time;
    },
    schedule: (callback, delay) => {
      tasks.push({ at: time + delay, run: callback });
      return tasks.length - 1;
    },
    cancel: (handle) => {
      if (tasks[handle]) tasks[handle] = { at: Infinity, run: () => undefined };
    },
  });

  const frames: PreviewFrame[] = [];
  renderer.subscribe((frame) => frames.push(frame));

  /** Bekleyen görevlerden en yakın zamanlıyı koşturur. */
  const flush = (count = 1): void => {
    for (let i = 0; i < count; i++) {
      const next = tasks
        .map((task, index) => ({ task, index }))
        .filter((entry) => entry.task.at !== Infinity)
        .sort((a, b) => a.task.at - b.task.at)[0];
      if (!next) return;
      tasks[next.index] = { at: Infinity, run: () => undefined };
      time = Math.max(time, next.task.at);
      next.task.run();
    }
  };

  return { renderer, frames, flush };
}

describe('canlı önizleme (§8.8)', () => {
  it('önizleme çıktı boyunu AŞMAZ ve en-boy oranını korur', () => {
    const { renderer } = harness();
    const wide = { ...DOC, size: [1024, 256] } as SpriteDoc;
    const [width, height] = renderer.previewSize(wide);

    expect(Math.max(width, height)).toBeLessThanOrEqual(renderer.currentCap);
    expect(width / height).toBeCloseTo(4, 1);

    // Çıktı zaten küçükse büyütülmez.
    const small = { ...DOC, size: [32, 32] } as SpriteDoc;
    expect(renderer.previewSize(small)).toEqual([32, 32]);
  });

  it('istek zamanlanır ve tek kare üretir', () => {
    const { renderer, frames, flush } = harness();
    renderer.request(DOC);
    expect(frames).toHaveLength(0);

    flush();
    expect(frames).toHaveLength(1);
    expect(frames[0].error).toBeNull();
    expect(frames[0].full).toBe(false);
  });

  it('KUYRUK YOK — arada gelen belgeler düşürülür', () => {
    const { renderer, frames, flush } = harness();
    renderer.request({ ...DOC, seed: 1 } as SpriteDoc);
    renderer.request({ ...DOC, seed: 2 } as SpriteDoc);
    renderer.request({ ...DOC, seed: 3 } as SpriteDoc);

    flush();
    // Üç istek, TEK kare; kazanan en yenisi.
    expect(frames).toHaveLength(1);
    expect(frames[0].result?.doc.seed).toBe(3);
  });

  it('bütçe aşılınca çözünürlük YARIYA iner', () => {
    const { renderer, flush } = harness({ costs: [100, 100] });
    const before = renderer.currentCap;
    renderer.request(DOC);
    flush();
    expect(renderer.currentCap).toBe(before / 2);
  });

  it('bütçenin belirgin altındaysa geri TIRMANIR', () => {
    const { renderer, flush } = harness({ costs: [1, 1, 1] });
    const before = renderer.currentCap;
    renderer.request(DOC);
    flush();
    expect(renderer.currentCap).toBeGreaterThan(before);
  });

  it('önizleme boyu ÇIKTI boyunu asla aşmaz', () => {
    // Sınır çıktıdan büyük kalabilir (ölçümü bozmaz) ama önizleme boyu
    // çıktıyı geçemez: büyütülmüş bir önizleme yanıltıcı olurdu.
    const { renderer, frames, flush } = harness({ costs: [1, 1, 1, 1, 1, 1, 1, 1] });
    const small = { ...DOC, size: [64, 64] } as SpriteDoc;
    for (let i = 0; i < 4; i++) {
      renderer.request(small);
      flush();
    }
    for (const frame of frames) {
      expect(frame.result?.width).toBeLessThanOrEqual(64);
    }
  });

  it('boşta kalınca TAM çözünürlükte bir kare üretilir', () => {
    const { renderer, frames, flush } = harness();
    renderer.request(DOC);
    flush(); // hızlı kare
    flush(); // boşta kare
    const last = frames[frames.length - 1];
    expect(last.full).toBe(true);
    expect(last.result?.width).toBe(512);
  });

  it('geçersiz belge kare yerine HATA verir, patlamaz', () => {
    const { renderer, frames, flush } = harness();
    renderer.request({ ...DOC, layers: [] } as unknown as SpriteDoc);
    flush();
    expect(frames[0].result).toBeNull();
    expect(frames[0].error).toMatch(/geçersiz/);
  });

  it('dispose bekleyen işi ve dinleyicileri bırakır', () => {
    const { renderer, frames, flush } = harness();
    renderer.request(DOC);
    renderer.dispose();
    flush(3);
    expect(frames).toHaveLength(0);
  });
});
