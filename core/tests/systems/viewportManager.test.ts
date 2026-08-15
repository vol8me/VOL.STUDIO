import { describe, it, expect, afterEach } from 'vitest';
import { ViewportManager } from '../../src/systems/ViewportManager';

/**
 * K2 regresyonu: getConfig() ve attachResize() aynı DPR'yi görmek zorunda.
 * Ham devicePixelRatio kullanılırsa canvas'ın CSS boyutu (genişlik * zoom)
 * pencereyi `rawDpr / maxDpr` oranında taşar.
 */
function setEnvironment(dpr: number, innerWidth: number, innerHeight: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
}

interface ResizeProbe {
  width: number;
  height: number;
  zoom: number;
}

/**
 * attachResize'ın game.scale.resize()/setZoom()'a geçirdiği değerleri yakalayan
 * minimal sahte Phaser.Game. `recorded.zoom` setZoom() ÇAĞRILMAZSA `NaN` kalır —
 * "zoom hiç güncellenmedi" durumunu ayrı bir değerden ayırt edebilmek için.
 */
function makeFakeGame(recorded: {
  width: number;
  height: number;
  zoom: number;
}): Parameters<ViewportManager['attachResize']>[0] {
  return {
    scale: {
      resize: (width: number, height: number): void => {
        recorded.width = width;
        recorded.height = height;
      },
      setZoom: (value: number): void => {
        recorded.zoom = value;
      },
    },
    scene: { getScenes: () => [] },
  } as unknown as Parameters<ViewportManager['attachResize']>[0];
}

afterEach(() => {
  setEnvironment(1, 1024, 768);
});

describe('ViewportManager — DPR kelepçesi', () => {
  it('K2: resize sonrası canvas CSS boyutu pencereyi taşmaz', () => {
    setEnvironment(3, 1000, 800);

    const manager = new ViewportManager({ strategy: 'resize', maxDpr: 1.5 });
    const config = manager.getConfig();

    // İlk açılış: 1000 * min(3, 1.5) = 1500, zoom = 1/1.5
    expect(config.width).toBe(1500);
    expect(config.zoom).toBeCloseTo(1 / 1.5, 10);

    const recorded = { width: 0, height: 0, zoom: NaN };
    const detach = manager.attachResize(makeFakeGame(recorded));
    window.dispatchEvent(new Event('resize'));
    detach();

    // TAZE zoom kullanılır (attachResize'ın o anda setZoom()'a geçirdiği
    // değer) — inşa anındaki `config.zoom` DEĞİL. DPR ilk açılıştan sonra
    // değişmiş olsaydı (bkz. aşağıdaki "tarayıcı yakınlaştırması" testi)
    // bu ikisi ayrışırdı.
    const probe: ResizeProbe = { ...recorded };

    // Kelepçe uygulanmasaydı 1000 * 3 = 3000 olur ve 2000px görünürdü.
    expect(probe.width).toBe(1500);
    expect(probe.width * probe.zoom).toBeCloseTo(window.innerWidth, 6);
    expect(probe.height * probe.zoom).toBeCloseTo(window.innerHeight, 6);
  });

  it('maxDpr verilmezse ham devicePixelRatio kullanılır', () => {
    setEnvironment(2, 800, 600);

    const manager = new ViewportManager({ strategy: 'resize' });
    expect(manager.getConfig().width).toBe(1600);

    const recorded = { width: 0, height: 0, zoom: NaN };
    const detach = manager.attachResize(makeFakeGame(recorded));
    window.dispatchEvent(new Event('resize'));
    detach();

    expect(recorded.width).toBe(1600);
  });

  it('detach sonrası resize dinleyicisi çalışmaz', () => {
    setEnvironment(1, 500, 500);

    const manager = new ViewportManager({ strategy: 'resize' });
    const recorded = { width: 0, height: 0, zoom: NaN };
    const detach = manager.attachResize(makeFakeGame(recorded));
    detach();

    window.dispatchEvent(new Event('resize'));
    expect(recorded.width).toBe(0);
  });

  it('tarayıcı yakınlaştırması (DPR değişimi) sonrası canvas CSS boyutu YİNE pencereyle eşleşir', () => {
    // Kök neden regresyonu: attachResize() eskiden yalnızca resize(w,h)
    // çağırıp zoom'u HİÇ güncellemiyordu. Game kurulduğu andaki DPR'de
    // sonsuza dek sabit kalan zoom, tarayıcı yakınlaştırması pencere
    // `resize` event'i tetikleyip DPR'yi değiştirdiğinde canvas'ın CSS
    // boyutunu pencereden koparıyordu — ekranda büyüyüp küçülen, pencereyi
    // takip etmeyen bir kutu olarak görünüyordu.
    setEnvironment(1, 1000, 800);
    const manager = new ViewportManager({ strategy: 'resize' });
    manager.getConfig(); // ilk açılış — zoom = 1/1 = 1

    const recorded = { width: 0, height: 0, zoom: NaN };
    const detach = manager.attachResize(makeFakeGame(recorded));

    // Kullanıcı sayfayı %300'e yakınlaştırıyor — DPR değişir, resize event'i ateşlenir.
    setEnvironment(3, 1000, 800);
    window.dispatchEvent(new Event('resize'));
    detach();

    // setZoom() TAZE dpr'ye göre çağrılmış olmalı (1/3), sabit ilk zoom (1) DEĞİL.
    expect(recorded.zoom).toBeCloseTo(1 / 3, 10);
    expect(recorded.width).toBe(3000);
    expect(recorded.width * recorded.zoom).toBeCloseTo(window.innerWidth, 6);
    expect(recorded.height * recorded.zoom).toBeCloseTo(window.innerHeight, 6);
  });

  it('negatif veya NaN maxDpr yok sayılır; ham DPR kullanılır', () => {
    setEnvironment(2, 800, 600);

    expect(new ViewportManager({ strategy: 'resize', maxDpr: -1 }).getConfig().zoom).toBe(1 / 2);
    expect(new ViewportManager({ strategy: 'resize', maxDpr: NaN }).getConfig().zoom).toBe(1 / 2);
    expect(new ViewportManager({ strategy: 'resize', maxDpr: 0 }).getConfig().zoom).toBe(1 / 2);
  });

  it('devicePixelRatio NaN/Infinity/negatif ise fallback DPR kullanılır', () => {
    setEnvironment(NaN, 800, 600);
    expect(new ViewportManager({ strategy: 'resize' }).getConfig().zoom).toBe(1);

    setEnvironment(Infinity, 800, 600);
    expect(new ViewportManager({ strategy: 'resize' }).getConfig().zoom).toBe(1);

    setEnvironment(-2, 800, 600);
    expect(new ViewportManager({ strategy: 'resize' }).getConfig().zoom).toBe(1);
  });

  it('resize modunda genişlik/yükseklik en az 1 olur', () => {
    setEnvironment(1, 0, 0);

    const config = new ViewportManager({ strategy: 'resize' }).getConfig();
    expect(config.width).toBeGreaterThanOrEqual(1);
    expect(config.height).toBeGreaterThanOrEqual(1);
  });
});
