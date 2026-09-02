import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phaser.Game'in gerçek kurulumu (canvas/WebGL context, render loop) bu
// testin kapsamı dışında — burada yalnızca createVolGame'in DETERMINISTIC
// BOOT ORDER sözleşmesini (font yükleme -> onBeforeSceneInit -> Phaser.Game
// oluşturma) doğruluyoruz (bkz. GDD 17.3). Phaser modülü mock'lanır ki
// gerçek bir oyun örneği ayağa kalkmasın.
const gameConstructorCalls: unknown[] = [];

vi.mock('phaser', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('phaser');
  const actualDefault = actual.default as Record<string, unknown>;

  class FakeGame {
    events = { once: vi.fn() };
    constructor(config: unknown) {
      gameConstructorCalls.push(config);
    }
  }

  return {
    ...actual,
    default: {
      ...actualDefault,
      Game: FakeGame,
    },
  };
});

/**
 * Bu dosya vitest'in varsayılan 5000 ms test timeout'unu KENDİ BAŞINA aşabilir:
 * `vi.importActual('phaser')` gerçek Phaser modülünün transform edilmesini
 * gerektiriyor ve soğuk cache'te bu tek başına birkaç saniye sürüyor. Ölçülen
 * şey boot SIRASI, süresi değil — bu yüzden timeout dosya bazında yükseltildi.
 * (Mock'u Phaser'ı hiç yüklemeyecek şekilde daraltmak alternatifti; Game.ts
 * `Phaser.Game`, `Phaser.Core.Events` ve ViewportManager üzerinden `Phaser.Scale`
 * yüzeyine dokunuyor, elle taklit etmek testi gerçeğe daha uzak ve kırılgan yapardı.)
 */
const PHASER_TRANSFORM_TIMEOUT_MS = 20_000;

describe(
  'createVolGame — deterministic boot order',
  { timeout: PHASER_TRANSFORM_TIMEOUT_MS },
  () => {
    beforeEach(() => {
      gameConstructorCalls.length = 0;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('onBeforeSceneInit, Phaser.Game oluşturulmadan ÖNCE await edilir', async () => {
      const { createVolGame } = await import('../src/Game');
      const order: string[] = [];

      await createVolGame({
        width: 800,
        height: 600,
        scenes: [],
        fonts: [],
        onBeforeSceneInit: async () => {
          order.push('onBeforeSceneInit');
          await Promise.resolve();
        },
      });

      // Phaser.Game constructor'ı (mock) çağrıldığında order'a 'game' ekleyerek
      // sırayı netleştiriyoruz — aşağıda aynı testin ikinci varyantı.
      expect(order).toEqual(['onBeforeSceneInit']);
      expect(gameConstructorCalls).toHaveLength(1);
    });

    it('onBeforeSceneInit tamamlanmadan Phaser.Game kurulmaz (sıra garantisi)', async () => {
      const { createVolGame } = await import('../src/Game');
      const order: string[] = [];

      let resolveHook: () => void = () => {};
      const hookPromise = new Promise<void>((resolve) => {
        resolveHook = resolve;
      });

      let notifyHookStarted: () => void = () => {};
      const hookStarted = new Promise<void>((resolve) => {
        notifyHookStarted = resolve;
      });

      const gamePromise = createVolGame({
        width: 800,
        height: 600,
        scenes: [],
        fonts: [],
        onBeforeSceneInit: async () => {
          order.push('hook-start');
          notifyHookStarted();
          await hookPromise;
          order.push('hook-end');
        },
      });

      // Hook'un fiilen çağrıldığını bekle (font yükleme adımının kaç
      // microtask sürdüğüne bağlı sabit sayıda await yerine, hook'un
      // kendisinin verdiği sinyali bekliyoruz — böylece kırılgan değil).
      await hookStarted;
      expect(gameConstructorCalls).toHaveLength(0);
      expect(order).toEqual(['hook-start']);

      resolveHook();
      await gamePromise;

      expect(order).toEqual(['hook-start', 'hook-end']);
      expect(gameConstructorCalls).toHaveLength(1);
    });

    it('onBeforeSceneInit verilmezse Phaser.Game yine de kurulur (opsiyonel hook)', async () => {
      const { createVolGame } = await import('../src/Game');

      await createVolGame({ width: 800, height: 600, scenes: [], fonts: [] });

      expect(gameConstructorCalls).toHaveLength(1);
    });

    it('oyunun açık renderer kalite ayarlarını Phaser configine taşır', async () => {
      const { createVolGame } = await import('../src/Game');
      const render = {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        powerPreference: 'high-performance',
      };

      await createVolGame({ width: 800, height: 600, scenes: [], fonts: [], render });

      expect(gameConstructorCalls[0]).toMatchObject({ render });
    });

    it('onBeforeSceneInit reddedilirse (throw) oyun başlatılmaz', async () => {
      const { createVolGame } = await import('../src/Game');

      await expect(
        createVolGame({
          width: 800,
          height: 600,
          scenes: [],
          fonts: [],
          onBeforeSceneInit: () => {
            throw new Error('save yüklenemedi');
          },
        }),
      ).rejects.toThrow('save yüklenemedi');

      expect(gameConstructorCalls).toHaveLength(0);
    });

    it('geçersiz font ailesi verilirse Phaser.Game hiç kurulmadan hata fırlatılır', async () => {
      const { createVolGame } = await import('../src/Game');

      await expect(
        createVolGame({
          width: 800,
          height: 600,
          scenes: [],
          // @ts-expect-error kasıtlı geçersiz değer
          fonts: ['Olmayan Font'],
        }),
      ).rejects.toThrow('Geçersiz font ailesi');

      expect(gameConstructorCalls).toHaveLength(0);
    });
  },
);
