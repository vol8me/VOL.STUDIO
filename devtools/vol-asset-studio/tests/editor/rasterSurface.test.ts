import { describe, expect, it } from 'vitest';
import { CommandHistory } from '@volstudio/core/ui';
import { RasterSurface, TILE_SIZE, type Rgba } from '../../src/editor/RasterSurface';
import { StrokeRecorder } from '../../src/editor/StrokeRecorder';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 };
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function filledRgba(width: number, height: number, color: Rgba): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color.r;
    rgba[i + 1] = color.g;
    rgba[i + 2] = color.b;
    rgba[i + 3] = color.a;
  }
  return rgba;
}

describe('RasterSurface — tembel tile deposu', () => {
  it('boş belge hiç tile tutmaz', () => {
    const surface = new RasterSurface(2048, 2048);

    expect(surface.tilesX).toBe(32);
    expect(surface.tilesY).toBe(32);
    expect(surface.residentTileCount).toBe(0);
  });

  it('tek piksel yalnız bir tile var eder', () => {
    const surface = new RasterSurface(2048, 2048);

    surface.setPixel(1000, 1000, RED);

    expect(surface.residentTileCount).toBe(1);
    expect(surface.getPixel(1000, 1000)).toEqual(RED);
  });

  it('saydam piksel yazımı tile ayırmaz', () => {
    const surface = new RasterSurface(128, 128);

    expect(surface.setPixel(10, 10, CLEAR)).toBe(false);
    expect(surface.residentTileCount).toBe(0);
  });

  it('değişmeyen yazım false döner', () => {
    const surface = new RasterSurface(64, 64);
    surface.setPixel(5, 5, RED);

    expect(surface.setPixel(5, 5, RED)).toBe(false);
    expect(surface.setPixel(5, 5, BLUE)).toBe(true);
  });

  it('sınır dışı erişim saydam döner ve yazmaz', () => {
    const surface = new RasterSurface(32, 32);

    expect(surface.setPixel(-1, 0, RED)).toBe(false);
    expect(surface.setPixel(32, 0, RED)).toBe(false);
    expect(surface.getPixel(99, 99)).toEqual(CLEAR);
    expect(surface.residentTileCount).toBe(0);
  });

  it('RGBA round-trip piksel özdeş kalır', () => {
    const width = 130;
    const height = 70;
    const source = filledRgba(width, height, RED);
    // Kenar tile'ları tam 64 değil: kısmi tile kopyalama burada kırılırdı.
    source[(69 * width + 129) * 4 + 2] = 200;

    const surface = RasterSurface.fromRgba(width, height, source);
    const round = surface.toRgba();

    expect(round.length).toBe(source.length);
    expect(Array.from(round)).toEqual(Array.from(source));
  });

  it('tümüyle saydam kaynakta hiç tile tutulmaz', () => {
    const surface = RasterSurface.fromRgba(256, 256, new Uint8ClampedArray(256 * 256 * 4));

    expect(surface.residentTileCount).toBe(0);
    expect(surface.toRgba().every((byte) => byte === 0)).toBe(true);
  });

  it('compact saydamlaşmış tileları bellekten düşürür', () => {
    const surface = new RasterSurface(128, 128);
    surface.setPixel(10, 10, RED);
    expect(surface.residentTileCount).toBe(1);

    surface.setPixel(10, 10, CLEAR);

    expect(surface.compact()).toBe(1);
    expect(surface.residentTileCount).toBe(0);
  });

  it('clone bağımsız kopya verir', () => {
    const surface = new RasterSurface(64, 64);
    surface.setPixel(1, 1, RED);
    const copy = surface.clone();

    copy.setPixel(1, 1, BLUE);

    expect(surface.getPixel(1, 1)).toEqual(RED);
    expect(copy.getPixel(1, 1)).toEqual(BLUE);
  });
});

describe('StrokeRecorder — gesture başına tek undo', () => {
  it('tek darbe tek komut üretir ve byte özdeş geri alır', () => {
    const surface = RasterSurface.fromRgba(128, 128, filledRgba(128, 128, RED));
    const original = surface.toRgba();
    const recorder = new StrokeRecorder(surface);

    for (let x = 0; x < 40; x += 1) recorder.setPixel(x, 10, BLUE);
    const command = recorder.toCommand({ label: 'kalem' });

    expect(command).not.toBeNull();
    expect(surface.getPixel(0, 10)).toEqual(BLUE);
    command?.revert();
    expect(Array.from(surface.toRgba())).toEqual(Array.from(original));
    command?.apply();
    expect(surface.getPixel(39, 10)).toEqual(BLUE);
  });

  it('hiçbir piksel değişmediyse komut üretmez', () => {
    const surface = RasterSurface.fromRgba(64, 64, filledRgba(64, 64, RED));
    const recorder = new StrokeRecorder(surface);

    recorder.setPixel(5, 5, RED); // aynı renk
    recorder.setPixel(-4, 5, BLUE); // sınır dışı

    expect(recorder.toCommand({ label: 'boş' })).toBeNull();
  });

  it('yalnız dokunulan tileların maliyetini sayar', () => {
    const surface = new RasterSurface(2048, 2048);
    const recorder = new StrokeRecorder(surface);

    recorder.setPixel(10, 10, RED);
    const command = recorder.toCommand({ label: 'nokta' });

    // Tek tile: saydam "önce" (null, maliyetsiz) + dolu "sonra" = 16 KiB.
    expect(recorder.touchedTileCount).toBe(1);
    expect(command?.byteCost).toBe(TILE_SIZE * TILE_SIZE * 4);
  });

  it('gesture ortasındaki ara durumlara değil BAŞLANGICA döner', () => {
    const surface = new RasterSurface(64, 64);
    const recorder = new StrokeRecorder(surface);

    recorder.setPixel(1, 1, RED);
    recorder.setPixel(1, 1, BLUE); // aynı gesture içinde ikinci yazım
    const command = recorder.toCommand({ label: 'çift yazım' });
    command?.revert();

    expect(surface.getPixel(1, 1)).toEqual(CLEAR);
  });

  it('CommandHistory ile undo/redo byte özdeşliği korur', () => {
    const surface = RasterSurface.fromRgba(128, 128, filledRgba(128, 128, RED));
    const history = new CommandHistory();
    const baseline = Array.from(surface.toRgba());

    const recorder = new StrokeRecorder(surface);
    for (let y = 0; y < 30; y += 1) recorder.setPixel(20, y, BLUE);
    const command = recorder.toCommand({ label: 'çizgi' });
    if (command) history.record(command);
    const painted = Array.from(surface.toRgba());

    expect(history.undo()).toBe(true);
    expect(Array.from(surface.toRgba())).toEqual(baseline);
    expect(history.redo()).toBe(true);
    expect(Array.from(surface.toRgba())).toEqual(painted);
  });
});
