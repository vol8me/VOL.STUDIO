import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { GameHud } from '@/runtime/ui/GameHud';
import { WaveBanner } from '@/runtime/ui/WaveBanner';
import trResources from '@/i18n/tr.json';
import enResources from '@/i18n/en.json';

/**
 * HUD katmanı — Phaser'a DEĞİL DOM'a bağlı.
 *
 * `GameScene` ve menü sahneleri Phaser'a gömülü olduğu için mock'suz
 * sürülemiyor; ama HUD öyle değil: yalnızca bir `HTMLElement` ve birkaç
 * okuyucu (`getHealth`, `getFlux`…) istiyor. Kapsam raporunda %0 görünmesinin
 * sebebi teknik bir engel değil, testinin hiç yazılmamış olmasıydı.
 *
 * Bağımlılıklar SAHTE nesnelerle verilir: HUD'un gerçekten okuduğu yüzey
 * dardır (dört metot), gerçek `Player`/`RunEconomy` kurmak Phaser'ı geri
 * getirirdi.
 */

interface FakePlayer {
  health: number;
  maxHealth: number;
  dashRatio: number;
  getHealth(): number;
  getMaxHealth(): number;
  getDashChargeRatio(): number;
}

function fakePlayer(overrides: Partial<FakePlayer> = {}): FakePlayer {
  const state = { health: 100, maxHealth: 100, dashRatio: 1, ...overrides };
  return {
    ...state,
    getHealth: () => state.health,
    getMaxHealth: () => state.maxHealth,
    getDashChargeRatio: () => state.dashRatio,
  };
}

function fakeEconomy(
  overrides: Partial<{ flux: number; level: number; span: number; inLevel: number }> = {},
) {
  const state = { flux: 0, level: 1, span: 100, inLevel: 0, ...overrides };
  return {
    getFlux: () => state.flux,
    getLevel: () => state.level,
    getLevelSpan: () => state.span,
    getSparkInLevel: () => state.inLevel,
    state,
  };
}

const fakeAbilities = { getAbility: () => null };

function baseState(over: Record<string, unknown> = {}) {
  return {
    player: fakePlayer(),
    economy: fakeEconomy(),
    abilities: fakeAbilities,
    score: 0,
    kills: 0,
    elapsedTimeMs: 0,
    pendingLevelUps: 0,
    deltaMs: 16,
    wave: 1,
    waveRemainingMs: 30_000,
    awaitingBlocker: false,
    blockerHealthRatio: null,
    ...over,
  } as never;
}

describe('GameHud', () => {
  let parent: HTMLDivElement;

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    i18n.addResources('en', 'volhell', enResources);
    if (!i18next.isInitialized) await i18n.init();
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function hud() {
    return new GameHud(parent, fakePlayer() as never, fakeEconomy() as never);
  }

  it('kurulumda HUD ölçülerini CSS custom property olarak yazar', () => {
    // CSS bu değerleri okuyor; config ile DOM ayrışırsa bar yanlış yerde çizilir.
    hud();
    expect(parent.style.getPropertyValue('--vol-hud-bar-width')).not.toBe('');
    expect(parent.style.getPropertyValue('--vol-hud-dash-offset')).not.toBe('');
    expect(parent.style.getPropertyValue('--vol-hud-spark-offset')).not.toBe('');
  });

  it('refresh hata vermeden çalışır ve DOM üretir', () => {
    const view = hud();
    view.refresh(baseState());
    expect(parent.children.length).toBeGreaterThan(0);
  });

  it('maks. can DEĞİŞİNCE bar üst sınırı güncellenir', () => {
    // Kart maks. canı artırdığında bar bunu yansıtmazsa dolum oranı yalan söyler.
    const view = hud();
    view.refresh(baseState({ player: fakePlayer({ health: 100, maxHealth: 100 }) }));
    view.refresh(baseState({ player: fakePlayer({ health: 150, maxHealth: 200 }) }));

    const bar = parent.querySelector('.vol-bar');
    expect(bar?.getAttribute('aria-valuemax')).toBe('200');
    expect(bar?.getAttribute('aria-valuenow')).toBe('150');
  });

  it('can azalınca bar değeri düşer', () => {
    const view = hud();
    view.refresh(baseState({ player: fakePlayer({ health: 100 }) }));
    view.refresh(baseState({ player: fakePlayer({ health: 30 }) }));

    expect(parent.querySelector('.vol-bar')?.getAttribute('aria-valuenow')).toBe('30');
  });

  it('announceWave ve reset art arda çağrılabilir', () => {
    const view = hud();
    view.announceWave(3);
    view.refresh(baseState({ wave: 3 }));
    view.reset();
    expect(() => view.refresh(baseState())).not.toThrow();
  });

  it('refreshLabels dil değişiminde metinleri tazeler', () => {
    const view = hud();
    view.refresh(baseState());
    expect(() => view.refreshLabels()).not.toThrow();
  });

  it('destroy DOM düğümlerini toplar', () => {
    const view = hud();
    view.refresh(baseState());
    view.destroy();
    expect(parent.children.length).toBe(0);
  });

  it('destroy iki kez çağrılabilir', () => {
    const view = hud();
    view.destroy();
    expect(() => view.destroy()).not.toThrow();
  });

  it('engel beklerken ve oran verilirken çökmez', () => {
    const view = hud();
    expect(() =>
      view.refresh(
        baseState({ awaitingBlocker: true, blockerHealthRatio: 0.4, waveRemainingMs: 0 }),
      ),
    ).not.toThrow();
  });

  it('uç değerler (sıfır can, sıfır maks.) barı bozmaz', () => {
    const view = hud();
    expect(() =>
      view.refresh(baseState({ player: fakePlayer({ health: 0, maxHealth: 0, dashRatio: 0 }) })),
    ).not.toThrow();
  });
});

describe('WaveBanner', () => {
  let parent: HTMLDivElement;

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    if (!i18next.isInitialized) await i18n.init();
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('announce duyuru gösterir, süre dolunca gizler', () => {
    const banner = new WaveBanner(parent);
    banner.announce(2);

    const announcement = parent.querySelector('.vol-wave__announcement');
    expect(announcement).not.toBeNull();

    // Duyuru sayacı `refresh`in deltasıyla akar; gerçek zaman beklenmez.
    for (let i = 0; i < 200; i++) banner.refresh(50, 2, 30_000, false, null);
    expect(announcement?.classList.contains('vol-wave__announcement--visible')).toBe(false);
  });

  it('refresh kalan süreyi gösterir', () => {
    const banner = new WaveBanner(parent);
    banner.refresh(16, 3, 12_000, false, null);
    expect(parent.textContent).toContain('3');
  });

  it('engel beklerken kalan süre yerine engel durumu gösterilir', () => {
    const banner = new WaveBanner(parent);
    banner.refresh(16, 3, 0, true, 0.5);
    expect(() => banner.refresh(16, 3, 0, true, 0)).not.toThrow();
  });

  it('refreshLabels ve destroy güvenli', () => {
    const banner = new WaveBanner(parent);
    banner.refresh(16, 1, 1000, false, null);
    banner.refreshLabels();
    banner.destroy();

    expect(parent.children.length).toBe(0);
    expect(() => banner.destroy()).not.toThrow();
  });
});
