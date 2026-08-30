import { describe, it, expect, afterEach } from 'vitest';
import { ViewportManager } from '../../src/systems/ViewportManager';

/**
 * getConfig() ve attachResize() aynı DPR'yi görmek zorunda.
 * Ham devicePixelRatio kullanılırsa canvas'ın CSS boyutu (genişlik * zoom)
 * pencereyi taşar.
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

/** Phaser Scale.NONE'in resize/setZoom CSS sırasını gerekli kadarıyla taklit eder. */
function makeCssAwareFakeGame(
  initialWidth: number,
  initialHeight: number,
): {
  game: Parameters<ViewportManager['attachResize']>[0];
  canvas: HTMLCanvasElement;
} {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${initialWidth}px`;
  canvas.style.height = `${initialHeight}px`;

  let width = initialWidth;
  let height = initialHeight;
  let zoom = 1;

  const game = {
    canvas,
    scale: {
      resize: (nextWidth: number, nextHeight: number): void => {
        width = nextWidth;
        height = nextHeight;
        // Phaser Scale.NONE, zoom 1 iken mevcut inline style'ı yeniden yazmaz.
        if (zoom !== 1) {
          canvas.style.width = `${width * zoom}px`;
          canvas.style.height = `${height * zoom}px`;
        }
      },
      setZoom: (nextZoom: number): void => {
        zoom = nextZoom;
        canvas.style.width = `${width * zoom}px`;
        canvas.style.height = `${height * zoom}px`;
      },
    },
    scene: { getScenes: () => [] },
  } as unknown as Parameters<ViewportManager['attachResize']>[0];

  return { game, canvas };
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

  it('maxDpr sağlayıcısını her resize anında yeniden okur', () => {
    setEnvironment(3, 800, 600);
    let maxDpr = 1.5;
    const manager = new ViewportManager({ strategy: 'resize', maxDpr: () => maxDpr });
    expect(manager.getConfig().width).toBe(1200);

    const recorded = { width: 0, height: 0, zoom: NaN };
    const detach = manager.attachResize(makeFakeGame(recorded));
    maxDpr = 1;
    window.dispatchEvent(new Event('resize'));
    detach();

    expect(recorded.width).toBe(800);
    expect(recorded.height).toBe(600);
    expect(recorded.zoom).toBe(1);
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
    // DPR değiştiğinde zoom tazelenmeli; aksi halde canvas pencereyle uyuşmaz.
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

  it('yön değişiminde eski inline CSS boyutu yeni viewport oranına taşınmaz', () => {
    const manager = new ViewportManager({ strategy: 'resize' });
    const { game, canvas } = makeCssAwareFakeGame(1200, 760);
    const detach = manager.attachResize(game);

    setEnvironment(1, 760, 1100);
    window.dispatchEvent(new Event('resize'));
    detach();

    expect(canvas.style.width).toBe('760px');
    expect(canvas.style.height).toBe('1100px');
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

describe('ViewportManager — render ölçeği ve dünya ayrımı', () => {
  /** Kamera çağrılarını yakalayan sahte sahne. */
  function makeFakeScene() {
    const camera = {
      viewport: { x: 0, y: 0, width: 0, height: 0 },
      zoom: 1,
      center: { x: 0, y: 0 },
      setViewport(x: number, y: number, width: number, height: number) {
        camera.viewport = { x, y, width, height };
        return camera;
      },
      setZoom(value: number) {
        camera.zoom = value;
        return camera;
      },
      centerOn(x: number, y: number) {
        camera.center = { x, y };
        return camera;
      },
    };
    return { scene: { cameras: { main: camera } } as never, camera };
  }

  it("renderScale backing store'u küçültür ama CSS boyutu pencereyi korur", () => {
    setEnvironment(1, 1000, 800);
    const manager = new ViewportManager({ strategy: 'resize', renderScale: 0.5 });

    const config = manager.getConfig();

    // Rasterlenen piksel yarıya iner...
    expect(config.width).toBe(500);
    expect(config.height).toBe(400);
    // ...ama zoom bunu geri açar: canvas ekranda hâlâ 1000 CSS px.
    expect(config.width * (config.zoom ?? 1)).toBeCloseTo(1000, 10);
  });

  it('DÜNYA boyutu çözünürlükten bağımsızdır', () => {
    setEnvironment(3, 1600, 900);

    const high = new ViewportManager({ strategy: 'resize', maxDpr: 2, renderScale: 1 });
    const low = new ViewportManager({ strategy: 'resize', maxDpr: 1, renderScale: 0.7 });

    // Regresyon: dünya eskiden CİHAZ pikseliydi; 2x ekranda arena iki kat
    // genişliyor ve dünya birimi/saniye sabit olan oyuncu hızı yarıya
    // düşüyordu. Yani kalite ayarı OYNANIŞI değiştiriyordu.
    expect(high.getWorldSize()).toEqual(low.getWorldSize());
    expect(high.getWorldSize()).toEqual({ width: 1600, height: 900 });
  });

  it('kamera, rasterleme çarpanına eşit yakınlaştırma ile dünyayı sabitler', () => {
    setEnvironment(2, 1200, 600);
    const manager = new ViewportManager({ strategy: 'resize', maxDpr: 2, renderScale: 0.5 });
    const { scene, camera } = makeFakeScene();

    manager.applyToScene(scene);

    // quality = min(2,2) * 0.5 = 1 → backing 1200x600, zoom 1
    expect(camera.zoom).toBe(1);
    expect(camera.viewport).toEqual({ x: 0, y: 0, width: 1200, height: 600 });
    // Görünen dünya alanı = viewport / zoom = 1200x600 (CSS px)
    expect(camera.viewport.width / camera.zoom).toBe(1200);
    expect(camera.center).toEqual({ x: 600, y: 300 });
  });

  it('yüksek çarpanda da görünen dünya alanı DEĞİŞMEZ', () => {
    setEnvironment(3, 1000, 500);
    const manager = new ViewportManager({ strategy: 'resize', maxDpr: 3, renderScale: 1 });
    const { scene, camera } = makeFakeScene();

    manager.applyToScene(scene);

    expect(camera.zoom).toBe(3);
    expect(camera.viewport.width).toBe(3000);
    // 3000 / 3 = 1000 CSS px — 1x ekrandakiyle aynı dünya.
    expect(camera.viewport.width / camera.zoom).toBe(1000);
  });

  it('renderScale güvenli aralığa kelepçelenir', () => {
    setEnvironment(1, 800, 600);

    expect(new ViewportManager({ strategy: 'resize', renderScale: 0 }).resolveRenderQuality()).toBe(
      0.25,
    );
    expect(
      new ViewportManager({ strategy: 'resize', renderScale: -5 }).resolveRenderQuality(),
    ).toBe(0.25);
    expect(new ViewportManager({ strategy: 'resize', renderScale: 4 }).resolveRenderQuality()).toBe(
      1,
    );
    expect(
      new ViewportManager({ strategy: 'resize', renderScale: Number.NaN }).resolveRenderQuality(),
    ).toBe(1);
  });

  it('renderScale fonksiyon olarak verilince CANLI okunur', () => {
    setEnvironment(1, 1000, 1000);
    let scale = 1;
    const manager = new ViewportManager({ strategy: 'resize', renderScale: () => scale });

    expect(manager.getConfig().width).toBe(1000);
    scale = 0.5;
    expect(manager.getConfig().width).toBe(500);
  });

  it('resize sonrası kamera yeni çarpana göre yeniden kurulur', () => {
    setEnvironment(1, 1000, 800);
    let scale = 1;
    const manager = new ViewportManager({ strategy: 'resize', renderScale: () => scale });
    const recorded = { width: 0, height: 0, zoom: NaN };
    const { scene, camera } = makeFakeScene();
    const game = makeFakeGame(recorded);
    (game as unknown as { scene: { getScenes: () => unknown[] } }).scene = {
      getScenes: () => [scene],
    };

    const detach = manager.attachResize(game);
    scale = 0.5;
    window.dispatchEvent(new Event('resize'));

    expect(recorded.width).toBe(500);
    expect(recorded.zoom).toBeCloseTo(2, 10);
    expect(camera.zoom).toBe(0.5);
    // Dünya yine 1000 CSS px.
    expect(camera.viewport.width / camera.zoom).toBe(1000);
    detach();
  });

  it("'fit' stratejisinde kamera sözleşmesi uygulanmaz", () => {
    const manager = new ViewportManager({ strategy: 'fit', width: 800, height: 600 });
    const { scene, camera } = makeFakeScene();

    manager.applyToScene(scene);

    expect(camera.zoom).toBe(1);
    expect(camera.viewport).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
