import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import enResources from '../src/i18n/en.json';
import trResources from '../src/i18n/tr.json';
import {
  STYLE_VARIANTS,
  benchSlot,
  bisectTab,
  runFrameBench,
  styleBisectTab,
  summarizeFrames,
  type BenchHooks,
} from '../src/frameBench';
import { FrameBenchController } from '../src/frameBenchController';

beforeAll(async () => {
  i18n.addResources('tr', 'volui', trResources);
  i18n.addResources('en', 'volui', enResources);
  await i18n.init();
  await i18next.changeLanguage('en');
}, 60_000);

function scroller(height = 3000, client = 600): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: height });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: client });
  return el;
}

function hooks(el: HTMLElement | null, tabs = ['a', 'b']): BenchHooks & { selected: string[] } {
  const selected: string[] = [];
  return {
    tabs,
    selected,
    select: (tab) => {
      selected.push(tab);
    },
    scroller: () => el,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  document.head.querySelectorAll('style').forEach((s) => s.remove());
  window.history.replaceState({}, '', '/');
});

/** Sahte zamanda bir ölçüm sözünü sonuna kadar yürütür. */
async function drive<T>(promise: Promise<T>, totalMs: number): Promise<T> {
  await vi.advanceTimersByTimeAsync(totalMs);
  return promise;
}

describe('summarizeFrames', () => {
  it('ortalama FPS, yüzdelikler, en kötü kare ve yavaş kare oranını hesaplar', () => {
    const intervals = [16, 16, 16, 16, 16, 16, 16, 16, 30, 50];
    const result = summarizeFrames('forms', intervals);
    expect(result.frames).toBe(10);
    expect(result.fps).toBeCloseTo((10 / 208) * 1000, 3);
    expect(result.p50Ms).toBe(16);
    expect(result.worstMs).toBe(50);
    expect(result.slowShare).toBeCloseTo(0.2, 5);
  });

  it('boş girdide sıfır döner (sıfıra bölme yok)', () => {
    expect(summarizeFrames('x', [])).toMatchObject({ frames: 0, fps: 0, worstMs: 0, slowShare: 0 });
  });
});

describe('runFrameBench', () => {
  it('her sekmeyi seçer, kaydırır ve kare aralıklarını ölçer; kap sonunda sıfırlanır', async () => {
    const el = scroller();
    const h = hooks(el);
    const progress: string[] = [];
    const run = runFrameBench(h, {
      durationMs: 500,
      settleMs: 50,
      onProgress: (tab, index, total) => progress.push(`${tab}${index}/${total}`),
    });
    const results = await drive(run, 3000);
    expect(h.selected).toEqual(['a', 'b']);
    expect(progress).toEqual(['a0/2', 'b1/2']);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.frames).toBeGreaterThan(20);
      expect(r.fps).toBeGreaterThan(40);
    }
    expect(el.scrollTop).toBe(0);
  });

  it('kaydırılacak yer yoksa kabı hafifçe oynatarak boyamayı zorlar ve sonda temizler', async () => {
    const el = scroller(300, 600);
    const transforms = new Set<string>();
    const original = el.style;
    const setter = vi.spyOn(original, 'transform', 'set').mockImplementation((value: string) => {
      transforms.add(value);
    });
    await drive(runFrameBench(hooks(el, ['only']), { durationMs: 200, settleMs: 10 }), 1000);
    setter.mockRestore();
    expect([...transforms]).toEqual(
      expect.arrayContaining(['translateY(0.01px)', 'translateY(0px)', '']),
    );
  });

  it('kap yoksa yalnız örnekler (hata yok)', async () => {
    const results = await drive(
      runFrameBench(hooks(null, ['t']), { durationMs: 100, settleMs: 10 }),
      800,
    );
    expect(results[0].frames).toBeGreaterThan(2);
  });
});

describe('bisectTab ve styleBisectTab', () => {
  function pageWithCards(titles: string[]): void {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'tabpanel');
    for (const title of titles) {
      const card = document.createElement('div');
      card.className = 'vol-showcase-card';
      const heading = document.createElement('span');
      heading.className = 'vol-showcase-card__title';
      heading.textContent = title;
      card.appendChild(heading);
      panel.appendChild(card);
    }
    document.body.appendChild(panel);
  }

  it('kartları sırayla gizleyip ölçer, görünürlüğü geri verir ve en büyük kazancı başa koyar', async () => {
    pageWithCards(['Birinci', 'İkinci']);
    const cards = [...document.querySelectorAll<HTMLElement>('.vol-showcase-card')];
    const result = await drive(
      bisectTab(hooks(scroller(), ['t']), 't', { durationMs: 200, maxRows: 5 }),
      4000,
    );
    expect(result.rows.map((r) => r.title).sort()).toEqual(['Birinci', 'İkinci']);
    expect(result.rows[0].gain).toBeGreaterThanOrEqual(result.rows[1].gain);
    expect(cards.every((c) => c.style.display === '')).toBe(true);
  });

  it('stil kategorilerini tek tek enjekte edip kaldırır; sonuç kazanca göre sıralanır', async () => {
    const result = await drive(styleBisectTab(hooks(scroller(), ['t']), 't', 200), 12_000);
    expect(result.rows).toHaveLength(STYLE_VARIANTS.length);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    const gains = result.rows.map((r) => r.gain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });
});

describe('FrameBenchController', () => {
  function controller(el = scroller()): { c: FrameBenchController; h: ReturnType<typeof hooks> } {
    const h = hooks(el, ['buttons', 'forms']);
    return { c: new FrameBenchController(() => h), h };
  }

  it('Shift+B ölçümü başlatır, ilerleme şeridi görünür, sonuç tablosu açılır ve yuvaya yazılır', async () => {
    const { c } = controller();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', shiftKey: true, bubbles: true }));
    expect(document.querySelector('.vol-showcase-bench-chip')).not.toBeNull();
    expect(benchSlot().running).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.querySelector('.vol-showcase-bench-chip')).toBeNull();
    const panel = document.querySelector('.vol-showcase-bench')!;
    expect(panel.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(panel.querySelector('p')!.textContent).toMatch(/FPS/);
    const slot = benchSlot();
    expect(slot.done).toBe(true);
    expect(slot.results).toHaveLength(2);
    expect(slot.environment?.viewport).toBeTruthy();
    c.destroy();
  });

  it('Esc sonuç tablosunu kapatır; düzenleme alanındayken Shift+B yok sayılır; ölçüm sürerken ikinci başlatma yok', async () => {
    const { c } = controller();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', shiftKey: true, bubbles: true }));
    expect(document.querySelector('.vol-showcase-bench-chip')).toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', shiftKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', shiftKey: true, bubbles: true }));
    expect(document.querySelectorAll('.vol-showcase-bench-chip')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.querySelector('.vol-showcase-bench')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.vol-showcase-bench')).toBeNull();
    c.destroy();
  });

  it('?bench adresi 1,5 sn sonra otomatik başlatır; destroy bekleyeni ve arayüzü temizler', async () => {
    window.history.replaceState({}, '', '/?bench');
    const { c } = controller();
    expect(document.querySelector('.vol-showcase-bench-chip')).toBeNull();
    await vi.advanceTimersByTimeAsync(1600);
    expect(document.querySelector('.vol-showcase-bench-chip')).not.toBeNull();
    c.destroy();
    expect(document.querySelector('.vol-showcase-bench-chip')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', shiftKey: true, bubbles: true }));
    expect(document.querySelector('.vol-showcase-bench-chip')).toBeNull();
  });

  it('yavaş sekme (<50 FPS) için kart ve stil ayrıştırması tabloya girer', async () => {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'tabpanel');
    const card = document.createElement('div');
    card.className = 'vol-showcase-card';
    const title = document.createElement('span');
    title.className = 'vol-showcase-card__title';
    title.textContent = 'Ağır kart';
    card.appendChild(title);
    panel.appendChild(card);
    document.body.appendChild(panel);
    // Sahte rAF'ı yavaşlat: 30 ms'lik kareler → ortalama ≈ 33 FPS (< 50).
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 30),
    );
    const h = hooks(scroller(), ['forms']);
    const c = new FrameBenchController(() => h);
    void c.start();
    await vi.advanceTimersByTimeAsync(120_000);
    const text = document.querySelector('.vol-showcase-bench')?.textContent ?? '';
    expect(text).toMatch(/Ağır kart/);
    expect(text).toMatch(/shadow/);
    expect(benchSlot().bisect).toHaveLength(1);
    expect(benchSlot().styleBisect).toHaveLength(1);
    vi.unstubAllGlobals();
    c.destroy();
  });
});
