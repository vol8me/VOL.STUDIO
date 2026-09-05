import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DiagnosticsSnapshot } from '../src/debug/types';
import type { DiagnosticsTransport } from '../src/debug/transport';

/**
 * Renderer SÖZLEŞMESİ.
 *
 * Phaser `AUTO` ile başlatıldığında WebGL kurulamıyorsa sessizce Canvas2D'ye
 * düşer. Vektör çizim ve partikül yükü altında bu, "oyun bu cihazda yavaş"
 * belirtisini sebebi görünmeden üretir — ölçüm aracı da hangi renderer'da
 * koştuğunu söylemezse soru cevaplanamaz kalır.
 *
 * Bu dosya iki şeyi kilitler: renderer AÇIKÇA seçilir ve geri düşüş RAPORLANIR.
 */
const gameConfigs: Record<string, unknown>[] = [];
let fakeRendererType: number | undefined;

vi.mock('phaser', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('phaser');
  const actualDefault = actual.default as Record<string, unknown>;

  class FakeGame {
    events = { once: vi.fn() };
    isBooted = true;
    renderer = { type: fakeRendererType };
    registry = { set: vi.fn() };
    constructor(config: Record<string, unknown>) {
      gameConfigs.push(config);
    }
  }

  return { ...actual, default: { ...actualDefault, Game: FakeGame } };
});

const PHASER_TRANSFORM_TIMEOUT_MS = 20_000;

/** Anlık görüntü yalnız transport'tan çıkar; test gerçek yolu kullanır. */
function captureTransport(): { transport: DiagnosticsTransport; last: () => DiagnosticsSnapshot } {
  let seen: DiagnosticsSnapshot | undefined;
  return {
    transport: {
      send(snapshot: DiagnosticsSnapshot) {
        seen = snapshot;
      },
    },
    last() {
      if (seen === undefined) throw new Error('anlık görüntü hiç gönderilmedi');
      return seen;
    },
  };
}

describe('renderer sözleşmesi', { timeout: PHASER_TRANSFORM_TIMEOUT_MS }, () => {
  beforeEach(() => {
    gameConfigs.length = 0;
    fakeRendererType = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderer tipi Phaser config`ine AÇIKÇA yazılır', async () => {
    const Phaser = (await import('phaser')).default;
    const { createVolGame } = await import('../src/Game');

    await createVolGame({ width: 320, height: 200, scenes: [] });
    expect(gameConfigs[0]?.type, 'varsayılan AUTO olmalı ve YAZILMIŞ olmalı').toBe(Phaser.AUTO);

    await createVolGame({ width: 320, height: 200, scenes: [], renderer: 'webgl' });
    expect(gameConfigs[1]?.type, 'webgl istendiğinde geri düşüş OLMAMALI').toBe(Phaser.WEBGL);
  });

  it('AUTO iken canvas`a düşülürse teşhis bunu GERİ DÜŞÜŞ olarak işaretler', async () => {
    const Phaser = (await import('phaser')).default;
    const { createVolGame } = await import('../src/Game');
    const { createDiagnostics } = await import('../src/debug/Diagnostics');

    fakeRendererType = Phaser.CANVAS;
    const capture = captureTransport();
    const diagnostics = createDiagnostics({
      gameId: 'test',
      overlay: false,
      sampleEvery: 1,
      transport: capture.transport,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await createVolGame({ width: 320, height: 200, scenes: [], diagnostics });

    diagnostics.beginFrame();
    diagnostics.endFrame();
    const snapshot = capture.last();
    expect(snapshot.renderer.kind).toBe('canvas');
    expect(snapshot.renderer.requested).toBe('auto');
    expect(snapshot.renderer.fellBack, 'sessiz geri düşüş işaretlenmeli').toBe(true);
    expect(warn, 'geri düşüş konsola da düşmeli').toHaveBeenCalled();

    diagnostics.destroy();
  });

  it('WebGL kurulduğunda geri düşüş İDDİA EDİLMEZ', async () => {
    const Phaser = (await import('phaser')).default;
    const { createVolGame } = await import('../src/Game');
    const { createDiagnostics } = await import('../src/debug/Diagnostics');

    fakeRendererType = Phaser.WEBGL;
    const capture = captureTransport();
    const diagnostics = createDiagnostics({
      gameId: 'test',
      overlay: false,
      sampleEvery: 1,
      transport: capture.transport,
    });
    await createVolGame({ width: 320, height: 200, scenes: [], diagnostics });

    diagnostics.beginFrame();
    diagnostics.endFrame();
    const snapshot = capture.last();
    expect(snapshot.renderer.kind).toBe('webgl');
    expect(snapshot.renderer.fellBack).toBe(false);

    diagnostics.destroy();
  });

  it('ölçülemediğinde `unknown` kalır — canvas ile KARIŞTIRILMAZ', async () => {
    const { createVolGame } = await import('../src/Game');
    const { createDiagnostics } = await import('../src/debug/Diagnostics');

    fakeRendererType = undefined; // Phaser taklidi / boot öncesi
    const capture = captureTransport();
    const diagnostics = createDiagnostics({
      gameId: 'test',
      overlay: false,
      sampleEvery: 1,
      transport: capture.transport,
    });
    await createVolGame({ width: 320, height: 200, scenes: [], diagnostics });

    diagnostics.beginFrame();
    diagnostics.endFrame();
    const snapshot = capture.last();
    expect(snapshot.renderer.kind).toBe('unknown');
    expect(snapshot.renderer.fellBack, 'ölçülememek geri düşüş DEĞİLDİR').toBe(false);

    diagnostics.destroy();
  });
});
