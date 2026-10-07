import { expect, test, type Page } from '@playwright/test';
import {
  attributeFrames,
  installPageProbe,
  linkInputs,
  markSync,
  pipelineStates,
  readCapture,
  startTrace,
  traceClockOffset,
  unionIntervals,
  type FrameAttribution,
  type PageCapture,
  type TraceEvent,
} from './support/frameProbe';
import { aaNoise, distribution, writeReport } from './support/perfReport';

/**
 * Tarayıcı probunun KALİBRASYONU (UI-00.6): bilinen iş yüküyle prob, aynı kareye
 * atıf, girdi→görünür bağı, iz/kare kimliği ve A/A gürültüsü. Fixture küçük ve
 * bilinçlidir: bir düğmenin işleyicisi tam `data-ms` ms meşgul bekler ve bir
 * düğme eşzamanlı yerleşim zorlar; prob bunları gerçek değerlerinde bulmazsa
 * UI-03 pilotu ölçüme dayanamaz.
 */

const FIXTURE = `
<button id="js" data-ms="5" style="padding:8px">js</button>
<button id="layout" style="padding:8px">layout</button>
<div id="box"></div>
<script>
  const box = document.getElementById('box');
  document.getElementById('js').addEventListener('click', (event) => {
    const end = performance.now() + Number(event.currentTarget.dataset.ms);
    while (performance.now() < end) { /* bilinçli meşgul bekleme */ }
    event.currentTarget.classList.toggle('on');
    event.currentTarget.style.background = event.currentTarget.classList.contains('on') ? '#fc0' : '';
  });
  document.getElementById('layout').addEventListener('click', () => {
    for (let index = 0; index < 600; index += 1) {
      const row = document.createElement('div');
      row.textContent = 'satır ' + index;
      box.appendChild(row);
    }
    box.getBoundingClientRect(); // eşzamanlı yerleşimi JS içinde zorlar
  });
</script>`;

const FIXTURE_PATH = '/__probe-fixture.html';

async function openFixture(page: Page): Promise<void> {
  // Fixture gerçek bir gezinmeyle yüklenir: `addInitScript` ancak böyle çalışır
  // (`setContent` belge olay dinleyicilerini sıfırlar).
  await installPageProbe(page);
  await page.route(`**${FIXTURE_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: FIXTURE }),
  );
  await page.goto(FIXTURE_PATH);
  await page.waitForSelector('#js');
}

async function clickAndSettle(page: Page, selector: string): Promise<void> {
  await page.click(selector);
  // Girdiden sonraki kare ve çizim sonrası turu tamamlansın.
  await page.waitForTimeout(80);
}

const median = (values: readonly number[]): number => distribution([...values]).p50;

test.describe('çözümleme yardımcıları (yapay iz)', () => {
  const meta = (tid: number, name: string): TraceEvent => ({
    name: 'thread_name',
    ph: 'M',
    ts: 0,
    pid: 1,
    tid,
    args: { name },
  });
  const x = (name: string, ts: number, dur: number, tid = 1, args?: Record<string, unknown>) =>
    ({ name, ph: 'X', ts, dur, pid: 1, tid, args }) as TraceEvent;
  const begin = (ts: number, frameId: number): TraceEvent => ({
    name: 'BeginMainThreadFrame',
    ph: 'I',
    ts,
    pid: 1,
    tid: 1,
    args: { data: { frameId } },
  });

  test('aralık birleşimi iç içe ve bitişik aralıkları çift saymaz', () => {
    expect(
      unionIntervals([
        [0, 5],
        [1, 4],
        [5, 7],
        [10, 12],
      ]),
    ).toEqual([
      [0, 7],
      [10, 12],
    ]);
    expect(unionIntervals([])).toEqual([]);
  });

  test('aynı kareye atıf: JS, forced yerleşim, boyama ve commit; boşta kare sıfır', () => {
    const events: TraceEvent[] = [
      meta(1, 'CrRendererMain'),
      meta(2, 'Compositor'),
      // Kare 7: 5 ms olay (içinde 4 ms FunctionCall ve 2 ms zorlanmış yerleşim).
      x('EventDispatch', 5_000, 5_000, 1, { data: { type: 'click' } }),
      x('FunctionCall', 5_500, 4_000),
      x('Layout', 6_000, 2_000),
      begin(10_000, 7),
      x('UpdateLayoutTree', 10_100, 500),
      x('Paint', 11_000, 700),
      x('Commit', 12_000, 1_000),
      // Playwright'ın kendi araç olayı sayfa işi değildir: JS'e girmez.
      x('EventDispatch', 3_000, 1_500, 1, { data: { type: '__playwright_mark_target__' } }),
      // Ana iş parçacığı DIŞI olay: sayılmaz.
      x('EventDispatch', 8_000, 9_000, 2, { data: { type: 'ghost' } }),
      // Kare 8: boşta.
      begin(30_000, 8),
      x('Commit', 31_000, 400),
      // Commit'siz kare: atlanır.
      begin(90_000, 9),
    ];
    const [first, idle, ...rest] = attributeFrames(events);
    expect(rest).toEqual([]);
    expect(first.frameId).toBe(7);
    expect(first.jsGrossMs).toBeCloseTo(5);
    expect(first.layoutMs).toBeCloseTo(2);
    expect(first.styleMs).toBeCloseTo(0.5);
    expect(first.paintMs).toBeCloseTo(0.7);
    expect(first.commitMs).toBeCloseTo(1);
    expect(first.forcedMs).toBeCloseTo(2); // yerleşim 2 ms JS içinde; stil JS dışında
    expect(first.inputs).toEqual(['click']);
    expect(idle.frameId).toBe(8);
    expect([idle.jsGrossMs, idle.layoutMs, idle.styleMs, idle.paintMs]).toEqual([0, 0, 0, 0]);
    expect(idle.inputs).toEqual([]);
    expect(idle.windowStartMs).toBeCloseTo(13); // önceki commit sonu
  });

  test('girdi bağı: ilk kareye bağlanır, iz saati hizalanınca kare kimliği gelir', () => {
    const capture: PageCapture = {
      inputs: [
        { type: 'click', timeStamp: 100 },
        { type: 'keydown', timeStamp: 400 },
      ],
      frames: [
        { seq: 1, rafStart: 90, postPaint: 95 },
        { seq: 2, rafStart: 110, postPaint: 118 },
        { seq: 3, rafStart: 410, postPaint: 421 },
      ],
      syncMark: 50,
    };
    const frames: FrameAttribution[] = [
      { frameId: 7, windowStartMs: 1100, windowEndMs: 1130 },
      { frameId: 8, windowStartMs: 1400, windowEndMs: 1440 },
    ].map((frame) => ({
      ...frame,
      jsGrossMs: 0,
      styleMs: 0,
      layoutMs: 0,
      paintMs: 0,
      commitMs: 0,
      forcedMs: 0,
      inputs: [],
    }));
    const events: TraceEvent[] = [{ name: 'vol-probe-sync', ph: 'R', ts: 1_050_000 }];
    const offset = traceClockOffset(events, capture.syncMark);
    expect(offset).toBe(1000);
    expect(traceClockOffset([], 50)).toBeNull();
    expect(traceClockOffset(events, null)).toBeNull();
    const linked = linkInputs(capture, frames, offset);
    expect(linked.map((input) => [input.pageFrame, input.traceFrameId])).toEqual([
      [2, 7],
      [3, 8],
    ]);
    expect(linked.map((input) => input.inputToVisibleMs)).toEqual([18, 21]);
    // İz yoksa kare kimliği boş: uydurulmaz.
    expect(linkInputs(capture, null, null).every((input) => input.traceFrameId === null)).toBe(
      true,
    );
  });

  test('sunum durumu sayacı yalnız başlangıç olaylarını sayar', () => {
    const report = (state: string, ph = 'b'): TraceEvent => ({
      name: 'PipelineReporter',
      ph,
      ts: 0,
      args: { frame_reporter: { state } },
    });
    expect(
      pipelineStates([
        report('STATE_PRESENTED_ALL'),
        report('STATE_PRESENTED_ALL'),
        report('STATE_DROPPED'),
        report('STATE_DROPPED', 'e'),
      ]),
    ).toEqual({ STATE_PRESENTED_ALL: 2, STATE_DROPPED: 1 });
  });
});

test.describe('kalibrasyon fixture', () => {
  // Kalibrasyon, ÜRÜNÜ değil probun kendisini ölçer ve makine yükü altında (başsız zamanlama, 20 ms'lik
  // fark) sınır değerinde oynar; bağımsız fixture'da iki yeniden deneme ürün kusurunu gizlemez.
  test.describe.configure({ retries: 2 });

  test('girdi→görünür: her girdi tek bir kareye bağlanır, süre iş yükünden küçük olamaz', async ({
    page,
  }) => {
    await openFixture(page);
    for (let index = 0; index < 10; index += 1) await clickAndSettle(page, '#js');
    const capture = await readCapture(page);
    const linked = linkInputs(capture, null, null);
    const clicks = linked.filter((input) => input.type === 'click');
    expect(clicks.length).toBe(10);
    // Kare sırası artan ve girdi başına ayrı kare.
    const frameIds = clicks.map((input) => input.pageFrame);
    expect(new Set(frameIds).size).toBe(frameIds.length);
    expect([...frameIds].sort((a, b) => a - b)).toEqual(frameIds);
    for (const click of clicks) {
      expect(Number.isFinite(click.inputToVisibleMs)).toBe(true);
      // Meşgul bekleme 5 ms: görünür geri bildirim bundan önce olamaz.
      expect(click.inputToVisibleMs).toBeGreaterThanOrEqual(5);
    }
  });

  test('Chromium izi aynı kareye JS/yerleşim atfeder ve girdiyi kare kimliğine bağlar', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'iz yalnız Chromium CDP');
    await openFixture(page);
    const trace = await startTrace(page);
    expect(trace).not.toBeNull();
    await page.waitForTimeout(150);
    await markSync(page);
    for (let index = 0; index < 6; index += 1) await clickAndSettle(page, '#js');
    await clickAndSettle(page, '#layout');
    await page.waitForTimeout(150);
    const events = await trace!.stop();
    const capture = await readCapture(page);

    const frames = attributeFrames(events);
    expect(frames.length).toBeGreaterThan(5);
    // Kare kimlikleri tekil ve artan.
    const ids = frames.map((frame) => frame.frameId);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);

    const clickFrames = frames.filter((frame) => frame.inputs.includes('click'));
    const jsFrames = clickFrames.filter((frame) => frame.layoutMs < 0.5);
    expect(jsFrames.length).toBeGreaterThanOrEqual(5);
    for (const frame of jsFrames) {
      // Bilinen 5 ms yük: izden okunan JS 5 ms ile birkaç ms arasında.
      expect(frame.jsGrossMs).toBeGreaterThanOrEqual(5);
      expect(frame.jsGrossMs).toBeLessThan(5 + 4);
    }
    // Boşta karelerin medyanı JS'e yakın değil. Araç (Playwright) kendi eşzamanlı
    // betiklerini de çalıştırır ve bazı karelere 1-3 ms düşer; bu yüzden uç değil
    // medyan sınanır ve tıklama karelerinin boştan açıkça ayrıldığı doğrulanır.
    const idle = frames.filter((frame) => frame.inputs.length === 0);
    expect(idle.length).toBeGreaterThan(0);
    const idleMedian = median(idle.map((frame) => frame.jsGrossMs));
    expect(idleMedian).toBeLessThan(1);
    for (const frame of jsFrames) expect(frame.jsGrossMs - idleMedian).toBeGreaterThan(4);

    // Yerleşim düğmesi: yerleşim aynı karede ve JS içinde zorlanmış.
    const layoutFrame = clickFrames.find((frame) => frame.forcedMs > 0.2);
    expect(layoutFrame, 'zorlanmış yerleşim aynı karede bulunamadı').toBeDefined();
    expect(layoutFrame!.layoutMs).toBeGreaterThan(0.2);

    // Girdi → kare kimliği: tıklama, tıklamayı içeren iz karesine bağlanır.
    const offset = traceClockOffset(events, capture.syncMark);
    expect(offset, 'iz saati sayfa saatine hizalanamadı').not.toBeNull();
    const linked = linkInputs(capture, frames, offset).filter((input) => input.type === 'click');
    expect(linked.length).toBeGreaterThanOrEqual(7);
    const resolved = linked.filter((input) => input.traceFrameId !== null);
    expect(resolved.length).toBeGreaterThanOrEqual(linked.length - 1);
    for (const input of resolved) {
      const frame = frames.find((candidate) => candidate.frameId === input.traceFrameId)!;
      expect(frame.windowEndMs).toBeGreaterThan(frame.windowStartMs);
    }

    // Başsız ortamda sunum durumu sayacı yalnız gözlemdir, gerçek panel değildir.
    expect(Object.values(pipelineStates(events)).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  test('WebKit: iz desteklenmez (0 değil), sayfa katmanı çalışır', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', 'Chromium için iz testi ayrı');
    await openFixture(page);
    expect(await startTrace(page)).toBeNull();
    await clickAndSettle(page, '#js');
    const capture = await readCapture(page);
    expect(linkInputs(capture, null, null).length).toBeGreaterThan(0);
  });

  test('A/A gürültü ve iz maliyeti ölçülür; prob 20 ms iş farkını ayırt eder', async ({
    page,
    browserName,
  }, info) => {
    await openFixture(page);
    const measure = async (ms: number, count: number): Promise<number[]> => {
      await page.evaluate((value) => {
        document.getElementById('js')!.dataset.ms = String(value);
      }, ms);
      const before = (await readCapture(page)).inputs.length;
      for (let index = 0; index < count; index += 1) await clickAndSettle(page, '#js');
      const capture = await readCapture(page);
      const linked = linkInputs({ ...capture, inputs: capture.inputs.slice(before) }, null, null);
      return linked
        .filter((input) => input.type === 'click')
        .map((input) => input.inputToVisibleMs);
    };

    await measure(5, 4); // ısınma
    const a1 = await measure(5, 30);
    const a2 = await measure(5, 30);
    const noise = aaNoise(a1, a2);

    // Duyarlılık: 25 ms işi 5 ms işinden ayırt eder.
    const heavy = await measure(25, 30);
    // Ortalama kullanılır: 60 Hz'de görünür süre kare sınırına yuvarlanır ve 20 ms'lik fark (1,25 kare)
    // medyanda faz şansına bağlı 0–32 ms okunabilir; yuvarlama yanlısız olduğundan ortalama 20'ye yakınsar.
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const separation = mean(heavy) - mean([...a1, ...a2]);

    // İz maliyeti (yalnız Chromium): iz açıkken aynı yükün medyan görünür süresi.
    let traceOverheadMs: number | null = null;
    if (browserName === 'chromium') {
      const trace = await startTrace(page);
      const traced = await measure(5, 30);
      await trace!.stop();
      traceOverheadMs = mean(traced) - mean([...a1, ...a2]);
    }

    writeReport(`${info.project.name}-probe`, {
      note: 'tarayıcı probu kalibrasyonu: gürültü ve maliyet ms, başsız ortam; sunum değil',
      engine: info.project.name,
      traceSupported: browserName === 'chromium',
      workMs: { light: 5, heavy: 25 },
      aaNoiseMs: noise,
      traceOverheadMs,
      separationMs: separation,
      lightMedianMs: median([...a1, ...a2]),
      heavyMedianMs: median(heavy),
    });

    expect(Number.isFinite(noise)).toBe(true);
    // 20 ms'lik iş farkı, kalibre gürültünün ve (varsa) iz maliyetinin üstünde okunur.
    const resolution = Math.max(noise, Math.abs(traceOverheadMs ?? 0));
    if (browserName === 'chromium') {
      // İz var: fark büyüklüğü okunur (≈%72'si; 20 ms'lik işin görünür artışı 14–28 ms).
      expect(separation).toBeGreaterThan(20 - 8 - resolution);
    } else {
      // İz yok (WebKit): yalnız YÖN kanıtlanır; ağır iş hafif işten uzun okunur. Büyüklük bu motorda
      // kare sınırına ve olay damgasına bağlı kalır ve 20 ms olarak doğrulanamaz (rapor ölçüyü yazar).
      expect(separation).toBeGreaterThan(0);
    }
    expect(separation).toBeLessThan(20 + 8 + resolution);
    if (traceOverheadMs !== null) expect(Number.isFinite(traceOverheadMs)).toBe(true);
  });
});
